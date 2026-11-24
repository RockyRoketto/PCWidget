package main

import (
	"runtime"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	pGetProcMemInfo = kernel32.NewProc("K32GetProcessMemoryInfo")
	pGetProcIo      = kernel32.NewProc("GetProcessIoCounters")
)

const processQueryLimited = 0x1000

type procMemCounters struct { // PROCESS_MEMORY_COUNTERS
	cb, pageFaults           uint32
	peakWS, ws               uintptr
	qPeakPaged, qPaged       uintptr
	qPeakNonPaged, qNonPaged uintptr
	pagefile, peakPagefile   uintptr
}

type procPrev struct {
	create uint64
	cpu    uint64 // ядро+пользователь, 100 нс
	io     uint64 // прочитано+записано, байт
}

type procMeter struct {
	prev map[uint32]procPrev
	at   time.Time
}

// top собирает 5 процессов по CPU, RAM и диску. Процессы с одним именем суммируются.
func (m *procMeter) top() *ProcStat {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)

	now := time.Now()
	dt := now.Sub(m.at).Seconds()
	prev := m.prev
	m.prev, m.at = make(map[uint32]procPrev, len(prev)), now
	haveRates := prev != nil && dt > 0

	cpuM, ramM, ioM := map[string]*ProcItem{}, map[string]*ProcItem{}, map[string]*ProcItem{}
	ncpu := float64(runtime.NumCPU())

	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		pid := e.ProcessID
		if pid == 0 || pid == 4 {
			continue
		}
		h, err := windows.OpenProcess(processQueryLimited, false, pid)
		if err != nil {
			continue
		}
		name := windows.UTF16ToString(e.ExeFile[:])

		var c, x, k, u windows.Filetime
		var mem procMemCounters
		var io windows.IO_COUNTERS
		mem.cb = uint32(unsafe.Sizeof(mem))
		okT := windows.GetProcessTimes(h, &c, &x, &k, &u) == nil
		pGetProcMemInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&mem)), uintptr(mem.cb))
		okIO, _, _ := pGetProcIo.Call(uintptr(h), uintptr(unsafe.Pointer(&io)))
		windows.CloseHandle(h)

		if mem.ws > 0 {
			aggregateByName(ramM, name, float64(mem.ws)/(1<<20))
		}
		cur := procPrev{create: filetime(c), cpu: filetime(k) + filetime(u), io: io.ReadTransferCount + io.WriteTransferCount}
		m.prev[pid] = cur
		if p, found := prev[pid]; haveRates && found && p.create == cur.create {
			if okT && cur.cpu >= p.cpu {
				aggregateByName(cpuM, name, float64(cur.cpu-p.cpu)/(dt*1e7*ncpu)*100)
			}
			if okIO != 0 {
				aggregateByName(ioM, name, rate(p.io, cur.io, dt))
			}
		}
	}
	flat := func(m map[string]*ProcItem) []ProcItem {
		s := make([]ProcItem, 0, len(m))
		for _, v := range m {
			s = append(s, *v)
		}
		return topN(s, 5)
	}
	return &ProcStat{CPU: flat(cpuM), RAM: flat(ramM), Disk: flat(ioM)}
}
