package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// Все ленивые вызовы WinAPI в одном месте.
var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	dwmapi   = windows.NewLazySystemDLL("dwmapi.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	ntdll    = windows.NewLazySystemDLL("ntdll.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	pRegisterClassEx        = user32.NewProc("RegisterClassExW")
	pCreateWindowEx         = user32.NewProc("CreateWindowExW")
	pDefWindowProc          = user32.NewProc("DefWindowProcW")
	pGetMessage             = user32.NewProc("GetMessageW")
	pTranslateMessage       = user32.NewProc("TranslateMessage")
	pDispatchMessage        = user32.NewProc("DispatchMessageW")
	pPostMessage            = user32.NewProc("PostMessageW")
	pPostQuitMessage        = user32.NewProc("PostQuitMessage")
	pDestroyWindow          = user32.NewProc("DestroyWindow")
	pShowWindow             = user32.NewProc("ShowWindow")
	pSetWindowPos           = user32.NewProc("SetWindowPos")
	pGetWindowRect          = user32.NewProc("GetWindowRect")
	pReleaseCapture         = user32.NewProc("ReleaseCapture")
	pGetCursorPos           = user32.NewProc("GetCursorPos")
	pSetForegroundWindow    = user32.NewProc("SetForegroundWindow")
	pCreatePopupMenu        = user32.NewProc("CreatePopupMenu")
	pAppendMenu             = user32.NewProc("AppendMenuW")
	pTrackPopupMenu         = user32.NewProc("TrackPopupMenu")
	pDestroyMenu            = user32.NewProc("DestroyMenu")
	pLoadIcon               = user32.NewProc("LoadIconW")
	pLoadCursor             = user32.NewProc("LoadCursorW")
	pGetSystemMetrics       = user32.NewProc("GetSystemMetrics")
	pGetDpiForWindow        = user32.NewProc("GetDpiForWindow")
	pSetProcessDpiAwareCtx  = user32.NewProc("SetProcessDpiAwarenessContext")
	pRegisterWindowMessage  = user32.NewProc("RegisterWindowMessageW")
	pSystemParametersInfo   = user32.NewProc("SystemParametersInfoW")
	pSetWindowCompAttribute = user32.NewProc("SetWindowCompositionAttribute")
	pDwmSetWindowAttribute  = dwmapi.NewProc("DwmSetWindowAttribute")
	pDwmExtendFrame         = dwmapi.NewProc("DwmExtendFrameIntoClientArea")
	pShellNotifyIcon        = shell32.NewProc("Shell_NotifyIconW")
	pRtlGetVersion          = ntdll.NewProc("RtlGetVersion")
	pGetModuleHandle        = kernel32.NewProc("GetModuleHandleW")
)

const (
	wsPopup         = 0x80000000
	wsExToolWindow  = 0x00000080
	wsExTopmost     = 0x00000008
	swpShowWindow   = 0x0040
	mfPopup         = 0x0010
	csHRedraw       = 0x0002
	csVRedraw       = 0x0001
	csDropShadow    = 0x00020000
	swHide          = 0
	swShowNA        = 8
	swpNoSize       = 0x0001
	swpNoMove       = 0x0002
	swpNoZOrder     = 0x0004
	swpNoActivate   = 0x0010
	wmDestroy       = 0x0002
	wmSize          = 0x0005
	wmNCLButtonDown = 0x00A1
	wmExitSizeMove  = 0x0232
	wmDpiChanged    = 0x02E0
	wmDisplayChange = 0x007E
	wmLButtonUp     = 0x0202
	wmRButtonUp     = 0x0205
	wmApp           = 0x8000
	wmRunUI         = wmApp + 1
	wmTray          = wmApp + 2
	htCaption       = 2
	idiApplication  = 32512
	idcArrow        = 32512
	smXVirtual      = 76
	smYVirtual      = 77
	smCXVirtual     = 78
	smCYVirtual     = 79
	spiGetWorkArea  = 0x0030
	tpmReturnCmd    = 0x0100
	tpmNoNotify     = 0x0080
	tpmRightButton  = 0x0002
	mfString        = 0x0000
	mfSeparator     = 0x0800
	mfChecked       = 0x0008
)

var (
	hwndTopmost = ^uintptr(0) // (HWND)-1
	hwndBottom  = uintptr(1)
	hwndNoTop   = ^uintptr(1) // (HWND)-2
)

type point struct{ X, Y int32 }
type rect struct{ L, T, R, B int32 }

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
}

func utf16(s string) *uint16 {
	p, _ := windows.UTF16PtrFromString(s)
	return p
}

func loword(v uintptr) uint32 { return uint32(v) & 0xFFFF }

// windowsBuild возвращает номер сборки Windows (22621 = 11 22H2).
func windowsBuild() uint32 {
	var vi struct {
		size                uint32
		major, minor, build uint32
		platform            uint32
		csd                 [128]uint16
	}
	vi.size = uint32(unsafe.Sizeof(vi))
	pRtlGetVersion.Call(uintptr(unsafe.Pointer(&vi)))
	return vi.build
}

func setDPIAware() {
	// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4. Манифест подстрахует позже.
	pSetProcessDpiAwareCtx.Call(^uintptr(3))
}
