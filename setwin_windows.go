package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

// Окно настроек: отдельное окно рядом с виджетом, со своим WebView2 и страницей assets/settings.html.
// Размер у него постоянный. Создаётся при первом открытии, потом только прячется.
// Обе страницы держат свою копию настроек; изменения одной Go сохраняет и передаёт другой (__cfg).

const (
	setClass = "PCWidgetSettings"
	setCSSW  = 380
	setCSSH  = 600
	setMinH  = 420
	fullCSSW = 344 // ширина виджета в полном режиме (base.css)
	stripH   = 48  // высота полоски с запасом
	setGap   = 12
)

type setWin struct {
	hwnd    uintptr
	cr      *edge.Chromium
	busy    bool // окно создаётся
	ready   bool
	open    bool
	tab     string
	style   string // тема, под которую настроены стекло и углы
	cssH    int
	editing bool // в виджете включена правка плиток
}

var (
	set       = &setWin{cssH: setCSSH}
	setProcCB = windows.NewCallback(setProc)
)

func setProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmSize:
		if set.cr != nil {
			set.cr.Resize()
		}
		return 0
	case wmActivate:
		if loword(wp) != 0 && set.open {
			runOnUI(set.cr.Focus) // клавиатура сразу в странице
		}
	case wmDpiChanged:
		r := (*rect)(unsafe.Pointer(lp))
		dpi := int(loword(wp))
		pSetWindowPos.Call(hwnd, 0, uintptr(r.L), uintptr(r.T), uintptr(scalePx(setCSSW, dpi)), uintptr(scalePx(set.cssH, dpi)), swpNoZOrder|swpNoActivate)
		return 0
	case wmExitSizeMove:
		styleSettings(true)
		return 0
	case wmClose:
		closeSettings()
		return 0
	}
	r, _, _ := pDefWindowProc.Call(hwnd, m, wp, lp)
	return r
}

// openSettings показывает настройки на нужной вкладке ("" = на той же). Звать только через runOnUI:
// создание WebView крутит свой цикл сообщений.
func openSettings(tab string) {
	if tab != "" {
		set.tab = tab
	}
	if set.cr == nil {
		if !set.busy {
			set.busy = true
			createSettings()
			set.busy = false
		}
		return // страница сама сообщит, что готова
	}
	if !set.ready {
		return
	}
	set.cr.Eval("window.__init(" + initData() + ")")
	if !set.open {
		hideTip()
		placeSettings()
		set.open = true
		setRaised(true)
	}
	styleSettings(true)
	pSetWindowPos.Call(set.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpShowWindow)
	set.cr.Show()
	forceForeground(set.hwnd)
	set.cr.Focus()
	updateEditing()
}

func closeSettings() {
	if !set.open {
		return
	}
	set.open = false
	pShowWindow.Call(set.hwnd, swHide)
	set.cr.Hide()
	setRaised(false)
	updateEditing()
}

// updateEditing: пока открыта вкладка «Плитки», плитки правятся прямо на виджете.
func updateEditing() {
	on := set.open && set.tab == "tiles"
	if on == set.editing {
		return
	}
	set.editing = on
	if on {
		sendCmd("editing:1")
	} else {
		sendCmd("editing:0")
	}
}

func createSettings() {
	page, err := buildSettingsPage()
	if err != nil {
		logf("settings page: %v", err)
		return
	}
	if set.hwnd == 0 && !createSettingsWindow() {
		return
	}
	cr := edge.NewChromium()
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "webview")
	cr.AdditionalBrowserArgs = browserArgs() // обязано совпадать с главным окном
	cr.MessageCallback = func(m string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) { onSetPage(m) }
	cr.SetErrorCallback(func(err error) { logf("settings webview: %v", err) })
	if !cr.Embed(set.hwnd) {
		return
	}
	set.cr = cr
	cr.SetBackgroundColour(0, 0, 0, 0)
	if st, err := cr.GetSettings(); err == nil {
		st.PutAreDefaultContextMenusEnabled(false)
		st.PutAreDevToolsEnabled(false)
		st.PutIsZoomControlEnabled(false)
		st.PutIsStatusBarEnabled(false)
		st.PutAreBrowserAcceleratorKeysEnabled(false)
	}
	cr.Resize()
	cr.NavigateToString(page)
}

