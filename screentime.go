package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// «Куда ушёл день»: сколько секунд за сегодня каждая программа была на переднем плане.
// Хранятся только название, значок и секунды: ни путей, ни заголовков окон.

// DayStat — то, что уходит в страницу: всего за день и самые долгие программы.
type DayStat struct {
	Total int      `json:"total"` // секунды
	Apps  []DayApp `json:"apps"`
}

type DayApp struct {
	Name string `json:"name"`
	Sec  int    `json:"sec"`
	// Icon — номер значка; картинку страница просит сообщением «day:icon:<номер>», 0 = значка нет.
	Icon int `json:"icon,omitempty"`
}

const (
	dayTop  = 12  // столько программ уходит в страницу
	dayIdle = 300 // секунд без мыши и клавиатуры, после которых считаем, что за ПК никого
)

type dayEntry struct {
	Sec  float64 `json:"sec"`
	Icon string  `json:"icon,omitempty"` // PNG в base64
	num  int
}

// dayLog хранится в %APPDATA%\pcwidget\day.json.
type dayLog struct {
	Day   string               `json:"day"`
	Apps  map[string]*dayEntry `json:"apps"`
	nums  int                  // последний выданный номер значка
	dirty bool
}

// dayCounts: идёт ли время. Без ввода считаем, только если экран занят не зря:
// игра с геймпада и видео мышь не трогают, но держат экран включённым или развёрнуты на весь экран.
func dayCounts(idle int64, keepsDisplay, fullscreen bool) bool {
	return idle < dayIdle || keepsDisplay || fullscreen
}

// shellExe — части самой Windows: стол, пуск, поиск, экран блокировки. Это не «куда ушёл день».
var shellExe = map[string]bool{
	"lockapp.exe": true, "logonui.exe": true, "searchhost.exe": true, "searchapp.exe": true,
	"startmenuexperiencehost.exe": true, "shellexperiencehost.exe": true, "shellhost.exe": true,
	"textinputhost.exe": true,
}

// shellWindow: окно стола или панели задач (их держит explorer, как и обычные папки).
func shellWindow(class string) bool {
	switch class {
	case "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow",
		"TopLevelWindowForOverflowXamlIsland", "XamlExplorerHostIslandWindow", "MultitaskingViewFrame":
		return true
	}
	return false
}

func skipApp(exe, class string) bool {
	return shellExe[strings.ToLower(exe)] || shellWindow(class)
}

// roll обнуляет счёт при смене даты.
func (l *dayLog) roll(now time.Time) {
	d := now.Format("2006-01-02")
	if l.Day == d && l.Apps != nil {
		return
	}
	l.Day, l.Apps, l.dirty = d, map[string]*dayEntry{}, true
}

// add прибавляет программе время. Значок запоминается, когда появился.
func (l *dayLog) add(now time.Time, name, icon string, sec float64) {
	l.roll(now)
	if name == "" || sec <= 0 {
		return
	}
	e := l.Apps[name]
	if e == nil {
		e = &dayEntry{}
		l.Apps[name] = e
	}
	e.Sec += sec
	if e.Icon == "" { // первый значок дня остаётся: у одной программы бывает несколько exe
		e.Icon = icon
	}
	l.dirty = true
}

func (l *dayLog) iconNum(e *dayEntry) int {
	if e.Icon == "" {
		return 0
	}
	if e.num == 0 {
		l.nums++
		e.num = l.nums
	}
	return e.num
}

func (l *dayLog) icon(num int) string {
	for _, e := range l.Apps {
		if e.num == num && num > 0 {
			return e.Icon
		}
	}
	return ""
}

// stat: nil, пока за сегодня нет ни одной целой секунды.
func (l *dayLog) stat(now time.Time) *DayStat {
	l.roll(now)
	names := make([]string, 0, len(l.Apps))
	total := 0.0
	for n, e := range l.Apps {
		total += e.Sec
		if e.Sec >= 1 {
			names = append(names, n)
		}
	}
	if len(names) == 0 {
		return nil
	}
	slices.SortFunc(names, func(a, b string) int {
		if x, y := int(l.Apps[a].Sec), int(l.Apps[b].Sec); x != y {
			return y - x
		}
		return strings.Compare(a, b)
	})
	s := &DayStat{Total: int(total)}
	for _, n := range names[:min(len(names), dayTop)] {
		e := l.Apps[n]
		s.Apps = append(s.Apps, DayApp{Name: n, Sec: int(e.Sec), Icon: l.iconNum(e)})
	}
	return s
}

// exeFile — имя файла из пути.
func exeFile(path string) string { return path[strings.LastIndexAny(path, `\/`)+1:] }

// dayIconJS — вызов страницы со значком; картинка идёт строкой base64 из нашего же файла.
func dayIconJS(num int, icon string) string {
	url := ""
	if icon != "" {
		url = "data:image/png;base64," + icon
	}
	b, _ := json.Marshal([]any{num, url})
	return "window.__dayIcon&&window.__dayIcon.apply(null," + string(b) + ")"
}

func dayPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "pcwidget", "day.json")
}

func loadDay(path string) *dayLog {
	l := &dayLog{}
	if b, err := os.ReadFile(path); err == nil && json.Unmarshal(b, l) != nil {
		l = &dayLog{}
	}
	for n, e := range l.Apps {
		if e == nil {
			delete(l.Apps, n)
		}
	}
	return l
}

func (l *dayLog) save(path string) {
	if !l.dirty || os.MkdirAll(filepath.Dir(path), 0o755) != nil {
		return
	}
	if b, err := json.Marshal(l); err == nil {
		tmp := path + ".tmp"
		if os.WriteFile(tmp, b, 0o644) == nil && os.Rename(tmp, path) == nil {
			l.dirty = false
		}
	}
}
