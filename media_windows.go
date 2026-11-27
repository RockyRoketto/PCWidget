package main

import (
	"encoding/json"
	"runtime"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Плитка «Сейчас играет»: GlobalSystemMediaTransportControlsSessionManager (Windows 10 1809+).
// Опрос раз в секунду и только пока плитка включена; при выключении менеджер отпускается.

const (
	mediaEvery  = time.Second
	mediaOthers = 3 * time.Second // названия у остальных источников (для списка) реже
	mediaArtMax = 4 << 20
	smtcClass   = "Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager"
	ftUnixDelta = 116444736000000000 // FILETIME 1970-01-01
)

var (
	iidSmtcStatics  = windows.GUID{Data1: 0x2050c4ee, Data2: 0x11a0, Data3: 0x57de, Data4: [8]byte{0xae, 0xd7, 0xc9, 0x7c, 0x70, 0x33, 0x82, 0x45}}
	iidContentType  = windows.GUID{Data1: 0x97d098a5, Data2: 0x3b99, Data3: 0x4de9, Data4: [8]byte{0x88, 0xa5, 0xe1, 0x1d, 0x2f, 0x50, 0xc7, 0x95}}
	iidRandomStream = windows.GUID{Data1: 0x905a0fe1, Data2: 0xbc53, Data3: 0x11df, Data4: [8]byte{0x8c, 0x49, 0x00, 0x1e, 0x4f, 0xc6, 0x86, 0xda}}
)

// Номера методов в таблицах (порядок из метаданных Windows.Media.Control).
const (
	mgrCurrent, mgrSessions                = 6, 7
	sesID, sesProps, sesTimeline, sesInfo  = 6, 7, 8, 9
	sesPlay, sesPause, sesNext, sesPrev    = 10, 11, 16, 17
	sesToggle                              = 20
	propTitle, propAlbumArtist, propArtist = 6, 8, 9
	propAlbum, propThumb                   = 10, 15
	infoControls, infoStatus, infoRate     = 6, 7, 10
	ctlPlay, ctlPause, ctlNext, ctlPrev    = 6, 7, 12, 13
	tlStart, tlEnd, tlPos, tlUpdated       = 6, 7, 10, 11
)

var mediaCmdSlot = map[string]int{"play": sesPlay, "pause": sesPause, "next": sesNext, "prev": sesPrev, "toggle": sesToggle}

type mediaProps struct {
	title, artist, album string
	at                   time.Time
}

type mediaSvc struct {
	mu     sync.Mutex
	on     bool
	cur    *MediaStat
	picked string
	art    string // data: URL обложки
	artN   int
	cmds   chan string
	wake   chan struct{}
	// ниже: только поток loop
	mgr      *rtObj
	retry    time.Time
	props    map[string]mediaProps
	artKey   string
	artTries int
}

func startMedia() *mediaSvc {
	m := &mediaSvc{cmds: make(chan string, 8), wake: make(chan struct{}, 1), props: map[string]mediaProps{}}
	go m.loop()
	return m
}

func (m *mediaSvc) setOn(on bool) {
	m.mu.Lock()
	changed := m.on != on
	m.on = on
	m.mu.Unlock()
	if changed {
		m.poke()
	}
}

func (m *mediaSvc) poke() {
	select {
	case m.wake <- struct{}{}:
	default:
	}
}

func (m *mediaSvc) get() *MediaStat {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.on {
		return nil
	}
	return m.cur
}

// command: prev, next, toggle, play, pause или pick:<id> (пустой id — снова текущий по версии Windows).
func (m *mediaSvc) command(c string) {
	if id, ok := strings.CutPrefix(c, "pick:"); ok {
		m.mu.Lock()
		m.picked = id
		m.mu.Unlock()
		m.poke()
		return
	}
	select {
	case m.cmds <- c:
	default:
	}
}

// artJS — вызов страницы с текущей обложкой.
func (m *mediaSvc) artJS() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	q, _ := json.Marshal(m.art)
	b, _ := json.Marshal(m.artN)
	return "window.__mediaArt&&window.__mediaArt(" + string(b) + "," + string(q) + ")"
}

func (m *mediaSvc) loop() {
	runtime.LockOSThread() // WinRT-объекты живут в одном потоке
	if rtInit() != nil {
		return
	}
	tick := time.NewTicker(mediaEvery)
	for {
		cmd := ""
		select {
		case <-tick.C:
		case <-m.wake:
		case cmd = <-m.cmds:
		}
		m.mu.Lock()
		on, picked := m.on, m.picked
		m.mu.Unlock()
		if !on {
			m.drop()
			continue
		}
		if m.mgr == nil && !m.open() {
			continue
		}
		if cmd != "" {
			m.run(cmd)
			time.Sleep(150 * time.Millisecond) // источнику нужно время, чтобы сменить состояние
		}
		st, ok := m.collect(picked, time.Now())
		if !ok {
			m.drop()
			m.retry = time.Now().Add(10 * time.Second)
		}
		m.mu.Lock()
		m.cur = st
		m.mu.Unlock()
	}
}

func (m *mediaSvc) open() bool {
	if time.Now().Before(m.retry) {
		return false
	}
	m.retry = time.Now().Add(10 * time.Second)
	f, err := rtFactory(smtcClass, &iidSmtcStatics)
	if err != nil {
		return false
	}
	defer f.release()
	op, err := f.obj(6) // RequestAsync
	if err != nil || op == nil {
		return false
	}
	m.mgr, err = awaitObj(op, 3*time.Second)
	return err == nil && m.mgr != nil
}

func (m *mediaSvc) drop() {
	m.mgr.release()
	m.mgr = nil
	m.mu.Lock()
	m.cur = nil
	m.mu.Unlock()
}

// sessions возвращает все сеансы (вызывающий освобождает) и id текущего по версии Windows.
func (m *mediaSvc) sessions() ([]*rtObj, string, bool) {
	vec, err := m.mgr.obj(mgrSessions)
	if err != nil || vec == nil {
		return nil, "", false
	}
	defer vec.release()
	n := vec.u32(7) // IVectorView.Size
	var out []*rtObj
	for i := uint32(0); i < n && i < 16; i++ {
		if s, err := vec.obj(6, uintptr(i)); err == nil && s != nil {
			out = append(out, s)
		}
	}
	cur := ""
	if c, err := m.mgr.obj(mgrCurrent); err == nil && c != nil {
		cur = c.str(sesID)
		c.release()
	}
	return out, cur, true
}

func (m *mediaSvc) run(cmd string) {
	slot, ok := mediaCmdSlot[cmd]
	ss, cur, ok2 := m.sessions()
	defer releaseAll(ss)
	m.mu.Lock()
	want := m.picked
	m.mu.Unlock()
	if !ok || !ok2 {
		return
	}
	ids, playing := sessionIDs(ss)
	i := mediaPick(ids, playing, cur, want)
	if i < 0 {
		return
	}
	if op, err := ss[i].obj(slot); err == nil && op != nil {
		var done uint32
		await(op, unsafe.Pointer(&done), 2*time.Second)
	}
}

func sessionIDs(ss []*rtObj) ([]string, []bool) {
	ids := make([]string, len(ss))
	pl := make([]bool, len(ss))
	for i, s := range ss {
		ids[i] = s.str(sesID)
		if inf, err := s.obj(sesInfo); err == nil && inf != nil {
			pl[i] = inf.u32(infoStatus) == 4
			inf.release()
		}
	}
	return ids, pl
}

func releaseAll(ss []*rtObj) {
	for _, s := range ss {
		s.release()
	}
}
