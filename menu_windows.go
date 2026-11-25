package main

import (
	"encoding/json"
	"strings"
	"unsafe"
)

// Своё меню (правая кнопка и трей). Разметку собирает страница виджета (assets/js/55-menu.js),
// показывает окно подсказки: на время меню оно становится активным и закрывается кликом мимо.
// Пока страницы не готовы, работает системное меню (showNativeMenu).

const (
	wmActivate     = 0x0006
	monitorNearest = 2
)

var (
	pMonitorFromPoint = user32.NewProc("MonitorFromPoint")
	shcore            = lazyDLL("shcore.dll")
	pGetDpiForMonitor = shcore.NewProc("GetDpiForMonitor")
)

var menu struct {
	open   bool
	placed bool // окно уже на месте: при перерисовке меняется только размер
	at     point
}

func sysInfo() string {
	b, _ := json.Marshal(map[string]any{
		"installed": installed(), "autostart": app.settings.autostartEnabled(),
		"driver": pawnInstalled(), "sensors": hub != nil && hub.available(),
		"topmost": app.settings.Topmost, "visible": app.visible,
	})
	return string(b)
}

// sendSys сообщает странице состояние системы (вкладка «Система», пункты меню).
func sendSys() {
	if app.cr != nil && app.ready {
		app.cr.Eval("window.__sys(" + sysInfo() + ")")
	}
	if set.open {
		set.cr.Eval("window.__sys(" + sysInfo() + ")")
	}
}

// showMenu показывает меню у курсора.
func showMenu() {
	if tip.cr == nil || !tip.ready || app.cr == nil || !app.ready {
		showNativeMenu()
		return
	}
	closeMenu()
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&menu.at)))
	requestMenu()
}

func requestMenu() { app.cr.Eval("window.__menu(" + sysInfo() + ")") }

// showMenuHTML принимает разметку меню от страницы и отдаёт её окну подсказки.
func showMenuHTML(raw string) {
	var r struct {
		Theme string `json:"theme"`
	}
	if tip.cr == nil || json.Unmarshal([]byte(raw), &r) != nil {
		return
	}
	tip.want = false
	menu.open = true
	setStyleFor(tip.hwnd, r.Theme)
	tip.cr.Eval("window.__tip(" + raw + ")")
}

// placeMenu ставит меню у курсора; если не влезает, раскрывает в другую сторону.
func placeMenu() {
	mon, _, _ := pMonitorFromPoint.Call(uintptr(uint32(menu.at.X))|uintptr(uint32(menu.at.Y))<<32, monitorNearest)
	mi := monitorInfo{size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))
	var dx, dy uint32
	if r, _, _ := pGetDpiForMonitor.Call(mon, 0, uintptr(unsafe.Pointer(&dx)), uintptr(unsafe.Pointer(&dy))); r != 0 || dx == 0 {
		dx = 96
	}
	w, h := (tip.w*int(dx)+48)/96, (tip.h*int(dx)+48)/96
	x, y := popupPos(int(menu.at.X), int(menu.at.Y), w, h, mi.work)
	pSetWindowPos.Call(tip.hwnd, hwndTopmost, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate|swpShowWindow)
	tip.cr.Resize()
	if menu.placed {
		return
	}
	menu.placed = true
	tip.cr.Show()
	setExStyle(tip.hwnd, wsExNoActivate, false)
	forceForeground(tip.hwnd)
	tip.cr.Focus()
}

func closeMenu() {
	if !menu.open {
		return
	}
	menu.open, menu.placed = false, false
	pShowWindow.Call(tip.hwnd, swHide)
	setExStyle(tip.hwnd, wsExNoActivate, true)
}

// onMenuCmd выполняет пункт меню. Режим и тема меняются, не закрывая меню.
func onMenuCmd(c string) {
	if !menu.open {
		return
	}
	if strings.HasPrefix(c, "mode:") || strings.HasPrefix(c, "theme:") {
		sendCmd(c)
		requestMenu()
		return
	}
	closeMenu()
	switch c {
	case "toggle":
		toggleVisible()
	case "topmost":
		toggleTopmost()
	case "edit", "settings":
		if !app.visible {
			toggleVisible()
		}
		if c == "edit" {
			openSettings("tiles")
		} else {
			openSettings("")
		}
	case "exit":
		app.settings.save()
		pDestroyWindow.Call(app.hwnd)
	default:
		onSys(c)
	}
}

// onSys выполняет действия вкладки «Система».
func onSys(c string) {
	switch c {
	case "install":
		app.settings.save()
		startInstall()
	case "uninstall":
		startUninstall()
	case "driver":
		installPawnIO(hub)
	case "corner":
		moveToCorner()
	case "autostart:1", "autostart:0":
		setAutostart(c == "autostart:1")
	}
}

func toggleTopmost() {
	on := !app.settings.Topmost
	setTopmost(on)
	app.settings.save()
	if raised && !on { // открыты настройки: пока остаёмся поверх, вниз уйдём, когда их закроют
		forceRaise = true
		pSetWindowPos.Call(app.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		forceRaise = false
	}
	sendSys()
}

// setExStyle включает или выключает бит расширенного стиля окна.
func setExStyle(h uintptr, bit uintptr, on bool) {
	st, _, _ := pGetWindowLong.Call(h, ^uintptr(19)) // GWL_EXSTYLE = -20
	if on {
		st |= bit
	} else {
		st &^= bit
	}
	pSetWindowLong.Call(h, ^uintptr(19), st)
}
