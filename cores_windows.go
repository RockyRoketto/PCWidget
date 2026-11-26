package main

import "unsafe"

// Времена по каждому потоку. Обычный NtQuerySystemInformation отдаёт только одну группу
// процессоров (до 64 потоков), поэтому спрашиваем каждую группу через вариант Ex.

var (
	pNtQuerySystemInformationEx   = ntdll.NewProc("NtQuerySystemInformationEx")
	pGetActiveProcessorGroupCount = kernel32.NewProc("GetActiveProcessorGroupCount")
)

const (
	systemProcessorPerformance = 8
	maxGroupThreads            = 64
)

func readCoreTimes() []coreTimes {
	if pNtQuerySystemInformationEx.Find() != nil {
		return nil
	}
	groups, _, _ := pGetActiveProcessorGroupCount.Call()
	var out []coreTimes
	var buf [maxGroupThreads * coreRecSize]byte
	for g := uint16(0); g < uint16(groups); g++ {
		group, size := g, uint32(0)
		status, _, _ := pNtQuerySystemInformationEx.Call(systemProcessorPerformance,
			uintptr(unsafe.Pointer(&group)), unsafe.Sizeof(group),
			uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&size)))
		if uint32(status) != 0 || int(size) > len(buf) {
			return nil // часть потоков показывать нельзя
		}
		out = append(out, parseCoreTimes(buf[:size])...)
	}
	return out
}

type coreMeter struct{ prev []coreTimes }

// loads возвращает загрузку по потокам в %. Первый вызов только запоминает точку отсчёта.
func (m *coreMeter) loads() []float64 {
	cur := readCoreTimes()
	prev := m.prev
	m.prev = cur
	return coreLoads(prev, cur)
}
