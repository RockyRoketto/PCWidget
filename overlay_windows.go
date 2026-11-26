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

// Игровой режим: прозрачная панель поверх всех окон в углу монитора, где сейчас игра.
// Окно слоистое и прозрачное для мыши (WS_EX_LAYERED | WS_EX_TRANSPARENT): клики уходят в игру.
// Видно поверх игр в окне и в окне без рамки; эксклюзивный полноэкранный режим перекрыть нельзя.
// Горячая клавиша зарегистрирована на этом окне, WebView создаётся при первом включении.

const (
	ovClass       = "PCWidgetOverlay"
	ovHotkeyID    = 1
	ovMarginCSS   = 12
	wmHotkey      = 0x0312
	wsExLayered   = 0x00080000
	wsExTransp    = 0x00000020
	lwaAlpha      = 0x2
	ovInitialCSSW = 180
	ovInitialCSSH = 120
)

type overlayWin struct {
	hwnd    uintptr
	cr      *edge.Chromium
	busy    bool
	ready   bool
	on      bool
	cssW    int
	cssH    int
	hidMain bool    // главный виджет спрятали мы: вернуть при выключении
	keyErr  string  // горячую клавишу не удалось занять
	mon     uintptr // монитор, на котором стоит панель
}

var (
	ov         = &overlayWin{cssW: ovInitialCSSW, cssH: ovInitialCSSH}
	ovProcCB   = windows.NewCallback(ovProc)
	pRegHotKey = user32.NewProc("RegisterHotKey")
	pUnregHot  = user32.NewProc("UnregisterHotKey")
	pSetLayAtt = user32.NewProc("SetLayeredWindowAttributes")
)

func ovProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmHotkey:
		if wp == ovHotkeyID {
			runOnUI(toggleGame)
		}
		return 0
	case wmSize:
		if ov.cr != nil {
			ov.cr.Resize()
		}
		return 0
	case wmDisplayChange:
		ov.mon = 0
		placeOverlay()
		return 0
	}
	r, _, _ := pDefWindowProc.Call(hwnd, m, wp, lp)
	return r
}

func gameCfg() GameCfg { return gameCfgOf(app.settings.Game) }

// initGame создаёт скрытое окно панели и занимает горячую клавишу. Звать после createUI.
func initGame() {
	hInst, _, _ := pGetModuleHandle.Call(0)
	wc := struct {
		cbSize             uint32
		style              uint32
		proc               uintptr
		clsExtra, wndExtra int32
		inst, icon, cursor uintptr
		bg                 uintptr
		menu, class        *uint16
		iconSm             uintptr
	}{}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	wc.proc = ovProcCB
	wc.inst = hInst
	wc.class = utf16(ovClass)
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))
	h, _, _ := pCreateWindowEx.Call(wsExToolWindow|wsExNoActivate|wsExTopmost|wsExLayered|wsExTransp,
		uintptr(unsafe.Pointer(wc.class)), 0, wsPopup, 0, 0, ovInitialCSSW, ovInitialCSSH, 0, 0, hInst, 0)
	if h == 0 {
		return
	}
	ov.hwnd = h
	pSetLayAtt.Call(h, 0, 255, lwaAlpha) // слой непрозрачен, прозрачность — альфа содержимого WebView
	setClear(h, true)
	yes := int32(1)
	pDwmSetWindowAttribute.Call(h, 12, uintptr(unsafe.Pointer(&yes)), 4) // не прятать в «показать рабочий стол»
	pDwmSetWindowAttribute.Call(h, 11, uintptr(unsafe.Pointer(&yes)), 4)
	round := int32(1) // DWMWCP_DONOTROUND: углы рисует страница
	pDwmSetWindowAttribute.Call(h, 33, uintptr(unsafe.Pointer(&round)), 4)
	registerGameKey()
}

// registerGameKey занимает горячую клавишу из настроек (пусто — без неё).
func registerGameKey() {
	if ov.hwnd == 0 {
		return
	}
	pUnregHot.Call(ov.hwnd, ovHotkeyID)
	ov.keyErr = ""
	key := gameCfg().Key
	mods, vk, ok := parseHotkey(key)
	if !ok {
		return
	}
	if r, _, _ := pRegHotKey.Call(ov.hwnd, ovHotkeyID, uintptr(mods), uintptr(vk)); r == 0 {
		ov.keyErr = "Сочетание " + key + " уже занято другой программой"
	}
}

func createOverlayView() {
	page, err := buildOverlayPage()
	if err != nil {
		logf("overlay page: %v", err)
		return
	}
	cr := edge.NewChromium()
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "webview")
	cr.AdditionalBrowserArgs = browserArgs() // обязано совпадать с главным окном
	cr.MessageCallback = func(m string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) {
		onOverlayPage(m)
	}
	cr.SetErrorCallback(func(err error) { logf("overlay webview: %v", err) })
	if !cr.Embed(ov.hwnd) {
		return
	}
	ov.cr = cr
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

