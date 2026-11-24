package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// Процессор, память, аптайм.

var (
	pGetSystemTimes     = kernel32.NewProc("GetSystemTimes")
	pGlobalMemoryStatus = kernel32.NewProc("GlobalMemoryStatusEx")
	pGetTickCount64     = kernel32.NewProc("GetTickCount64")
)

const gb = 1 << 30

func filetime(f windows.Filetime) uint64 { return uint64(f.HighDateTime)<<32 | uint64(f.LowDateTime) }

type cpuMeter struct {
	prev [3]uint64 // простой, ядро (включая простой), пользователь
	has  bool
}

// load возвращает общую загрузку CPU в %. Первый вызов только запоминает точку отсчёта.
func (m *cpuMeter) load() (float64, bool) {
	var idle, kern, user windows.Filetime
	r, _, _ := pGetSystemTimes.Call(uintptr(unsafe.Pointer(&idle)), uintptr(unsafe.Pointer(&kern)), uintptr(unsafe.Pointer(&user)))
	if r == 0 {
		return 0, false
	}
	cur := [3]uint64{filetime(idle), filetime(kern), filetime(user)}
	prev, had := m.prev, m.has
	m.prev, m.has = cur, true
	if !had {
		return 0, false
	}
	return cpuLoad(cur[0]-prev[0], (cur[1]-prev[1])+(cur[2]-prev[2])), true
}

type memStatusEx struct {
	length, load                               uint32
	totalPhys, availPhys, totalPage, availPage uint64
	totalVirt, availVirt, availExt             uint64
}

func readMem(pageUsagePct *float64) *MemStat {
	var m memStatusEx
	m.length = uint32(unsafe.Sizeof(m))
	if r, _, _ := pGlobalMemoryStatus.Call(uintptr(unsafe.Pointer(&m))); r == 0 {
		return nil
	}
	s := &MemStat{
		UsedGB:  float64(m.totalPhys-m.availPhys) / gb,
		TotalGB: float64(m.totalPhys) / gb,
		Pct:     float64(m.load),
	}
	// Файл подкачки = лимит коммита минус ОЗУ; занятость берём из счётчика «% Usage».
	if pageUsagePct != nil && m.totalPage > m.totalPhys {
		total := float64(m.totalPage-m.totalPhys) / gb
		s.PageTotalGB = ptr(total)
		s.PageUsedGB = ptr(total * *pageUsagePct / 100)
	}
	return s
}

func uptimeSeconds() int64 {
	ms, _, _ := pGetTickCount64.Call()
	return int64(ms / 1000)
}
