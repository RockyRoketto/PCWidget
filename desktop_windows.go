package main

import (
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Режим «на рабочем столе»: окно лежит прямо над Progman (слоем обоев и значков),
// т.е. под всеми программами, но видно на пустом столе. Поднять его выше нельзя:
// любую попытку смены Z-порядка перехватывает WM_WINDOWPOSCHANGING.

const (
	wmWindowPosChanging = 0x0046
	wmMouseActivate     = 0x0021
	maNoActivate        = 3
	gwHwndPrev          = 3
	wsExNoActivate      = 0x08000000
)

var (
	pFindWindow = user32.NewProc("FindWindowW")
	pGetWindow  = user32.NewProc("GetWindow")
)

type windowPos struct {
	hwnd, insertAfter uintptr
	x, y, cx, cy      int32
	flags             uint32
}

// desktopAnchor возвращает окно, после которого надо вставить виджет, чтобы он оказался
// прямо над Progman. Если Progman не найден, берём дно Z-порядка.
func desktopAnchor() uintptr {
	prog, _, _ := pFindWindow.Call(uintptr(unsafe.Pointer(utf16("Progman"))), 0)
	if prog == 0 {
		return hwndBottom
	}
	prev, _, _ := pGetWindow.Call(prog, gwHwndPrev)
	if prev == 0 {
		return hwndBottom
	}
	return prev
}

// sendToDesktopLevel ставит окно на уровень рабочего стола.
func sendToDesktopLevel() {
	a := desktopAnchor()
	if a == app.hwnd {
		return
	}
	pSetWindowPos.Call(app.hwnd, a, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

var (
	pSetWinEventHook  = user32.NewProc("SetWinEventHook")
	pGetForeground    = user32.NewProc("GetForegroundWindow")
	pEnumWindows      = user32.NewProc("EnumWindows")
	pIsWindowVisible  = user32.NewProc("IsWindowVisible")
	pIsIconic         = user32.NewProc("IsIconic")
	pGetClassName     = user32.NewProc("GetClassNameW")
	pGetWindowLong    = user32.NewProc("GetWindowLongW")
	pGetWindowTextLen = user32.NewProc("GetWindowTextLengthW")
	pDwmGetWindowAttr = dwmapi.NewProc("DwmGetWindowAttribute")
	winEventCB        = windows.NewCallback(onWinEvent)
	enumCB            = windows.NewCallback(enumProc)
	appWindowSeen     bool
	forceRaise        bool // обход перехвата WM_WINDOWPOSCHANGING на время «показать стол»
	desktopRaised     bool
	raiseTicks        int
)

const (
	eventSystemForeground = 3
	winEventOutOfContext  = 0
)

// installDesktopHook следит за сменой активного окна (нужно для Win+D).
func installDesktopHook() {
	pSetWinEventHook.Call(eventSystemForeground, eventSystemForeground, 0, winEventCB, 0, 0, winEventOutOfContext)
	// Explorer при «Показать рабочий стол» поднимает слой значков выше нас уже после события,
	// поэтому пока стол показан, виджет приходится поднимать заново.
	go func() {
		for range time.Tick(500 * time.Millisecond) {
			runOnUI(updateDesktopLevel)
		}
	}()
}

func onWinEvent(hook, event, hwnd, idObject, idChild, thread, tm uintptr) uintptr {
	// Сразу и ещё дважды с задержкой: сворачивание окон занимает время.
	runOnUI(updateDesktopLevel)
	for _, d := range []time.Duration{250 * time.Millisecond, 700 * time.Millisecond} {
		d := d
		go func() { time.Sleep(d); runOnUI(updateDesktopLevel) }()
	}
	return 0
}

func className(h uintptr) string {
	var b [64]uint16
	n, _, _ := pGetClassName.Call(h, uintptr(unsafe.Pointer(&b[0])), 64)
	return windows.UTF16ToString(b[:n])
}

// enumProc ищет видимое окно программы (не оболочка, не свёрнутое, не скрытое DWM).
func enumProc(h, _ uintptr) uintptr {
	if h == app.hwnd {
		return 1
	}
	if v, _, _ := pIsWindowVisible.Call(h); v == 0 {
		return 1
	}
	if v, _, _ := pIsIconic.Call(h); v != 0 {
		return 1
	}
	ex, _, _ := pGetWindowLong.Call(h, ^uintptr(19)) // GWL_EXSTYLE = -20
	if ex&wsExToolWindow != 0 {
		return 1
	}
	if n, _, _ := pGetWindowTextLen.Call(h); n == 0 {
		return 1
	}
	var cloaked int32
	pDwmGetWindowAttr.Call(h, 14, uintptr(unsafe.Pointer(&cloaked)), 4) // DWMWA_CLOAKED
	if cloaked != 0 {
		return 1
	}
	switch className(h) {
	case "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd":
		return 1
	}
	appWindowSeen = true
	logf("desktop: окно программы мешает: %s", className(h))
	return 0 // нашли, дальше не перебираем
}

func anyAppWindowVisible() bool {
	appWindowSeen = false
	pEnumWindows.Call(enumCB, 0)
	return appWindowSeen
}

// updateDesktopLevel: стол показан (программ нет) — поднять виджет над слоем значков,
// иначе вернуть на уровень рабочего стола.
func updateDesktopLevel() {
	if app.settings.Topmost || !app.visible {
		return
	}
	fg, _, _ := pGetForeground.Call()
	c := className(fg)
	deskShown := (c == "Progman" || c == "WorkerW") && !anyAppWindowVisible()
	if c == "Progman" || c == "WorkerW" {
		logf("desktop: fg=%s shown=%v", c, deskShown)
	}
	if deskShown {
		forceRaise, desktopRaised = true, true
		// Обычного HWND_TOP мало: Explorer возвращает слой значков выше. Пока стол показан, держим topmost.
		const fl = swpNoMove | swpNoSize | swpNoActivate
		if raiseTicks < 8 {
			// Пока Explorer прячет окна, DWM не обновляет наше окно из-за «ничего не изменилось»:
			// переключаем topmost вниз-вверх, чтобы позиция реально менялась.
			pSetWindowPos.Call(app.hwnd, hwndNoTop, 0, 0, 0, 0, fl)
		}
		raiseTicks++
		pSetWindowPos.Call(app.hwnd, hwndTopmost, 0, 0, 0, 0, fl)
		forceRaise = false
	} else if desktopRaised {
		desktopRaised, raiseTicks = false, 0
		forceRaise = true
		pSetWindowPos.Call(app.hwnd, hwndNoTop, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		forceRaise = false
		sendToDesktopLevel()
	}
}

// onWindowPosChanging подменяет Z-порядок на уровень рабочего стола.
func onWindowPosChanging(lp uintptr) {
	if app.settings.Topmost || forceRaise {
		return
	}
	wp := (*windowPos)(unsafe.Pointer(lp))
	if wp.flags&swpNoZOrder != 0 {
		return
	}
	if a := desktopAnchor(); a != app.hwnd {
		wp.insertAfter = a
	}
}
