package main

import (
	"strconv"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	nimAdd    = 0
	nimDelete = 2
	nifMsg    = 0x1
	nifIcon   = 0x2
	nifTip    = 0x4
	trayID    = 1

	imageIcon  = 1
	lrShared   = 0x8000
	smCxSmIcon = 49
	smCySmIcon = 50

	nimModify = 1
	nifInfo   = 0x10
	niifWarn  = 0x02

	cmdToggle    = 1
	cmdTopmost   = 2
	cmdSettings  = 3
	cmdAutostart = 4
	cmdInstall   = 5
	cmdUninstall = 6
	cmdPawn      = 7
	cmdExit      = 9
	cmdTheme     = 10 // 10..13
	cmdMode      = 20 // 20..24
	cmdProfile   = 30 // 30..35
)

// Порядок совпадает с ключами в странице (assets/js/00-core.js).
var (
	themeKeys = []string{"sheet", "gauge", "fill", "lcd"}
	themeText = []string{"Лист", "Прибор", "Заливка", "ЖК-табло"}
	modeKeys  = []string{"full", "wide", "column", "strip", "square"}
	modeText  = []string{"Панель", "Широкая", "Колонка", "Полоска", "Квадрат"}
)

type notifyIconData struct {
	cbSize           uint32
	hWnd             uintptr
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            uintptr
	szTip            [128]uint16
	dwState          uint32
	dwStateMask      uint32
	szInfo           [256]uint16
	uTimeout         uint32
	szInfoTitle      [64]uint16
	dwInfoFlags      uint32
	guidItem         windows.GUID
	hBalloonIcon     uintptr
}

func trayData() notifyIconData {
	var n notifyIconData
	n.cbSize = uint32(unsafe.Sizeof(n))
	n.hWnd = app.hwnd
	n.uID = trayID
	return n
}

// appIcon — иконка из ресурсов exe (группа «APP», winres/winres.json); нет её — системная.
func appIcon() uintptr {
	hInst, _, _ := pGetModuleHandle.Call(0)
	if ico, _, _ := pLoadIcon.Call(hInst, uintptr(unsafe.Pointer(utf16("APP")))); ico != 0 {
		return ico
	}
	ico, _, _ := pLoadIcon.Call(0, idiApplication)
	return ico
}

// smallIcon — тот же значок сразу в мелком размере системы: у него свой рисунок,
// уменьшенный из 32 px получается мутным.
func smallIcon() uintptr {
	hInst, _, _ := pGetModuleHandle.Call(0)
	cx, _, _ := pGetSystemMetrics.Call(smCxSmIcon)
	cy, _, _ := pGetSystemMetrics.Call(smCySmIcon)
	if ico, _, _ := pLoadImage.Call(hInst, uintptr(unsafe.Pointer(utf16("APP"))), imageIcon, cx, cy, lrShared); ico != 0 {
		return ico
	}
	return appIcon()
}

func trayAdd() {
	n := trayData()
	ico := smallIcon()
	n.uFlags = nifMsg | nifIcon | nifTip
	n.uCallbackMessage = wmTray
	n.hIcon = ico
	copy(n.szTip[:], windows.StringToUTF16("PC Widget"))
	pShellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&n)))
}

func trayRemove() {
	n := trayData()
	pShellNotifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&n)))
}

func onTray(lp uintptr) {
	switch loword(lp) {
	case wmLButtonUp:
		toggleVisible()
	case wmRButtonUp:
		showMenu()
	}
}

// submenu строит подменю с «радио»-отметкой на выбранном пункте.
func submenu(baseID int, texts, keys []string, current string) uintptr {
	sm, _, _ := pCreatePopupMenu.Call()
	for i, t := range texts {
		fl := uintptr(mfString)
		if keys[i] == current {
			fl |= mfChecked
		}
		pAppendMenu.Call(sm, fl, uintptr(baseID+i), uintptr(unsafe.Pointer(utf16(t))))
	}
	return sm
}