func onOverlayPage(m string) {
	switch {
	case m == "ready":
		ov.ready = true
		runOnUI(sendOverlayInit)
	case strings.HasPrefix(m, "size:"):
		if w, h, ok := parseSize(m[5:]); ok {
			ov.cssW, ov.cssH = w, h
			runOnUI(func() { ov.mon = 0; placeOverlay() })
		}
	}
}

// overlayInit — с чего начинает страница панели: оформление виджета и набор строк.
func overlayInit() string {
	b, _ := json.Marshal(map[string]any{"ui": app.settings.UI, "game": gameCfg(), "sys": json.RawMessage(sysInfo())})
	return string(b)
}

func sendOverlayInit() {
	if ov.cr != nil && ov.ready {
		ov.cr.Eval("window.__init(" + overlayInit() + ")")
	}
}

// gameMonitor — монитор окна на переднем плане (там игра), иначе монитор виджета.
func gameMonitor() uintptr {
	fg, _, _ := pGetForeground.Call()
	if fg == 0 || fg == ov.hwnd {
		fg = app.hwnd
	}
	mon, _, _ := pMonitorFromWindow.Call(fg, monitorNearest)
	return mon
}

// placeOverlay ставит панель в выбранный угол монитора с игрой и держит её поверх всех окон.
func placeOverlay() {
	if ov.hwnd == 0 || !ov.on {
		return
	}
	mon := gameMonitor()
	if mon == ov.mon {
		pSetWindowPos.Call(ov.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		return
	}
	ov.mon = mon
	mi := monitorInfo{size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))
	var dx, dy uint32
	if r, _, _ := pGetDpiForMonitor.Call(mon, 0, uintptr(unsafe.Pointer(&dx)), uintptr(unsafe.Pointer(&dy))); r != 0 || dx == 0 {
		dx = 96
	}
	dpi := int(dx)
	w, h := scalePx(ov.cssW, dpi), scalePx(ov.cssH, dpi)
	x, y := overlayPos(gameCfg().Corner, mi.monitor, w, h, scalePx(ovMarginCSS, dpi))
	pSetWindowPos.Call(ov.hwnd, hwndTopmost, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate|swpShowWindow)
	if ov.cr != nil {
		ov.cr.Resize()
	}
}

// setGame включает и выключает игровой режим (в потоке UI).
func setGame(on bool) {
	if ov.hwnd == 0 || on == ov.on {
		return
	}
	ov.on = on
	frames.setOn(on)
	sessions.setOn(on)
	if on {
		if ov.cr == nil && !ov.busy {
			ov.busy = true
			createOverlayView()
			ov.busy = false
		}
		ov.mon = 0
		placeOverlay()
		if ov.cr != nil {
			ov.cr.Show()
		}
		if gameCfg().HideMain && app.visible {
			toggleVisible()
			ov.hidMain = true
		}
	} else {
		pShowWindow.Call(ov.hwnd, swHide)
		if ov.cr != nil {
			ov.cr.Hide()
		}
		if ov.hidMain && !app.visible {
			toggleVisible()
		}
		ov.hidMain = false
	}
	sendSys()
}

func toggleGame() { setGame(!ov.on) }

// onGameCfg принимает настройки игрового режима со страницы настроек («game:{…}»).
func onGameCfg(raw string) {
	var g GameCfg
	if json.Unmarshal([]byte(raw), &g) != nil {
		return
	}
	c := gameCfgOf(&g)
	old := gameCfg()
	app.settings.Game = &c
	app.settings.save()
	if c.Key != old.Key {
		registerGameKey()
	}
	if ov.on {
		if c.HideMain != old.HideMain {
			if c.HideMain && app.visible {
				toggleVisible()
				ov.hidMain = true
			} else if !c.HideMain && ov.hidMain && !app.visible {
				toggleVisible()
				ov.hidMain = false
			}
		}
		ov.mon = 0
		placeOverlay()
	}
	sendOverlayInit()
	sendSys()
}

// pushOverlay отдаёт панели снимок показателей и заодно переставляет её, если игра на другом мониторе.
func pushOverlay(js string) {
	runOnUI(func() {
		if !ov.on || ov.cr == nil || !ov.ready {
			return
		}
		placeOverlay()
		ov.cr.Eval("window.__stats(" + js + ")")
	})
}

// checkIf — флаг пункта системного меню с отметкой.
func checkIf(on bool) uintptr {
	if on {
		return mfString | mfChecked
	}
	return mfString
}
