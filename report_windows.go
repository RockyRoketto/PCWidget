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

// Окно итога игры: карточка по центру монитора. Появляется, не забирая фокус; щелчок активирует его
// как обычное окно. WebView создаётся при первом показе.

const (
	reportClass = "PCWidgetReport"
	reportCSSW  = 560
	reportCSSH  = 420
)

var report struct {
	hwnd       uintptr
	cr         *edge.Chromium
	busy       bool
	ready      bool
	open       bool
	saving     bool
	data       *GameReport
	cssW, cssH int
	mon        uintptr
}

var reportProcCB = windows.NewCallback(reportProc)

func reportProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmSize:
		if report.cr != nil {
			report.cr.Resize()
		}
		return 0
	case wmClose:
		closeReport()
		return 0
	}
	r, _, _ := pDefWindowProc.Call(hwnd, m, wp, lp)
	return r
}

func showLastReport() {
	if r := loadLastReport(); r != nil {
		showReport(r)
	}
}

// showReport показывает карточку итога (в потоке UI).
func showReport(r *GameReport) {
	report.data = r
	report.mon = gameMonitor()
	if report.cr == nil {
		if !report.busy {
			report.busy = true
			createReport()
			report.busy = false
		}
		return // страница сама сообщит, что готова
	}
	sendReport()
}

// sendReport отдаёт странице данные; окно встанет на место, когда она ответит размером.
func sendReport() {
	if report.cr == nil || !report.ready || report.data == nil {
		return
	}
	report.open = true
	b, err := json.Marshal(map[string]any{"r": report.data, "ui": app.settings.UI, "accent": lastAccent})
	if err == nil {
		report.cr.Eval("window.__show(" + string(b) + ")")
	}
}

func createReport() {
	page, err := buildReportPage()
	if err != nil {
		logf("report page: %v", err)
		return
	}
	if report.hwnd == 0 && !createReportWindow() {
		return
	}
	cr := edge.NewChromium()
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "pcwidget", "webview")
	cr.AdditionalBrowserArgs = browserArgs() // обязано совпадать с главным окном
	cr.MessageCallback = func(m string, _ *edge.ICoreWebView2, _ *edge.ICoreWebView2WebMessageReceivedEventArgs) {
		onReportPage(m)
	}
	cr.SetErrorCallback(func(err error) { logf("report webview: %v", err) })
	if !cr.Embed(report.hwnd) {
		return
	}
	report.cr = cr
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

func createReportWindow() bool {
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
	wc.proc, wc.inst, wc.cursor, wc.icon = reportProcCB, hInst, cur, appIcon()
	wc.class = utf16(reportClass)
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))
	h, _, _ := pCreateWindowEx.Call(wsExToolWindow|wsExTopmost, uintptr(unsafe.Pointer(wc.class)),
		uintptr(unsafe.Pointer(utf16("PC Widget: итог игры"))), wsPopup, 0, 0, reportCSSW, reportCSSH, 0, 0, hInst, 0)
	if h == 0 {
		return false
	}
	report.hwnd = h
	round := int32(2) // DWMWCP_ROUND
	pDwmSetWindowAttribute.Call(h, 33, uintptr(unsafe.Pointer(&round)), 4)
	return true
}

// placeReport ставит окно по центру рабочей области того монитора, где шла игра.
func placeReport() {
	if !report.open {
		return
	}
	mi := monitorInfo{size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfo.Call(report.mon, uintptr(unsafe.Pointer(&mi)))
	var dx, dy uint32
	if r, _, _ := pGetDpiForMonitor.Call(report.mon, 0, uintptr(unsafe.Pointer(&dx)), uintptr(unsafe.Pointer(&dy))); r != 0 || dx == 0 {
		dx = 96
	}
	w, h := scalePx(report.cssW, int(dx)), scalePx(report.cssH, int(dx))
	x := int(mi.work.L+mi.work.R)/2 - w/2
	y := int(mi.work.T+mi.work.B)/2 - h/2
	x, y = clampToScreen(x, y, w, h, mi.work)
	pSetWindowPos.Call(report.hwnd, hwndTopmost, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate|swpShowWindow)
	report.cr.Resize()
	report.cr.Show()
}

func closeReport() {
	if !report.open {
		return
	}
	report.open = false
	pShowWindow.Call(report.hwnd, swHide)
	report.cr.Hide()
}

func onReportPage(m string) {
	switch {
	case m == "ready":
		report.ready = true
		runOnUI(sendReport)
	case m == "close":
		runOnUI(closeReport)
	case m == "drag":
		pReleaseCapture.Call()
		pPostMessage.Call(report.hwnd, wmNCLButtonDown, htCaption, 0)
	case strings.HasPrefix(m, "size:"):
		if w, h, ok := parseSize(m[5:]); ok {
			report.cssW, report.cssH = w, h
			runOnUI(placeReport)
		}
	case strings.HasPrefix(m, "save:"):
		runOnUI(func() { saveReportPicture(m[5:]) })
	}
}

// saveReportPicture пишет картинку, нарисованную страницей, туда, куда укажет человек.
func saveReportPicture(dataURL string) {
	if report.saving || report.data == nil {
		return
	}
	b, err := decodePNG(dataURL)
	if err != nil {
		return
	}
	report.saving = true
	defer func() { report.saving = false }()
	path := fileDialogOf(report.hwnd, true, "Сохранить картинку", reportFileName(report.data.Name, report.data.End), "Картинка PNG (*.png)\x00*.png", "png")
	if path == "" {
		return
	}
	msg := "Сохранено"
	if err := os.WriteFile(path, b, 0o644); err != nil {
		logf("report save: %v", err)
		msg = "Файл не записан"
	}
	if report.cr != nil {
		q, _ := json.Marshal(msg)
		report.cr.Eval("window.__saved(" + string(q) + ")")
	}
}
