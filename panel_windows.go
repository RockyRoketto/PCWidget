package main

import "unsafe"

// Панель настроек открывается рядом с виджетом в том же окне: окно становится шире в ту сторону,
// где есть место, сам виджет остаётся на месте. После закрытия окно возвращается как было.

var panel struct {
	open, closing bool
	right         bool // при смене размера держать правый край (панель слева)
	moved         bool // пока панель открыта, окно перетащили
	x, y          int  // где окно стояло до открытия
}

var raised bool // виджет временно поверх всех окон: открыты настройки или правка плиток

func workArea() rect {
	mon, _, _ := pMonitorFromWindow.Call(app.hwnd, monitorNearest)
	mi := monitorInfo{size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))
	return mi.work
}

func winRect() rect {
	var r rect
	pGetWindowRect.Call(app.hwnd, uintptr(unsafe.Pointer(&r)))
	return r
}

// onPanel: страница просит место под панель шириной cssW (0 = панель закрыта, размер придёт следом).
func onPanel(cssW int) {
	if cssW == 0 {
		panel.open, panel.closing = false, true
		return
	}
	dpi, _, _ := pGetDpiForWindow.Call(app.hwnd)
	if dpi == 0 {
		dpi = 96
	}
	r := winRect()
	panel.open, panel.closing, panel.moved = true, false, false
	panel.x, panel.y = int(r.L), int(r.T)
	panel.right = panelLeft(r, workArea(), cssW*int(dpi)/96)
	sendSys()
	if panel.right {
		sendCmd("panel:left")
	} else {
		sendCmd("panel:right")
	}
}

// afterPanelClose возвращает окно на место после закрытия панели.
func afterPanelClose() {
	if !panel.closing {
		return
	}
	panel.closing, panel.right = false, false
	if panel.moved {
		savePos()
		return
	}
	pSetWindowPos.Call(app.hwnd, 0, uintptr(panel.x), uintptr(panel.y), 0, 0, swpNoSize|swpNoZOrder|swpNoActivate)
}

// moveToCorner возвращает виджет в правый верхний угол основного экрана.
func moveToCorner() {
	var wa rect
	pSystemParametersInfo.Call(spiGetWorkArea, 0, uintptr(unsafe.Pointer(&wa)), 0)
	r := winRect()
	pSetWindowPos.Call(app.hwnd, 0, uintptr(wa.R-(r.R-r.L)-20), uintptr(wa.T+20), 0, 0, swpNoSize|swpNoZOrder|swpNoActivate)
	// дальше панель слева: при закрытии виджет останется у правого края
	panel.moved, panel.right = true, true
	if panel.open {
		sendCmd("panelside:left")
	} else {
		panel.right = false
	}
	savePos()
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