// showNativeMenu — системное меню у курсора, запасное: пока страницы не готовы (основное в menu_windows.go).
func showNativeMenu() {
	m, _, _ := pCreatePopupMenu.Call()
	defer pDestroyMenu.Call(m) // подменю уничтожаются вместе с родителем

	toggleText := "Скрыть"
	if !app.visible {
		toggleText = "Показать"
	}
	topFlags := uintptr(mfString)
	if app.settings.Topmost {
		topFlags |= mfChecked
	}
	curMode := app.brief.Mode
	pAppendMenu.Call(m, mfString, cmdToggle, uintptr(unsafe.Pointer(utf16(toggleText))))
	pAppendMenu.Call(m, mfPopup, submenu(cmdMode, modeText, modeKeys, curMode), uintptr(unsafe.Pointer(utf16("Размер"))))
	pAppendMenu.Call(m, mfPopup, submenu(cmdTheme, themeText, themeKeys, app.brief.Theme), uintptr(unsafe.Pointer(utf16("Тема"))))
	profs := profileNames()
	if len(profs) > 0 {
		pAppendMenu.Call(m, mfPopup, submenu(cmdProfile, profs, profs, ""), uintptr(unsafe.Pointer(utf16("Профиль"))))
	}
	pAppendMenu.Call(m, mfString, cmdSettings, uintptr(unsafe.Pointer(utf16("Настройки…"))))
	pAppendMenu.Call(m, topFlags, cmdTopmost, uintptr(unsafe.Pointer(utf16("Поверх всех окон"))))
	pAppendMenu.Call(m, mfSeparator, 0, 0)
	if hub.available() && !pawnInstalled() {
		pAppendMenu.Call(m, mfString, cmdPawn, uintptr(unsafe.Pointer(utf16("Поставить драйвер для температуры CPU…"))))
	}
	if installed() {
		autoFlags := uintptr(mfString)
		if app.settings.autostartEnabled() {
			autoFlags |= mfChecked
		}
		pAppendMenu.Call(m, autoFlags, cmdAutostart, uintptr(unsafe.Pointer(utf16("Запускать при старте Windows"))))
		pAppendMenu.Call(m, mfString, cmdUninstall, uintptr(unsafe.Pointer(utf16("Удалить PC Widget…"))))
	} else {
		pAppendMenu.Call(m, mfString, cmdInstall, uintptr(unsafe.Pointer(utf16("Установить (автозапуск)…"))))
	}
	pAppendMenu.Call(m, mfSeparator, 0, 0)
	pAppendMenu.Call(m, mfString, cmdExit, uintptr(unsafe.Pointer(utf16("Выход"))))

	var p point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	pSetForegroundWindow.Call(app.hwnd) // иначе меню из трея не закрывается кликом мимо
	id, _, _ := pTrackPopupMenu.Call(m, tpmReturnCmd|tpmNoNotify|tpmRightButton, uintptr(p.X), uintptr(p.Y), 0, app.hwnd, 0)
	switch {
	case id == cmdToggle:
		toggleVisible()
	case id == cmdTopmost:
		toggleTopmost()
	case id == cmdPawn:
		installPawnIO(hub)
	case id == cmdInstall:
		app.settings.save()
		startInstall()
	case id == cmdUninstall:
		startUninstall()
	case id == cmdAutostart:
		setAutostart(!app.settings.autostartEnabled())
	case id == cmdSettings:
		if !app.visible {
			toggleVisible()
		}
		openSettings("")
	case id >= cmdTheme && id < cmdTheme+uintptr(len(themeKeys)):
		sendCmd("theme:" + themeKeys[id-cmdTheme])
	case id >= cmdMode && id < cmdMode+uintptr(len(modeKeys)):
		sendCmd("mode:" + modeKeys[id-cmdMode])
	case id >= cmdProfile && id < cmdProfile+uintptr(len(profs)):
		sendCmd("profile:" + strconv.Itoa(int(id-cmdProfile)))
	case id == cmdExit:
		app.settings.save()
		pDestroyWindow.Call(app.hwnd)
	}
}

// trayNotify показывает всплывающее уведомление Windows (по умолчанию выключено в настройках).
func trayNotify(text string) {
	n := trayData()
	n.uFlags = nifInfo
	n.dwInfoFlags = niifWarn
	copy(n.szInfoTitle[:63], windows.StringToUTF16("PC Widget"))
	copy(n.szInfo[:255], windows.StringToUTF16(text))
	pShellNotifyIcon.Call(nimModify, uintptr(unsafe.Pointer(&n)))
}
