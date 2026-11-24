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

// Окно подсказки: отдельное маленькое окно рядом с виджетом (со своим WebView2 и теми же стилями).
// Появляется с той стороны, где есть место на экране. Оно же показывает меню (menu_windows.go).

const tipClass = "PCWidgetTip"

type tipWin struct {
	hwnd  uintptr
	cr    *edge.Chromium
	ready bool
	want  bool    // подсказка сейчас запрошена
	rowY  float64 // верх строки под курсором, CSS px от верха виджета
	w, h  int     // размер плашки, CSS px
	req   string  // последний запрос (ждёт готовности страницы)
}

var (
	tip       = &tipWin{}
	tipProcCB = windows.NewCallback(tipProc)

	pMonitorFromWindow = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfo    = user32.NewProc("GetMonitorInfoW")
)

type monitorInfo struct {
	size    uint32
	monitor rect
	work    rect
	flags   uint32
}

func tipProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmSize:
		if tip.cr != nil {
			tip.cr.Resize()
		}
		return 0
	case wmMouseActivate:
		if !menu.open {
			return maNoActivate
		}
	case wmActivate:
		if loword(wp) == 0 {
			closeMenu() // клик мимо меню
		}
	}
	r, _, _ := pDefWindowProc.Call(hwnd, m, wp, lp)
	return r
}

// createTip создаёт скрытое окно подсказки. Если не вышло, подсказок просто не будет.
func createTip(hInst uintptr) {
	page, err := buildTipPage()
	if err != nil {
		logf("tip page: %v", err)
		return
	}
	cur, _, _ := pLoadCursor.Call(0, idcArrow)
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
	wc.style = 0
	wc.proc = tipProcCB
	wc.inst, wc.cursor = hInst, cur
	wc.class = utf16(tipClass)
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))

	h, _, _ := pCreateWindowEx.Call(wsExToolWindow|wsExNoActivate|wsExTopmost, uintptr(unsafe.Pointer(wc.class)), 0,
		wsPopup, 0, 0, 10, 10, 0, 0, hInst, 0)
	if h == 0 {
		return
	}
	tip.hwnd = h
	cr := edge.NewChromium()
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "webview")
	cr.AdditionalBrowserArgs = browserArgs() // обязано совпадать с главным окном, иначе WebView2 откажет
	cr.MessageCallback = func(m string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) { onTipPage(m) }
	cr.SetErrorCallback(func(err error) { logf("tip webview: %v", err) })
	if !cr.Embed(h) {
		return
	}
	tip.cr = cr
	cr.SetBackgroundColour(0, 0, 0, 0)
	if st, err := cr.GetSettings(); err == nil {
		st.PutAreDefaultContextMenusEnabled(false)
		st.PutAreDevToolsEnabled(false)
		st.PutIsZoomControlEnabled(false)
		st.PutIsStatusBarEnabled(false)
	}
	cr.Resize()
	cr.NavigateToString(page)
}

// showTipRequest принимает от страницы {html, y, h, theme}, отдаёт html окну подсказки.
func showTipRequest(raw string) {
	if tip.cr == nil || !app.visible || menu.open {
		return
	}
	if !cursorOverWidget() { // виджет закрыт другим окном: подсказка не нужна
		hideTip()
		return
	}
	var r struct {
		Y     float64 `json:"y"`
		Theme string  `json:"theme"`
	}
	if json.Unmarshal([]byte(raw), &r) != nil {
		return
	}
	tip.want, tip.rowY = true, r.Y
	setGlassFor(tip.hwnd, r.Theme == "glass", r.Theme == "terminal")
	tip.req = raw
	if tip.ready {
		tip.cr.Eval("window.__tip(" + raw + ")")
	}
}

func hideTip() {
	if tip.hwnd == 0 || menu.open {
		return
	}
	tip.want = false
	pShowWindow.Call(tip.hwnd, swHide)
}

func onTipPage(m string) {
	switch {
	case m == "ready":
		tip.ready = true
		if tip.want && tip.req != "" {
			tip.cr.Eval("window.__tip(" + tip.req + ")")
		}
	case strings.HasPrefix(m, "cmd:"):
		runOnUI(func() { onMenuCmd(m[4:]) }) // не внутри обработчика WebView: пункты показывают окна
	case m == "close":
		closeMenu()
	case strings.HasPrefix(m, "size:"):
		if w, h, ok := parseSize(m[5:]); ok {
			tip.w, tip.h = w, h
			if menu.open {
				placeMenu()
			} else {
				placeTip()
			}
		}
	}
}

// placeTip ставит окно подсказки сбоку от виджета, где есть место на экране.
func placeTip() {
	if !tip.want || tip.w == 0 {
		return
	}
	dpi, _, _ := pGetDpiForWindow.Call(app.hwnd)
	if dpi == 0 {
		dpi = 96
	}
	sc := func(v int) int { return v * int(dpi) / 96 }
	w, h, gap := sc(tip.w), sc(tip.h), sc(8)

	var mr rect
	pGetWindowRect.Call(app.hwnd, uintptr(unsafe.Pointer(&mr)))
	mon, _, _ := pMonitorFromWindow.Call(app.hwnd, 2) // MONITOR_DEFAULTTONEAREST
	mi := monitorInfo{size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))

	x := int(mr.R) + gap
	if x+w > int(mi.work.R) { // справа места нет: плашка слева
		x = int(mr.L) - gap - w
	}
	if x < int(mi.work.L) {
		x = int(mi.work.L)
	}
	y := int(mr.T) + int(tip.rowY*float64(dpi)/96)
	if y+h > int(mi.work.B) {
		y = int(mi.work.B) - h
	}
	if y < int(mi.work.T) {
		y = int(mi.work.T)
	}
	pSetWindowPos.Call(tip.hwnd, hwndTopmost, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate|swpShowWindow)
	tip.cr.Resize()
	tip.cr.Show()
}

var (
	pWindowFromPoint = user32.NewProc("WindowFromPoint")
	pGetAncestor     = user32.NewProc("GetAncestor")
)

// cursorOverWidget: под курсором именно окно виджета (а не другая программа поверх него).
func cursorOverWidget() bool {
	var p point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	h, _, _ := pWindowFromPoint.Call(uintptr(uint32(p.X)) | uintptr(uint32(p.Y))<<32)
	if h == 0 {
		return false
	}
	root, _, _ := pGetAncestor.Call(h, 2) // GA_ROOT
	return root == app.hwnd || root == tip.hwnd
}
