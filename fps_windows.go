package main

import (
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// frameSource включает трассировку кадров только на время игрового режима и отдаёт
// показатели процесса, чьё окно сейчас на переднем плане.
type frameSource struct {
	mu    sync.Mutex
	trace *etwTrace
	fc    *frameCounter
	fail  time.Time // когда не удалось запустить (повтор не чаще раза в 30 с)
}

var frames = &frameSource{}

// setOn запускает или останавливает сессию ETW. Без прав администратора кадров просто не будет.
func (f *frameSource) setOn(on bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !on {
		if f.trace != nil {
			t := f.trace
			f.trace, f.fc = nil, nil
			go t.stop()
		}
		return
	}
	if f.trace != nil || time.Since(f.fail) < 30*time.Second {
		return
	}
	fc := newFrameCounter()
	t, err := startPresentTrace(fc.add)
	if err != nil {
		logf("frames: %v", err)
		f.fail = time.Now()
		return
	}
	f.trace, f.fc = t, fc
}

// counter — счётчик кадров, пока трассировка идёт; иначе nil.
func (f *frameSource) counter() *frameCounter {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.fc
}

func filetimeNow() int64 {
	ft := windows.NsecToFiletime(time.Now().UnixNano())
	return int64(ft.HighDateTime)<<32 | int64(ft.LowDateTime)
}

// foregroundPID — процесс окна на переднем плане (0, если не понять).
func foregroundPID() uint32 {
	h, _, _ := pGetForeground.Call()
	if h == 0 {
		return 0
	}
	var pid uint32
	pGetWinThreadPID.Call(h, uintptr(unsafe.Pointer(&pid)))
	return pid
}

// get: nil, если режим выключен, нет прав или передний процесс не рисует кадры.
func (f *frameSource) get() *FrameStat {
	f.mu.Lock()
	fc := f.fc
	f.mu.Unlock()
	if fc == nil {
		return nil
	}
	now := filetimeNow()
	fc.prune(now)
	pid := foregroundPID()
	if pid == 0 || pid == uint32(windows.GetCurrentProcessId()) {
		return nil
	}
	return fc.stat(pid, now)
}
