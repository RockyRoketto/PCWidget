package main

import (
	"context"
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
// Окна живут в своём потоке: виджет в это время продолжает работать.
func offerUpdate() {
	updater.mu.Lock()
	r := updater.found
	updater.mu.Unlock()
	if r.Version == "" || dlgOpen.Load() > 0 {
		return
	}
	if !installed() { // запущен без установки: заменять нечего, показываем страницу
		openProjectPage(repoURL + "/releases/latest")
		return
	}
	if updater.begin("Обновление…") {
		go runUpdate(r)
	}
}

func runUpdate(r release) {
	text := "Сейчас стоит " + appVersion + ". Виджет скачает новую версию с GitHub и перезапустится. Настройки сохранятся."
	if !askDialog("Вышла версия "+r.Version+". Обновить?", text, "Обновить") {
		endUpdate("")
		return
	}
	var path string
	err := progressDialog("Скачиваю PC Widget "+r.Version, "Соединяюсь с GitHub…", true,
		func(ctx context.Context, p *progress) (err error) {
			path, err = download(ctx, r, func(done, total int64) {
				p.say(downloadText(done, total))
				if total > 0 {
					p.percent(int(done * 100 / total))
				}
			})
			return err
		})
	if errors.Is(err, context.Canceled) {
		endUpdate("")
		return
	}
	if err == nil {
		started := make(chan error, 1)
		runOnUI(func() { started <- startUpdate(path) })
		err = <-started
	}
	if err != nil {
		endUpdate("Не удалось обновить")
		infoDialog("Не удалось обновить", err.Error()+"\n\nНовую версию можно скачать вручную: "+repoURL+"/releases/latest")
	}
}

// endUpdate освобождает службу и задаёт подпись в «О программе».
func endUpdate(note string) {
	updater.mu.Lock()
	updater.busy, updater.note = false, note
	updater.mu.Unlock()
	runOnUI(sendSys)
}

// startUpdate запускает скачанный установщик и закрывает виджет. Только в потоке UI.
func startUpdate(path string) error {
	c := exec.Command(path, "--install")
	c.Dir = filepath.Dir(path)
	app.settings.save()
	if err := c.Start(); err != nil {
		return err
	}
	pDestroyWindow.Call(app.hwnd) // новая копия заменит файл и запустится
	return nil
}

func updateDir() string { return filepath.Join(installDir(os.Getenv("ProgramFiles")), "update") }

// download качает exe выпуска и сверяет контрольную сумму; несовпавший файл стирается.
// step получает ход загрузки не чаще пяти раз в секунду.
func download(ctx context.Context, r release, step func(done, total int64)) (string, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.URL, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
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
	count := &counter{total: resp.ContentLength, step: step}
	_, err = io.Copy(io.MultiWriter(f, h, count), io.LimitReader(resp.Body, updateMax))
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

// counter считает скачанное и изредка сообщает о нём.
type counter struct {
	done, total int64
	last        time.Time
	step        func(done, total int64)
}

func (c *counter) Write(b []byte) (int, error) {
	c.done += int64(len(b))
	if time.Since(c.last) >= 200*time.Millisecond || c.done == c.total {
		c.last = time.Now()
		c.step(c.done, c.total)
	}
	return len(b), nil
}

// cleanUpdate убирает скачанный файл после обновления (установщик может ещё завершаться).
func cleanUpdate() {
	if !installed() {
		return
	}
	time.Sleep(10 * time.Second)
	_ = os.RemoveAll(updateDir())
}
