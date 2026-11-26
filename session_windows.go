package main

import (
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Запись игровых сессий: пока включён игровой режим, раз в секунду забирает новые кадры процесса
// на переднем плане. Итог — когда режим выключили или игру закрыли.

type sessionRec struct {
	mu      sync.Mutex
	on      bool
	games   map[uint32]*gameSession
	pending *GameReport // готов, но игра ещё на экране
	pendPID uint32
}

var sessions = &sessionRec{}

// setOn вызывается из setGame. Выключение закрывает сессию самой долгой игры.
func (r *sessionRec) setOn(on bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if on == r.on {
		return
	}
	r.on = on
	if on {
		r.games, r.pending = map[uint32]*gameSession{}, nil
		return
	}
	var best uint32
	for pid, g := range r.games {
		if best == 0 || g.ms > r.games[best].ms {
			best = pid
		}
	}
	if best != 0 {
		r.finish(best)
	}
	r.games = nil
}

// finish (под замком) превращает сессию процесса в итог, если она достаточно долгая.
func (r *sessionRec) finish(pid uint32) {
	if rep := r.games[pid].report(time.Now().UnixMilli()); rep != nil {
		saveLastReport(rep)
		r.pending, r.pendPID = rep, pid
	}
	delete(r.games, pid)
}

// record вызывается сборщиком раз в секунду.
func (r *sessionRec) record(s *Stats) {
	pid := foregroundPID()
	var stamps []int64
	now := filetimeNow()
	if fc := frames.counter(); fc != nil && pid != 0 && pid != uint32(windows.GetCurrentProcessId()) {
		stamps = fc.stamps(pid, now)
	}
	r.mu.Lock()
	if r.on {
		if len(stamps) > 1 {
			g := r.games[pid]
			if g == nil {
				if name := processName(pid); name != "" && !strings.EqualFold(name, "explorer.exe") && !strings.EqualFold(name, "dwm.exe") {
					g = newGameSession(name)
					r.games[pid] = g
				}
			}
			if g != nil {
				g.add(stamps, now, sampleOf(s))
			}
		}
		for p := range r.games {
			if processGone(p) {
				r.finish(p)
			}
		}
	}
	var show *GameReport
	if r.pending != nil && pid != r.pendPID {
		show, r.pending = r.pending, nil
	}
	r.mu.Unlock()
	if show != nil {
		runOnUI(func() {
			sendSys()
			if !gameCfg().NoSummary {
				showReport(show)
			}
		})
	}
}

func sampleOf(s *Stats) gameSample {
	var m gameSample
	var cpuW, gpuW *float64
	if s.CPU != nil {
		m.cpuT, cpuW = s.CPU.Temp, s.CPU.Power
	}
	if s.GPU != nil {
		m.gpuT, gpuW = s.GPU.Temp, s.GPU.Power
	}
	if w, ok := powerSum(cpuW, gpuW); ok {
		m.watts = &w
	}
	return m
}

// processName — имя exe без пути (в пути бывает имя пользователя, оно в итог не идёт).
func processName(pid uint32) string {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, 1024)
	n := uint32(len(buf))
	if windows.QueryFullProcessImageName(h, 0, (*uint16)(unsafe.Pointer(&buf[0])), &n) != nil {
		return ""
	}
	return filepath.Base(windows.UTF16ToString(buf[:n]))
}

// processGone: процесс завершился. Если открыть не дают, считаем живым.
func processGone(pid uint32) bool {
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, pid)
	if err != nil {
		return err == windows.ERROR_INVALID_PARAMETER
	}
	defer windows.CloseHandle(h)
	ev, err := windows.WaitForSingleObject(h, 0)
	return err == nil && ev == windows.WAIT_OBJECT_0
}
