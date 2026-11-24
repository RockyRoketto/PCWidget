package main

import (
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Счётчики производительности (PDH): диски и файл подкачки. Имена английские
// (PdhAddEnglishCounter), поэтому работают в любой локализации Windows.

var (
	pdhDLL         = windows.NewLazySystemDLL("pdh.dll")
	pPdhOpenQuery  = pdhDLL.NewProc("PdhOpenQueryW")
	pPdhAddEnglish = pdhDLL.NewProc("PdhAddEnglishCounterW")
	pPdhCollect    = pdhDLL.NewProc("PdhCollectQueryData")
	pPdhFmtValue   = pdhDLL.NewProc("PdhGetFormattedCounterValue")
	pPdhFmtArray   = pdhDLL.NewProc("PdhGetFormattedCounterArrayW")
)

const (
	pdhFmtDouble = 0x200
	pdhMoreData  = 0x800007D2
)

type pdhItem struct { // PDH_FMT_COUNTERVALUE_ITEM_W
	name   *uint16
	status uint32
	value  float64
}

type pdhValue struct { // PDH_FMT_COUNTERVALUE
	status uint32
	value  float64
}

type perf struct {
	q                   uintptr
	diskRead, diskWrite uintptr
	diskBusy, pageUsage uintptr
}

func newPerf() *perf {
	p := &perf{}
	if r, _, _ := pPdhOpenQuery.Call(0, 0, uintptr(unsafe.Pointer(&p.q))); r != 0 {
		return nil
	}
	add := func(path string) uintptr {
		var c uintptr
		if r, _, _ := pPdhAddEnglish.Call(p.q, uintptr(unsafe.Pointer(utf16(path))), 0, uintptr(unsafe.Pointer(&c))); r != 0 {
			return 0
		}
		return c
	}
	p.diskRead = add(`\PhysicalDisk(*)\Disk Read Bytes/sec`)
	p.diskWrite = add(`\PhysicalDisk(*)\Disk Write Bytes/sec`)
	p.diskBusy = add(`\PhysicalDisk(*)\% Disk Time`)
	p.pageUsage = add(`\Paging File(_Total)\% Usage`)
	pPdhCollect.Call(p.q) // первый замер: скорости станут доступны со следующего
	return p
}

func (p *perf) collect() { pPdhCollect.Call(p.q) }

func (p *perf) value(c uintptr) (float64, bool) {
	if c == 0 {
		return 0, false
	}
	var v pdhValue
	r, _, _ := pPdhFmtValue.Call(c, pdhFmtDouble, 0, uintptr(unsafe.Pointer(&v)))
	return v.value, r == 0 && v.status <= 1
}

// array возвращает значения по экземплярам счётчика («0 C:» -> число).
func (p *perf) array(c uintptr) map[string]float64 {
	if c == 0 {
		return nil
	}
	var size, count uint32
	r, _, _ := pPdhFmtArray.Call(c, pdhFmtDouble, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), 0)
	if uint32(r) != pdhMoreData || size == 0 {
		return nil
	}
	buf := make([]byte, size)
	r, _, _ = pPdhFmtArray.Call(c, pdhFmtDouble, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), uintptr(unsafe.Pointer(&buf[0])))
	if r != 0 {
		return nil
	}
	out := make(map[string]float64, count)
	for _, it := range unsafe.Slice((*pdhItem)(unsafe.Pointer(&buf[0])), count) {
		if it.status <= 1 {
			out[windows.UTF16PtrToString(it.name)] = it.value
		}
	}
	return out
}

// driveLetters выделяет буквы дисков из имени экземпляра: «1 D: E:» -> [«D:», «E:»].
func driveLetters(instance string) []string {
	var out []string
	for _, f := range strings.Fields(instance)[min(1, len(strings.Fields(instance))):] {
		if len(f) == 2 && f[1] == ':' {
			out = append(out, strings.ToUpper(f))
		}
	}
	return out
}
