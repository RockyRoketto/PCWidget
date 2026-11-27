package main

import (
	"sync"
	"sync/atomic"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// dayTracker раз в секунду смотрит, чьё окно на переднем плане. Работает, только пока плитка включена.
// Название и значок новой программы узнаются в отдельном потоке (appinfo_windows.go).
type dayTracker struct {
	on   atomic.Bool
	mu   sync.Mutex
	log  *dayLog
	last time.Time
	info map[string]*appInfo // по пути exe или AUMID, только в памяти
	ask  chan appRef
}

// appRef — что узнавать: путь exe и, у приложений из Microsoft Store, их идентификатор.
type appRef struct{ path, aumid string }

func (r appRef) key() string {
	if r.aumid != "" {
		return r.aumid
	}
	return r.path
}

type appInfo struct {
	name, icon string
	ready      bool
	waiting    float64 // секунды, набежавшие, пока название неизвестно
}

var (
	powrprof                = windows.NewLazySystemDLL("powrprof.dll")
	pCallNtPowerInformation = powrprof.NewProc("CallNtPowerInformation")
	pEnumChildWindows       = user32.NewProc("EnumChildWindows")
	pGetApplicationUMID     = kernel32.NewProc("GetApplicationUserModelId")

	hostedPID uint32 // результат hostedCB; только поток сборщика
	hostPID   uint32
	hostedCB  = windows.NewCallback(findHosted)
)

func startDayTracker() *dayTracker {
	d := &dayTracker{log: loadDay(dayPath()), info: map[string]*appInfo{}, ask: make(chan appRef, 64)}
	go resolveApps(d)
	return d
}

func (d *dayTracker) setOn(on bool) { d.on.Store(on) }

// displayKept: какая-то программа просит не гасить экран (идёт видео или игра).
func displayKept() bool {
	var state uint32
	r, _, _ := pCallNtPowerInformation.Call(16 /* SystemExecutionState */, 0, 0, uintptr(unsafe.Pointer(&state)), 4)
	return r == 0 && state&0x2 != 0 // ES_DISPLAY_REQUIRED
}

// coversScreen: окно закрывает весь монитор, вместе с панелью задач.
func coversScreen(hwnd uintptr) bool {
	mon, _, _ := pMonitorFromWindow.Call(hwnd, monitorNearest)
	mi := monitorInfo{size: uint32(unsafe.Sizeof(monitorInfo{}))}
	if r, _, _ := pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi))); r == 0 {
		return false
	}
	w := windowRect(hwnd)
	return w.L <= mi.monitor.L && w.T <= mi.monitor.T && w.R >= mi.monitor.R && w.B >= mi.monitor.B
}

// findHosted ищет внутри рамки ApplicationFrameHost окно самого приложения (оно другого процесса).
func findHosted(h, _ uintptr) uintptr {
	var pid uint32
	pGetWinThreadPID.Call(h, uintptr(unsafe.Pointer(&pid)))
	if pid != 0 && pid != hostPID {
		hostedPID = pid
		return 0
	}
	return 1
}

// processRef — путь exe и идентификатор приложения из Store (если он есть).
func processRef(pid uint32) (appRef, bool) {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return appRef{}, false
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, 1024)
	n := uint32(len(buf))
	if windows.QueryFullProcessImageName(h, 0, &buf[0], &n) != nil {
		return appRef{}, false
	}
	r := appRef{path: windows.UTF16ToString(buf[:n])}
	n = uint32(len(buf))
	if pGetApplicationUMID.Find() == nil {
		if e, _, _ := pGetApplicationUMID.Call(uintptr(h), uintptr(unsafe.Pointer(&n)), uintptr(unsafe.Pointer(&buf[0]))); e == 0 {
			r.aumid = windows.UTF16ToString(buf)
		}
	}
	return r, true
}

// foregroundApp — программа окна на переднем плане; ok = false, если считать нечего.
func foregroundApp() (ref appRef, hwnd uintptr, ok bool) {
	hwnd, _, _ = pGetForeground.Call()
	if hwnd == 0 {
		return
	}
	var pid uint32
	pGetWinThreadPID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 || pid == uint32(windows.GetCurrentProcessId()) {
		return
	}
	class := className(hwnd)
	if class == "ApplicationFrameWindow" {
		hostPID, hostedPID = pid, 0
		pEnumChildWindows.Call(hwnd, hostedCB, 0)
		if hostedPID == 0 {
			return // свёрнутое приложение из Store: рамка пустая
		}
		pid = hostedPID
	}
	ref, ok = processRef(pid)
	ok = ok && !skipApp(exeFile(ref.path), class)
	return
}

// tick прибавляет прошедшее время программе на переднем плане и отдаёт итог для страницы.
func (d *dayTracker) tick(now time.Time, idle int64) *DayStat {
	if !d.on.Load() {
		d.last = time.Time{}
		return nil
	}
	dt := now.Sub(d.last)
	counted := !d.last.IsZero() && dt > 0 && dt <= maxGap
	d.last = now
	var ref appRef
	ok := false
	if counted {
		var hwnd uintptr
		ref, hwnd, ok = foregroundApp()
		if ok && idle >= dayIdle {
			ok = dayCounts(idle, displayKept(), coversScreen(hwnd))
		}
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if ok {
		d.addLocked(now, ref, dt.Seconds())
	}
	return d.log.stat(now)
}

func (d *dayTracker) addLocked(now time.Time, ref appRef, sec float64) {
	a := d.info[ref.key()]
	if a == nil {
		select {
		case d.ask <- ref:
			a = &appInfo{}
			d.info[ref.key()] = a
		default: // очередь полна: спросим в следующую секунду
			return
		}
	}
	if !a.ready {
		a.waiting += sec
		return
	}
	d.log.add(now, a.name, a.icon, sec)
}

// resolved: название и значок узнаны, накопленное время переносится в дневной счёт.
func (d *dayTracker) resolved(ref appRef, name, icon string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	a := d.info[ref.key()]
	if a == nil {
		return
	}
	a.name, a.icon, a.ready = name, icon, true
	d.log.add(time.Now(), name, icon, a.waiting)
	a.waiting = 0
}

// iconJS отдаёт странице значок по номеру.
func (d *dayTracker) iconJS(num int) string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return dayIconJS(num, d.log.icon(num))
}

func (d *dayTracker) save() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.log.save(dayPath())
}
