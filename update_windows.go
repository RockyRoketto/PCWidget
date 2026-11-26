package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

// Проверка новых версий на GitHub и обновление по согласию. Скачанное кладётся в папку установки
// (писать туда может только админ, подменить файл между проверкой и запуском нельзя).

const (
	updateFirst = 20 * time.Second
	updateEvery = 6 * time.Hour
	updateMax   = 100 << 20
)

type updateService struct {
	mu    sync.Mutex
	on    bool
	found release // пусто, пока нового нет
	busy  bool
	note  string // что показать в «О программе»
	kick  chan struct{}
}

var updater = &updateService{on: true, kick: make(chan struct{}, 1)}

// state — для страниц: новая версия, идёт ли работа и подпись.
func (u *updateService) state() (ver string, busy bool, note string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.found.Version, u.busy, u.note
}

func (u *updateService) setOn(on bool) {
	u.mu.Lock()
	changed := u.on != on
	u.on = on
	u.mu.Unlock()
	if changed && on {
		select {
		case u.kick <- struct{}{}:
		default:
		}
	}
}

// run проверяет вскоре после запуска, потом раз в несколько часов.
func (u *updateService) run() {
	wait := time.After(updateFirst)
	for {
		select {
		case <-wait:
		case <-u.kick:
		}
		u.mu.Lock()
		on := u.on
		u.mu.Unlock()
		if on {
			u.check(false)
		}
		wait = time.After(updateEvery)
	}
}

// check спрашивает GitHub. manual: нажата кнопка, тогда сообщаем и «новых нет», и ошибку.
func (u *updateService) check(manual bool) {
	if manual && !u.begin("Проверяю…") {
		return
	}
	b, err := httpGet(latestAPI)
	var r release
	if err == nil {
		r, err = parseRelease(b)
	}
	u.mu.Lock()
	note := ""
	switch {
	case err != nil:
		logf("обновления: %v", err)
		note = "Не удалось проверить"
	case newerVersion(r.Version, appVersion):
		u.found = r
	default:
		u.found = release{}
		note = "Это последняя версия"
	}
	if manual {
		u.busy, u.note = false, note
	}
	u.mu.Unlock()
	runOnUI(sendSys)
}

// begin занимает службу под долгое действие; false — уже занята.
func (u *updateService) begin(note string) bool {
	u.mu.Lock()
	ok := !u.busy
	if ok {
		u.busy, u.note = true, note
	}
	u.mu.Unlock()
	if ok {
		runOnUI(sendSys)
	}
	return ok
}

// offerUpdate — щелчок по значку или кнопке «Обновить». Звать только через runOnUI.
func offerUpdate() {
	updater.mu.Lock()
	r, busy := updater.found, updater.busy
	updater.mu.Unlock()
	if r.Version == "" || busy {
		return
	}
	if !installed() { // запущен без установки: заменять нечего, показываем страницу
		openProjectPage(repoURL + "/releases/latest")
		return
	}
	text := "Вышла версия " + r.Version + " (сейчас " + appVersion + "). Обновить?\n\nВиджет скачает её с GitHub и перезапустится. Настройки сохранятся."
	if msgBox(text, windows.MB_YESNO|windows.MB_ICONQUESTION) != idYes || !updater.begin("Скачиваю…") {
		return
	}
	go func() {
		path, err := download(r)
		runOnUI(func() { finishUpdate(path, err) })
	}()
}

func finishUpdate(path string, err error) {
	if err == nil {
		c := exec.Command(path, "--install")
		c.Dir = filepath.Dir(path)
		app.settings.save()
		err = c.Start()
	}
	if err != nil {
		updater.mu.Lock()
		updater.busy, updater.note = false, "Не удалось обновить"
		updater.mu.Unlock()
		sendSys()
		msgBox("Не удалось обновить: "+err.Error(), windows.MB_OK|windows.MB_ICONWARNING)
		return
	}
	pDestroyWindow.Call(app.hwnd) // новая копия заменит файл и запустится
}

func updateDir() string { return filepath.Join(installDir(os.Getenv("ProgramFiles")), "update") }

// download качает exe выпуска и сверяет контрольную сумму; несовпавший файл стирается.
func download(r release) (string, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(r.URL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", errors.New("HTTP " + resp.Status)
	}
	if err := os.MkdirAll(updateDir(), 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(updateDir(), "widget-"+r.SHA256[:12]+".exe")
	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	_, err = io.Copy(io.MultiWriter(f, h), io.LimitReader(resp.Body, updateMax))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil && hex.EncodeToString(h.Sum(nil)) != r.SHA256 {
		err = errors.New("контрольная сумма не совпала")
	}
	if err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

// cleanUpdate убирает скачанный файл после обновления (установщик может ещё завершаться).
func cleanUpdate() {
	if !installed() {
		return
	}
	time.Sleep(10 * time.Second)
	_ = os.RemoveAll(updateDir())
}
