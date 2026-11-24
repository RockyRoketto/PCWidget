package main

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// gpuReader держит один долгоживущий процесс nvidia-smi -l 1 и хранит последнюю строку.
type gpuReader struct {
	mu   sync.Mutex
	last GPUStat
	at   time.Time
}

func findNvidiaSmi() string {
	if p, err := exec.LookPath("nvidia-smi"); err == nil {
		return p
	}
	for _, p := range []string{
		filepath.Join(os.Getenv("SystemRoot"), "System32", "nvidia-smi.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// startGPU возвращает nil, если nvidia-smi не найден (плитка GPU тогда скрыта).
func startGPU() *gpuReader {
	exe := findNvidiaSmi()
	if exe == "" {
		return nil
	}
	g := &gpuReader{}
	go func() {
		for {
			g.run(exe)
			time.Sleep(5 * time.Second) // процесс умер: перезапуск через 5 секунд
		}
	}()
	return g
}

func (g *gpuReader) run(exe string) {
	cmd := exec.Command(exe, "--query-gpu="+gpuQuery, "--format=csv,noheader,nounits", "-l", "1")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	out, err := cmd.StdoutPipe()
	if err != nil || cmd.Start() != nil {
		return
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	sc := bufio.NewScanner(out)
	for sc.Scan() {
		if s, ok := parseGPULine(sc.Text()); ok {
			g.mu.Lock()
			g.last, g.at = s, time.Now()
			g.mu.Unlock()
		}
	}
}

// get возвращает последний снимок, если он не старше 5 секунд.
func (g *gpuReader) get() *GPUStat {
	if g == nil {
		return nil
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if time.Since(g.at) > 5*time.Second {
		return nil
	}
	s := g.last
	return &s
}
