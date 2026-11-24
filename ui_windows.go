package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

const (
	initCSSW = 330
	initCSSH = 200
	winClass = "PCWidgetWindow"
)

type ui struct {
	hwnd     uintptr
	cr       *edge.Chromium
	square   bool // прямые углы окна (Ретро-терминал)
	glassOn  bool
	cssW     int
	cssH     int
	ready    bool
	visible  bool
	settings Settings
	taskbarC uint32 // сообщение TaskbarCreated
	brief    uiBrief
}

var (
	app       = &ui{cssW: initCSSW, cssH: initCSSH, visible: true}
	uiMu      sync.Mutex
	uiQueue   []func()
	wndProcCB = windows.NewCallback(wndProc)
)

// runOnUI выполняет f в потоке окна (любой другой поток вызывать WebView не может).
func runOnUI(f func()) {
	uiMu.Lock()
	uiQueue = append(uiQueue, f)
	uiMu.Unlock()
	if app.hwnd != 0 {
		pPostMessage.Call(app.hwnd, wmRunUI, 0, 0)
	}
}

func drainUI() {
	uiMu.Lock()
	q := uiQueue
	uiQueue = nil
	uiMu.Unlock()
	for _, f := range q {
		f()
	}
}

// createUI создаёт окно и WebView2. Возвращает false, если нет WebView2 Runtime.
func createUI(s Settings, page string) bool {
	app.settings = s
	readBrief()
	hInst, _, _ := pGetModuleHandle.Call(0)
	cur, _, _ := pLoadCursor.Call(0, idcArrow)
	ico := appIcon()

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
	wc.style = csHRedraw | csVRedraw
	wc.proc = wndProcCB
	wc.inst, wc.icon, wc.cursor, wc.iconSm = hInst, ico, cur, ico
	wc.class = utf16(winClass)
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))

	x, y := startPosition(s)
	exStyle := uintptr(wsExToolWindow | wsExNoActivate)
	h, _, _ := pCreateWindowEx.Call(exStyle, uintptr(unsafe.Pointer(wc.class)), uintptr(unsafe.Pointer(utf16("PC Widget"))),
		wsPopup, uintptr(x), uintptr(y), initCSSW, initCSSH, 0, 0, hInst, 0)
	if h == 0 {
		return false
	}
	app.hwnd = h
	tb, _, _ := pRegisterWindowMessage.Call(uintptr(unsafe.Pointer(utf16("TaskbarCreated"))))
	app.taskbarC = uint32(tb)

	applySize()
	setGlass(true)
	if s.Topmost {
		setTopmost(true)
	}

	cr := edge.NewChromium()
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "webview")
	cr.MessageCallback = func(m string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) { onPage(m) }
	cr.AdditionalBrowserArgs = browserArgs()
	cr.SetErrorCallback(func(err error) { logf("webview: %v", err) })
	if !cr.Embed(h) {
		return false
	}
	app.cr = cr
	cr.SetBackgroundColour(0, 0, 0, 0)
	if st, err := cr.GetSettings(); err == nil {
		st.PutAreDefaultContextMenusEnabled(false)
		st.PutAreDevToolsEnabled(os.Getenv("PCWIDGET_DEBUG") != "")
		st.PutIsZoomControlEnabled(false)
		st.PutIsStatusBarEnabled(false)
		st.PutAreBrowserAcceleratorKeysEnabled(false)
	}
	cr.Resize()
	cr.NavigateToString(page)
	createTip(hInst)

	pShowWindow.Call(h, swShowNA)
	if !s.Topmost {
		sendToDesktopLevel()
	}
	installDesktopHook()
	cr.Show() // WebView создан при скрытом окне: без этого страница остаётся hidden и не рисуется
	trayAdd()
	return true
}

// browserArgs: параметры окружения WebView2 одинаковы у всех окон. В отладке открывается порт CDP.
func browserArgs() []string {
	if os.Getenv("PCWIDGET_DEBUG") != "" {
		return []string{"--remote-debugging-port=9222"}
	}
	return nil
}

func runLoop() {
	var m msg
	for {
		r, _, _ := pGetMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		pDispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func wndProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmRunUI:
		drainUI()
		return 0
	case wmSize:
		if app.cr != nil {
			app.cr.Resize()
		}
		return 0
	case wmDpiChanged:
		// Новое положение берём у системы, а размер пересчитываем из CSS-размера страницы.
		r := (*rect)(unsafe.Pointer(lp))
		dpi := int(loword(wp))
		logf("dpiChanged dpi=%d", dpi)
		pSetWindowPos.Call(hwnd, 0, uintptr(r.L), uintptr(r.T), uintptr((app.cssW*dpi+48)/96), uintptr((app.cssH*dpi+48)/96), swpNoZOrder|swpNoActivate)
		// WebView обновляет масштаб с задержкой: повторяем размер и стекло, когда он уже новый.
		go func() {
			time.Sleep(200 * time.Millisecond)
			runOnUI(func() {
				applySize()
				if app.cr != nil {
					app.cr.Resize()
				}
				setGlass(app.glassOn)
			})
		}()
		return 0
	case wmDisplayChange:
		// Набор мониторов изменился (при автозапуске второй монитор может появиться позже):
		// возвращаем окно на сохранённое место, а не на то, куда его загнали при старте.
		if app.settings.HasPos {
			x, y := clampToScreen(app.settings.X, app.settings.Y, app.cssW, app.cssH, virtualScreen())
			pSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), 0, 0, swpNoSize|swpNoZOrder|swpNoActivate)
		}
		return 0
	case wmWindowPosChanging:
		onWindowPosChanging(lp)
	case wmMouseActivate:
		if !app.settings.Topmost {
			return maNoActivate // клик не должен поднимать виджет над программами
		}
	case wmExitSizeMove:
		savePos()
		return 0
	case wmTray:
		onTray(lp)
		return 0
	case wmDestroy:
		trayRemove()
		pPostQuitMessage.Call(0)
		return 0
	}
	if app.taskbarC != 0 && uint32(m) == app.taskbarC {
		trayAdd() // проводник перезапустился
		return 0
	}
	r, _, _ := pDefWindowProc.Call(hwnd, m, wp, lp)
	return r
}

