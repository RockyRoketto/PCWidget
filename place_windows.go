package main

import "unsafe"

// Место окна виджета на экране. Виджет держится за угол (anchor): этот угол не двигается,
// когда меняется размер. Угол выбирается, когда окно перетащили.

var (
	dragging bool // окно тащат мышью: место задаёт система
	grab     point // точка окна под курсором в этот момент
	grabDPI  int   // масштаб, при котором она измерена
	raised   bool // виджет временно поверх всех окон: открыты настройки
)

func monitorWork(mon uintptr) rect {
	mi := monitorInfo{size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))
	return mi.work
}

func workAreaOf(hwnd uintptr) rect {
	mon, _, _ := pMonitorFromWindow.Call(hwnd, monitorNearest)
	return monitorWork(mon)
}

// workAreaAt — рабочая область монитора под точкой (или ближайшего к ней).
func workAreaAt(x, y int) rect {
	mon, _, _ := pMonitorFromPoint.Call(uintptr(uint32(x))|uintptr(uint32(y))<<32, monitorNearest)
	return monitorWork(mon)
}

func windowRect(hwnd uintptr) rect {
	var r rect
	pGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
	return r
}

func dpiOf(hwnd uintptr) int {
	dpi, _, _ := pGetDpiForWindow.Call(hwnd)
	if dpi == 0 {
		return 96
	}
	return int(dpi)
}

func scalePx(css, dpi int) int { return (css*dpi + 48) / 96 }

// applySize переводит CSS-размер страницы в физический и ставит окно к его углу.
func applySize() {
	dpi := dpiOf(app.hwnd)
	w, h := scalePx(app.cssW, dpi), scalePx(app.cssH, dpi)
	logf("applySize css=%dx%d dpi=%d -> %dx%d", app.cssW, app.cssH, dpi, w, h)
	a := app.settings.Anchor
	if dragging || a == nil {
		pSetWindowPos.Call(app.hwnd, 0, 0, 0, uintptr(w), uintptr(h), swpNoMove|swpNoZOrder|swpNoActivate)
		return
	}
	x, y := a.pos(w, h, workAreaAt(a.probe()))
	pSetWindowPos.Call(app.hwnd, 0, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoZOrder|swpNoActivate)
	keepSettingsClear()
}

// keepSettingsClear: виджет вырос под окно настроек (увеличили масштаб): отодвинуть настройки.
func keepSettingsClear() {
	if set.open && overlaps(windowRect(app.hwnd), windowRect(set.hwnd)) {
		placeSettings()
	}
}

// savePos запоминает, где стоит окно: за какой угол держаться.
func savePos() {
	r := windowRect(app.hwnd)
	a := anchorFor(r, workAreaOf(app.hwnd))
	app.settings.Anchor = &a
	app.settings.HasPos, app.settings.X, app.settings.Y = true, int(r.L), int(r.T)
	app.settings.save()
}

// moveToCorner возвращает виджет в правый верхний угол основного экрана.
func moveToCorner() {
	var wa rect
	pSystemParametersInfo.Call(spiGetWorkArea, 0, uintptr(unsafe.Pointer(&wa)), 0)
	app.settings.Anchor = &anchor{Right: true, X: int(wa.R) - 20, Y: int(wa.T) + 20}
	applySize()
	savePos()
}

func startPosition(s Settings) (int, int) {
	var wa rect
	pSystemParametersInfo.Call(spiGetWorkArea, 0, uintptr(unsafe.Pointer(&wa)), 0)
	x, y := int(wa.R)-initCSSW-20, int(wa.T)+20
	if s.HasPos {
		x, y = s.X, s.Y
	}
	return clampToScreen(x, y, initCSSW, initCSSH, virtualScreen())
}

func virtualScreen() rect {
	g := func(i uintptr) int32 { r, _, _ := pGetSystemMetrics.Call(i); return int32(r) }
	l, t := g(smXVirtual), g(smYVirtual)
	return rect{L: l, T: t, R: l + g(smCXVirtual), B: t + g(smCYVirtual)}
}

// setRaised поднимает виджет над программами, пока он настраивается, и возвращает обратно.
func setRaised(on bool) {
	if on == raised {
		return
	}
	raised = on
	if app.settings.Topmost {
		return
	}
	if on {
		forceRaise = true
		pSetWindowPos.Call(app.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		forceRaise = false
		return
	}
	setTopmost(false)
}
