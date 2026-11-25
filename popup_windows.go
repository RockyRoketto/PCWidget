package main

import (
	"os"
	"path/filepath"
	"strings"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

// Окно меню: отдельное маленькое окно со своим WebView2 и теми же стилями. Управление им в menu_windows.go.

const popupClass = "PCWidgetMenu"

type popupWin struct {
	hwnd  uintptr
	cr    *edge.Chromium
	ready bool
	w, h  int // размер меню, CSS px
}

var (
	popup       = &popupWin{}
	popupProcCB = windows.NewCallback(popupProc)

	pMonitorFromWindow = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfo    = user32.NewProc("GetMonitorInfoW")
)

type monitorInfo struct {
	size    uint32
	monitor rect
	work    rect
	flags   uint32
}

func popupProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmSize:
		if popup.cr != nil {
			popup.cr.Resize()
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

// createPopup создаёт скрытое окно меню. Если не вышло, работает системное меню.
func createPopup(hInst uintptr) {
	page, err := buildPopupPage()
	if err != nil {
		logf("menu page: %v", err)
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
	wc.proc = popupProcCB
	wc.inst, wc.cursor = hInst, cur
	wc.class = utf16(popupClass)
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))

	h, _, _ := pCreateWindowEx.Call(wsExToolWindow|wsExNoActivate|wsExTopmost, uintptr(unsafe.Pointer(wc.class)), 0,
		wsPopup, 0, 0, 10, 10, 0, 0, hInst, 0)
	if h == 0 {
		return
	}
	popup.hwnd = h
	cr := edge.NewChromium()
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "webview")
	cr.AdditionalBrowserArgs = browserArgs() // обязано совпадать с главным окном, иначе WebView2 откажет
	cr.MessageCallback = func(m string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) {
		onPopupPage(m)
	}
	cr.SetErrorCallback(func(err error) { logf("menu webview: %v", err) })
	if !cr.Embed(h) {
		return
	}
	popup.cr = cr
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

func onPopupPage(m string) {
	switch {
	case m == "ready":
		popup.ready = true
	case strings.HasPrefix(m, "cmd:"):
		runOnUI(func() { onMenuCmd(m[4:]) }) // не внутри обработчика WebView: пункты показывают окна
	case m == "close":
		closeMenu()
	case strings.HasPrefix(m, "size:"):
		if w, h, ok := parseSize(m[5:]); ok {
			popup.w, popup.h = w, h
			if menu.open {
				placeMenu()
			}
		}
	}
}