// onPage обрабатывает сообщения страницы (в потоке UI).
func onPage(m string) {
	switch {
	case m == "ready":
		app.ready = true
		b, _ := json.Marshal(map[string]any{"ui": app.settings.UI, "topmost": app.settings.Topmost})
		app.cr.Eval("window.__init(" + string(b) + ")")
	case m == "drag":
		hideTip()
		pReleaseCapture.Call()
		pPostMessage.Call(app.hwnd, wmNCLButtonDown, htCaption, 0)
	case m == "menu":
		hideTip()
		showMenu()
	case strings.HasPrefix(m, "cfg:"):
		onCfg(m[4:])
	case strings.HasPrefix(m, "topmost:"):
		setTopmost(m == "topmost:1")
		app.settings.save()
	case strings.HasPrefix(m, "tip:"):
		showTipRequest(m[4:])
	case m == "tipoff":
		hideTip()
	case strings.HasPrefix(m, "notify:"):
		trayNotify(m[7:])
	case strings.HasPrefix(m, "size:"):
		w, h, ok := parseSize(m[5:])
		if ok {
			app.cssW, app.cssH = w, h
			applySize()
		}
	case strings.HasPrefix(m, "glass:"):
		setGlass(m == "glass:1")
	case strings.HasPrefix(m, "corners:"):
		app.square = m == "corners:square"
		setGlass(app.glassOn)
	}
}

// uiBrief — то, что Go нужно знать из настроек страницы (отметки в меню).
type uiBrief struct {
	Theme   string `json:"theme"`
	Mode    string `json:"mode"`
	Compact string `json:"compact"`
}

func readBrief() {
	app.brief = uiBrief{Theme: "glass", Mode: "full", Compact: "column"}
	if len(app.settings.UI) > 0 {
		_ = json.Unmarshal(app.settings.UI, &app.brief)
	}
}

// onCfg сохраняет настройки интерфейса, присланные страницей.
func onCfg(raw string) {
	if !json.Valid([]byte(raw)) {
		return
	}
	app.settings.UI = json.RawMessage(raw)
	readBrief()
	app.settings.save()
}

// sendCmd передаёт странице команду из меню («theme:neon», «mode:strip», «settings»).
func sendCmd(c string) {
	if app.cr != nil && app.ready {
		app.cr.Eval(`window.__cmd("` + c + `")`)
	}
}

func parseSize(s string) (w, h int, ok bool) {
	a, b, found := strings.Cut(s, ",")
	if !found {
		return
	}
	w, e1 := strconv.Atoi(a)
	h, e2 := strconv.Atoi(b)
	return w, h, e1 == nil && e2 == nil && w > 0 && h > 0 && w < 4000 && h < 4000
}

// applySize переводит CSS-пиксели страницы в физические с учётом DPI окна.
func applySize() {
	dpi, _, _ := pGetDpiForWindow.Call(app.hwnd)
	if dpi == 0 {
		dpi = 96
	}
	w := (app.cssW*int(dpi) + 48) / 96
	h := (app.cssH*int(dpi) + 48) / 96
	logf("applySize css=%dx%d dpi=%d -> %dx%d", app.cssW, app.cssH, dpi, w, h)
	pSetWindowPos.Call(app.hwnd, 0, 0, 0, uintptr(w), uintptr(h), swpNoMove|swpNoZOrder|swpNoActivate)

	// Выросшее окно не должно вылезать за экран.
	var r rect
	pGetWindowRect.Call(app.hwnd, uintptr(unsafe.Pointer(&r)))
	if x, y := clampToScreen(int(r.L), int(r.T), w, h, virtualScreen()); x != int(r.L) || y != int(r.T) {
		pSetWindowPos.Call(app.hwnd, 0, uintptr(x), uintptr(y), 0, 0, swpNoSize|swpNoZOrder|swpNoActivate)
	}
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

func savePos() {
	var r rect
	pGetWindowRect.Call(app.hwnd, uintptr(unsafe.Pointer(&r)))
	app.settings.HasPos, app.settings.X, app.settings.Y = true, int(r.L), int(r.T)
	app.settings.save()
}

func setTopmost(on bool) {
	app.settings.Topmost = on
	if on {
		pSetWindowPos.Call(app.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		return
	}
	pSetWindowPos.Call(app.hwnd, hwndNoTop, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
	sendToDesktopLevel()
}

func toggleVisible() {
	if app.visible {
		pShowWindow.Call(app.hwnd, swHide)
		if app.cr != nil {
			app.cr.Hide()
		}
	} else {
		pShowWindow.Call(app.hwnd, swShowNA)
		if app.cr != nil {
			app.cr.Show()
		}
	}
	app.visible = !app.visible
}

// pushStats отправляет JSON в страницу (из любого потока). Скрытому окну не шлём.
func pushStats(js string) {
	runOnUI(func() {
		if app.cr != nil && app.ready && app.visible {
			app.cr.Eval("window.__stats(" + js + ")")
		}
	})
}
