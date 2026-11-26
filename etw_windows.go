package main

import (
	"errors"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Свой потребитель ETW (без CGO и без внедрения в игру): та же идея, что у PresentMon.
// Слушаем события начала вывода кадра от DXGI (DirectX 10–12), D3D9 и ядра графики DxgKrnl
// (последнее видит и OpenGL/Vulkan). Нужны права администратора: виджет и так запускается с ними
// (манифест requireAdministrator, задача планировщика без UAC).

var (
	advapi32         = windows.NewLazySystemDLL("advapi32.dll")
	pStartTrace      = advapi32.NewProc("StartTraceW")
	pControlTrace    = advapi32.NewProc("ControlTraceW")
	pEnableTraceEx2  = advapi32.NewProc("EnableTraceEx2")
	pOpenTrace       = advapi32.NewProc("OpenTraceW")
	pProcessTrace    = advapi32.NewProc("ProcessTrace")
	pCloseTrace      = advapi32.NewProc("CloseTrace")
	etwCallbackOnce  sync.Once
	etwCallbackPtr   uintptr
	etwSinkMu        sync.RWMutex
	etwSink          func(src presentSource, pid uint32, ts int64)
	errETWNotStarted = errors.New("etw: trace not started")
)

const etwSessionName = "PCWidgetFrames"

var (
	guidDXGI    = windows.GUID{Data1: 0xCA11C036, Data2: 0x0102, Data3: 0x4A2D, Data4: [8]byte{0xA6, 0xAD, 0xF0, 0x3C, 0xFE, 0xD5, 0xD3, 0xC9}}
	guidD3D9    = windows.GUID{Data1: 0x783ACA0A, Data2: 0x790E, Data3: 0x4D7F, Data4: [8]byte{0x84, 0x51, 0xAA, 0x85, 0x05, 0x11, 0xC6, 0xB9}}
	guidDxgKrnl = windows.GUID{Data1: 0x802EC45A, Data2: 0x1E99, Data3: 0x4B83, Data4: [8]byte{0x99, 0x20, 0x87, 0xC9, 0x82, 0x77, 0xBA, 0x9D}}
)

// Раскладка структур ETW для x64.
type wnodeHeader struct {
	BufferSize        uint32
	ProviderID        uint32
	HistoricalContext uint64
	TimeStamp         int64
	GUID              windows.GUID
	ClientContext     uint32
	Flags             uint32
}

type eventTraceProperties struct {
	Wnode               wnodeHeader
	BufferSize          uint32
	MinimumBuffers      uint32
	MaximumBuffers      uint32
	MaximumFileSize     uint32
	LogFileMode         uint32
	FlushTimer          uint32
	EnableFlags         uint32
	AgeLimit            int32
	NumberOfBuffers     uint32
	FreeBuffers         uint32
	EventsLost          uint32
	BuffersWritten      uint32
	LogBuffersLost      uint32
	RealTimeBuffersLost uint32
	LoggerThreadID      uintptr
	LogFileNameOffset   uint32
	LoggerNameOffset    uint32
}

// eventTraceLogfile — EVENT_TRACE_LOGFILEW (448 байт на x64); середина нам не нужна.
type eventTraceLogfile struct {
	LogFileName      *uint16
	LoggerName       *uint16
	CurrentTime      int64
	BuffersRead      uint32
	ProcessTraceMode uint32
	_                [368]byte // EVENT_TRACE + TRACE_LOGFILE_HEADER
	BufferCallback   uintptr
	BufferSize       uint32
	Filled           uint32
	EventsLost       uint32
	_                uint32
	EventCallback    uintptr
	IsKernelTrace    uint32
	_                uint32
	Context          uintptr
}

type eventRecord struct {
	Size           uint16
	HeaderType     uint16
	Flags          uint16
	EventProperty  uint16
	ThreadID       uint32
	ProcessID      uint32
	TimeStamp      int64 // FILETIME, 100 нс
	ProviderID     windows.GUID
	ID             uint16
	Version        uint8
	Channel        uint8
	Level          uint8
	Opcode         uint8
	Task           uint16
	Keyword        uint64
	ProcessorTime  uint64
	ActivityID     windows.GUID
	BufferContext  uint32
	ExtendedCount  uint16
	UserDataLength uint16
	ExtendedData   uintptr
	UserData       uintptr
	UserContext    uintptr
}

const (
	wnodeFlagTracedGUID  = 0x00020000
	eventTraceRealTime   = 0x00000100
	eventTraceMsFlush    = 0x00000010 // FlushTimer в миллисекундах (Windows 8+)
	controlStop          = 1
	enableProvider       = 1
	processTraceRealTime = 0x00000100
	processTraceRecord   = 0x10000000
	invalidTraceHandle   = ^uint64(0)
	levelInfo            = 4
	kwDXGIEvents         = 0x2
	kwDxgKrnlBase        = 0x1
	kwDxgKrnlPresent     = 0x8000000
)

func etwCallback(rec *eventRecord) uintptr {
	var src presentSource
	switch rec.ProviderID {
	case guidDXGI:
		src = srcDXGI
	case guidD3D9:
		src = srcD3D9
	case guidDxgKrnl:
		src = srcKernel
	default:
		return 0
	}
	if !wantedPresentEvent(src, rec.ID) {
		return 0
	}
	etwSinkMu.RLock()
	f := etwSink
	etwSinkMu.RUnlock()
	if f != nil {
		f(src, rec.ProcessID, rec.TimeStamp)
	}
	return 0
}

// etwTrace — запущенная сессия реального времени.
type etwTrace struct {
	session uint64
	props   []byte
	name    *uint16
	done    chan struct{}
}

func newTraceProps(name string) ([]byte, *eventTraceProperties) {
	n, _ := windows.UTF16FromString(name)
	size := int(unsafe.Sizeof(eventTraceProperties{})) + len(n)*2
	buf := make([]byte, size)
	p := (*eventTraceProperties)(unsafe.Pointer(&buf[0]))
	p.Wnode.BufferSize = uint32(size)
	p.Wnode.Flags = wnodeFlagTracedGUID
	p.Wnode.ClientContext = 1 // таймер QPC
	p.LoggerNameOffset = uint32(unsafe.Sizeof(eventTraceProperties{}))
	return buf, p
}

// stopStaleSession останавливает сессию с нашим именем, оставшуюся после аварийного выхода.
func stopStaleSession(name *uint16) {
	buf, _ := newTraceProps(etwSessionName)
	pControlTrace.Call(0, uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&buf[0])), controlStop)
}

