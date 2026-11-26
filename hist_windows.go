package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

// Окно карточки подробного графика (hist.go). Не активируется и не забирает фокус: щелчок по
// переключателю доходит до страницы, но виджет и другие окна остаются как были.

const histClass = "PCWidgetHist"

var hist struct {
	hwnd  uintptr
	cr    *edge.Chromium
	ready bool
	want  bool // страница просит показать: размер, пришедший после скрытия, окно не откроет
	shown bool
	style string
	tile  rect // плитка в CSS px окна виджета
	w, h  int  // размер карточки, CSS px
}

var histProcCB = windows.NewCallback(histProc)

func histProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmSize:
		if hist.cr != nil {
			hist.cr.Resize()
		}
		return 0
	case wmMouseActivate:
		return maNoActivate
	}
	r, _, _ := pDefWindowProc.Call(hwnd, m, wp, lp)
	return r
}

// createHist создаёт скрытое окно карточки. Если не вышло, карточки просто не будет.
func createHist(hInst uintptr) {
	page, err := buildHistPage()
	if err != nil {
		logf("hist page: %v", err)
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
	wc.proc = histProcCB
	wc.inst, wc.cursor = hInst, cur
	wc.class = utf16(histClass)
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))

	h, _, _ := pCreateWindowEx.Call(wsExToolWindow|wsExNoActivate|wsExTopmost, uintptr(unsafe.Pointer(wc.class)), 0,
		wsPopup, 0, 0, 10, 10, 0, 0, hInst, 0)
	if h == 0 {
		return
	}
	hist.hwnd = h
	cr := edge.NewChromium()
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "webview")
	cr.AdditionalBrowserArgs = browserArgs()
	cr.MessageCallback = func(m string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) {
		onHistPage(m)
	}
	cr.SetErrorCallback(func(err error) { logf("hist webview: %v", err) })
	if !cr.Embed(h) {
		return
	}
	hist.cr = cr
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

// Сообщения окна карточки: размер, переключатель «10 мин / час», мышь над карточкой.
func onHistPage(m string) {
	switch {
	case m == "ready":
		hist.ready = true
	case len(m) > 5 && m[:5] == "size:":
		if w, h, ok := parseSize(m[5:]); ok {
			hist.w, hist.h = w, h
			placeHist()
		}
	case len(m) > 6 && m[:6] == "range:":
		toWidget("window.__histRange(" + strconv.Quote(m[6:]) + ")")
	case m == "over:1", m == "over:0":
		toWidget("window.__histOver(" + m[5:] + ")")
	}
}

func toWidget(js string) {
	if app.cr != nil && app.ready {
		app.cr.Eval(js)
	}
}

// showHist принимает карточку от страницы виджета; пустая строка прячет окно.
func showHist(raw string) {
	if hist.cr == nil || !hist.ready {
		return
	}
	var r struct {
		Theme string     `json:"theme"`
		Tile  [4]float64 `json:"tile"` // x, y, ширина, высота

	}
	if raw == "" || menu.open || !app.visible || json.Unmarshal([]byte(raw), &r) != nil {
		hideHist()
		return
	}
	hist.want = true
	t := r.Tile
	hist.tile = rect{L: int32(t[0]), T: int32(t[1]), R: int32(t[0] + t[2]), B: int32(t[1] + t[3])}
	if r.Theme != hist.style {
		hist.style = r.Theme
		setStyleFor(hist.hwnd, r.Theme)
	}
	hist.cr.Eval("window.__show(" + raw + ")") // страница ответит размером, тогда и ставим окно
}

// placeHist ставит карточку у виджета напротив плитки, целиком на экране.
func placeHist() {
	if !hist.want || hist.w == 0 {
		return
	}
	dpi := dpiOf(app.hwnd)
	win := windowRect(app.hwnd)
	px := func(v int32) int32 { return int32(scalePx(int(v), dpi)) }
	tile := rect{L: win.L + px(hist.tile.L), T: win.T + px(hist.tile.T), R: win.L + px(hist.tile.R), B: win.T + px(hist.tile.B)}
	w, h := scalePx(hist.w, dpi), scalePx(hist.h, dpi)
	work := workAreaAt(int(tile.L+tile.R)/2, int(tile.T+tile.B)/2)
	x, y := histPos(tile, win, w, h, scalePx(8, dpi), work)
	pSetWindowPos.Call(hist.hwnd, hwndTopmost, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate|swpShowWindow)
	hist.cr.Resize()
	if !hist.shown {
		hist.shown = true
		hist.cr.Show()
	}
}

func hideHist() {
	hist.want = false
	if !hist.shown {
		return
	}
	hist.shown = false
	pShowWindow.Call(hist.hwnd, swHide)
	if hist.cr != nil {
		hist.cr.Eval("window.__show(null)")
	}
}