func createSettingsWindow() bool {
	hInst, _, _ := pGetModuleHandle.Call(0)
	cur, _, _ := pLoadCursor.Call(0, idcArrow)
	wc := struct {
		cbSize                 uint32
		style                  uint32
		proc                   uintptr
		clsExtra, wndExtra     int32
		inst, icon, cursor, bg uintptr
		menu, class            *uint16
		iconSm                 uintptr
	}{}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	wc.proc, wc.inst, wc.cursor, wc.icon = setProcCB, hInst, cur, appIcon()
	wc.class = utf16(setClass)
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))
	h, _, _ := pCreateWindowEx.Call(wsExToolWindow|wsExTopmost, uintptr(unsafe.Pointer(wc.class)),
		uintptr(unsafe.Pointer(utf16("PC Widget: настройки"))), wsPopup, 0, 0, setCSSW, setCSSH, 0, 0, hInst, 0)
	set.hwnd = h
	return h != 0
}

// onSetPage — сообщения страницы настроек.
func onSetPage(m string) {
	switch {
	case m == "ready":
		set.ready = true
		runOnUI(func() { openSettings("") })
	case m == "close":
		runOnUI(closeSettings)
	case m == "drag":
		pReleaseCapture.Call()
		pPostMessage.Call(set.hwnd, wmNCLButtonDown, htCaption, 0)
	case strings.HasPrefix(m, "tab:"):
		set.tab = m[4:]
		updateEditing()
	case strings.HasPrefix(m, "cfg:"):
		onCfg(m[4:])
		evalCfg(app.cr, app.ready, m[4:])
	case strings.HasPrefix(m, "live:"): // ползунок ещё тянут: показать, но на диск пока не писать
		evalCfg(app.cr, app.ready, m[5:])
	case m == "topmost:1" || m == "topmost:0":
		if (m == "topmost:1") != app.settings.Topmost {
			runOnUI(toggleTopmost)
		}
	case strings.HasPrefix(m, "sys:"):
		runOnUI(func() { onSys(m[4:]) })
	}
}

// evalCfg отдаёт странице настройки, изменённые в другом окне.
func evalCfg(cr *edge.Chromium, ready bool, raw string) {
	if cr != nil && ready && json.Valid([]byte(raw)) {
		cr.Eval("window.__cfg(" + raw + ")")
	}
}

// placeSettings ставит окно рядом с виджетом (см. settingsRect).
func placeSettings() {
	work := workAreaOf(app.hwnd)
	a := anchorFor(windowRect(app.hwnd), work)
	if app.settings.Anchor != nil {
		a = *app.settings.Anchor
	}
	dpi := dpiOf(app.hwnd)
	sc := func(css int) int { return scalePx(css, dpi) }
	z := app.brief.Scale
	spot := setSpot{w: sc(setCSSW), h: sc(setCSSH), minH: sc(setMinH), fullW: sc(fullCSSW * z / 100), stripH: sc(stripH * z / 100), gap: sc(setGap)}
	x, y, h := settingsRect(a, spot, work)
	set.cssH = h * 96 / dpi
	// Сначала на нужный монитор (там может быть другой масштаб), потом окончательный размер.
	pSetWindowPos.Call(set.hwnd, 0, uintptr(x), uintptr(y), 0, 0, swpNoSize|swpNoZOrder|swpNoActivate)
	pSetWindowPos.Call(set.hwnd, 0, uintptr(x), uintptr(y), uintptr(spot.w), uintptr(h), swpNoZOrder|swpNoActivate)
	set.cr.Resize()
}

// styleSettings — стекло и углы окна по теме.
func styleSettings(force bool) {
	if set.hwnd == 0 || (!force && set.style == app.brief.Theme) {
		return
	}
	set.style = app.brief.Theme
	setGlassFor(set.hwnd, set.style == "glass", set.style == "terminal")
}