// startPresentTrace запускает сессию и поток чтения. sink вызывается из потока ETW на каждый кадр.
func startPresentTrace(sink func(src presentSource, pid uint32, ts int64)) (*etwTrace, error) {
	if err := advapi32.Load(); err != nil {
		return nil, err
	}
	etwCallbackOnce.Do(func() { etwCallbackPtr = syscall.NewCallback(etwCallback) })
	name := windows.StringToUTF16Ptr(etwSessionName)
	stopStaleSession(name)

	buf, p := newTraceProps(etwSessionName)
	p.LogFileMode = eventTraceRealTime | eventTraceMsFlush
	p.BufferSize = 64 // КБ
	p.MinimumBuffers = 4
	p.MaximumBuffers = 32
	p.FlushTimer = 200 // мс: показатели отстают от игры не больше чем на 0,2 с
	var h uint64
	r, _, _ := pStartTrace.Call(uintptr(unsafe.Pointer(&h)), uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&buf[0])))
	if r != 0 {
		return nil, syscall.Errno(r)
	}
	t := &etwTrace{session: h, props: buf, name: name, done: make(chan struct{})}
	enable := func(g *windows.GUID, any, all uint64) uintptr {
		r, _, _ := pEnableTraceEx2.Call(uintptr(h), uintptr(unsafe.Pointer(g)), enableProvider, levelInfo, uintptr(any), uintptr(all), 0, 0)
		return r
	}
	ok := 0
	for _, e := range []struct {
		g        *windows.GUID
		any, all uint64
	}{
		{&guidDXGI, kwDXGIEvents, 0},
		{&guidD3D9, kwDXGIEvents, 0},
		{&guidDxgKrnl, kwDxgKrnlPresent, kwDxgKrnlBase | kwDxgKrnlPresent},
	} {
		if enable(e.g, e.any, e.all) == 0 {
			ok++
		}
	}
	if ok == 0 {
		t.stopSession()
		return nil, errETWNotStarted
	}

	etwSinkMu.Lock()
	etwSink = sink
	etwSinkMu.Unlock()

	opened := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		defer close(t.done)
		lf := eventTraceLogfile{LoggerName: name, ProcessTraceMode: processTraceRealTime | processTraceRecord, EventCallback: etwCallbackPtr}
		th, _, _ := pOpenTrace.Call(uintptr(unsafe.Pointer(&lf)))
		if uint64(th) == invalidTraceHandle {
			opened <- errETWNotStarted
			return
		}
		opened <- nil
		pProcessTrace.Call(uintptr(unsafe.Pointer(&th)), 1, 0, 0) // блокирует до остановки сессии
		pCloseTrace.Call(th)
	}()
	if err := <-opened; err != nil {
		t.stopSession()
		return nil, err
	}
	return t, nil
}

func (t *etwTrace) stopSession() {
	buf, _ := newTraceProps(etwSessionName)
	pControlTrace.Call(uintptr(t.session), 0, uintptr(unsafe.Pointer(&buf[0])), controlStop)
}

// stop останавливает сессию и ждёт выхода потока чтения.
func (t *etwTrace) stop() {
	if t == nil {
		return
	}
	etwSinkMu.Lock()
	etwSink = nil
	etwSinkMu.Unlock()
	t.stopSession()
	<-t.done
}
