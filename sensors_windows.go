package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// sensorHub держит помощника LibreHardwareMonitor (отдельный процесс helper.exe) и последние показания CPU.
// Нет lhm.zip в сборке, не получилось собрать или запустить помощника, нет драйвера: показаний просто нет.
type sensorHub struct {
	mu     sync.Mutex
	last   cpuReadings
	lastAt time.Time
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stop   chan struct{}
	ready  bool // помощник запущен и отвечает
}

const pawnKey = `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO`

// pawnInstalled: драйвер PawnIO нужен LibreHardwareMonitor 0.9.6 для температуры и мощности CPU.
func pawnInstalled() bool {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, pawnKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	k.Close()
	return true
}

func startSensors() *sensorHub {
	h := &sensorHub{stop: make(chan struct{})}
	go h.run()
	return h
}

func (h *sensorHub) cpu() cpuReadings {
	if h == nil {
		return cpuReadings{}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if time.Since(h.lastAt) > 5*time.Second {
		return cpuReadings{}
	}
	return h.last
}

func (h *sensorHub) available() bool {
	if h == nil {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.ready
}

func (h *sensorHub) close() {
	if h == nil {
		return
	}
	select {
	case <-h.stop:
	default:
		close(h.stop)
	}
	h.kill()
}

func (h *sensorHub) kill() {
	h.mu.Lock()
	cmd, in := h.cmd, h.stdin
	h.cmd, h.stdin, h.ready = nil, nil, false
	h.mu.Unlock()
	if in != nil {
		in.Close() // помощник выходит, когда stdin закрыт
	}
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

// restart перезапускает помощника (после установки драйвера).
func (h *sensorHub) restart() { h.kill() }

// run готовит помощника и держит его запущенным. Быстрая смерть (нет прав и т. п.) — паузы между попытками растут.
func (h *sensorHub) run() {
	exe := prepareHelper()
	if exe == "" {
		return
	}
	delay := 5 * time.Second
	for {
		started := time.Now()
		h.runOnce(exe)
		select {
		case <-h.stop:
			return
		default:
		}
		if time.Since(started) > 30*time.Second {
			delay = 5 * time.Second
		} else if delay < 2*time.Minute {
			delay *= 2
		}
		select {
		case <-h.stop:
			return
		case <-time.After(delay):
		}
	}
}

func (h *sensorHub) runOnce(exe string) {
	cmd := exec.Command(exe)
	cmd.Dir = filepath.Dir(exe)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	in, err := cmd.StdinPipe()
	if err != nil {
		return
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return
	}
	if err := cmd.Start(); err != nil {
		logf("helper start: %v", err)
		return
	}
	h.mu.Lock()
	h.cmd, h.stdin = cmd, in
	h.mu.Unlock()
	sc := bufio.NewScanner(out)
	sc.Buffer(make([]byte, 64*1024), 1<<20)
	for sc.Scan() {
		r := pickCPU(parseSensors(sc.Text()))
		h.mu.Lock()
		h.last, h.lastAt, h.ready = r, time.Now(), true
		h.mu.Unlock()
	}
	_ = cmd.Wait()
	h.mu.Lock()
	h.ready = false
	h.mu.Unlock()
}

// prepareHelper распаковывает библиотеку из lhm.zip (вшита в exe) и один раз на версию собирает helper.exe
// штатным компилятором Windows. Возвращает путь к helper.exe или "".
func prepareHelper() string {
	zipData, err := assetsFS.ReadFile("assets/lhm.zip")
	if err != nil {
		logf("sensors: нет assets/lhm.zip (scripts/fetch-lhm.ps1)")
		return ""
	}
	src, err := assetsFS.ReadFile("assets/helper.cs")
	if err != nil {
		return ""
	}
	sum := sha256.New()
	sum.Write(zipData)
	sum.Write(src)
	dir := filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "lhm-"+hex.EncodeToString(sum.Sum(nil))[:10])
	exe := filepath.Join(dir, "helper.exe")
	if _, err := os.Stat(exe); err == nil {
		return exe
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return ""
	}
	zr, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return ""
	}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return ""
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil || os.WriteFile(filepath.Join(dir, filepath.Base(f.Name)), b, 0o644) != nil {
			return ""
		}
	}
	csFile := filepath.Join(dir, "helper.cs")
	if os.WriteFile(csFile, src, 0o644) != nil {
		return ""
	}
	csc := filepath.Join(os.Getenv("WINDIR"), `Microsoft.NET\Framework64\v4.0.30319\csc.exe`)
	c := exec.Command(csc, "/nologo", "/optimize", "/platform:x64", "/out:helper.exe",
		"/reference:LibreHardwareMonitorLib.dll", "helper.cs")
	c.Dir = dir
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	if out, err := c.CombinedOutput(); err != nil {
		logf("csc: %v %s", err, out)
		return ""
	}
	cleanOldHelpers(filepath.Dir(dir), filepath.Base(dir))
	return exe
}

// cleanOldHelpers удаляет папки помощника от прошлых версий.
func cleanOldHelpers(parent, keep string) {
	ents, _ := os.ReadDir(parent)
	for _, e := range ents {
		if e.IsDir() && len(e.Name()) > 4 && e.Name()[:4] == "lhm-" && e.Name() != keep {
			_ = os.RemoveAll(filepath.Join(parent, e.Name()))
		}
	}
}

// installPawnIO ставит драйвер через winget (после подтверждения в окне) и перезапускает помощника.
func installPawnIO(h *sensorHub) {
	if !askPawnIO() {
		return
	}
	go func() {
		logf("pawnio install: %v", runPawnIOInstall())
		h.restart()
	}()
}

// askPawnIO спрашивает согласие на установку драйвера (он режима ядра, поэтому только с явным «Да»).
func askPawnIO() bool {
	return askDialog("Поставить драйвер для датчиков процессора?",
		"Для температуры и мощности процессора нужен драйвер PawnIO (подписанный драйвер режима ядра, "+
			"open source). Он ставится через winget и работает в системе постоянно; убрать его можно в «Приложениях и возможностях».",
		"Поставить")
}

// runPawnIOInstall ставит драйвер и ждёт окончания.
func runPawnIOInstall() error {
	return runHidden("winget.exe", "install", "-e", "--id", "namazso.PawnIO", "--silent",
		"--accept-package-agreements", "--accept-source-agreements")
}
