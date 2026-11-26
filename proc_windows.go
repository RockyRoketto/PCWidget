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

// Длина списков: плитке «Процессы» хватает пяти (она показывает 3 или 5), карте памяти нужно больше.
const procTopN, mapTopN = 5, 12

type procMemCounters struct { // PROCESS_MEMORY_COUNTERS
	cb, pageFaults           uint32
	peakWS, ws               uintptr
	qPeakPaged, qPaged       uintptr
	qPeakNonPaged, qNonPaged uintptr
	pagefile, peakPagefile   uintptr
}

type procMemCounters2 struct { // PROCESS_MEMORY_COUNTERS_EX2
	procMemCounters
	private, privateWS uintptr
	sharedCommit       uint64
}

// procMemory возвращает рабочий набор процесса и его частную часть, байт. Частная (как «Память» в
// диспетчере задач) без общих страниц: её суммы не превышают занятую память. Старая Windows
// расширенную структуру не принимает — тогда обе величины равны рабочему набору.
func procMemory(h windows.Handle) (ws, private uintptr) {
	var m procMemCounters2
	m.cb = uint32(unsafe.Sizeof(m))
	if ok, _, _ := pGetProcMemInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&m)), uintptr(m.cb)); ok != 0 {
		return m.ws, m.privateWS
	}
	m.cb = uint32(unsafe.Sizeof(m.procMemCounters))
	pGetProcMemInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&m)), uintptr(m.cb))
	return m.ws, m.ws
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

// top собирает первые процессы по CPU, RAM и диску (procTopN) и список для карты
// памяти (mapTopN). Процессы с одним именем суммируются.
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

	cpuM, ramM, ioM, mapM := map[string]*ProcItem{}, map[string]*ProcItem{}, map[string]*ProcItem{}, map[string]*ProcItem{}
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
		var io windows.IO_COUNTERS
		okT := windows.GetProcessTimes(h, &c, &x, &k, &u) == nil
		ws, private := procMemory(h)
		okIO, _, _ := pGetProcIo.Call(uintptr(h), uintptr(unsafe.Pointer(&io)))
		windows.CloseHandle(h)

		if ws > 0 {
			aggregateByName(ramM, name, float64(ws)/(1<<20))
			aggregateByName(mapM, name, float64(private)/(1<<20))
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
	flat := func(m map[string]*ProcItem, n int) []ProcItem {
		s := make([]ProcItem, 0, len(m))
		for _, v := range m {
			s = append(s, *v)
		}
		return topN(s, n)
	}
	return &ProcStat{CPU: flat(cpuM, procTopN), RAM: flat(ramM, procTopN), Disk: flat(ioM, procTopN), Map: flat(mapM, mapTopN)}
}
