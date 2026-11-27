package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// Окна, к краям которых прилипает виджет, пока его тащат. Список снимается один раз, когда взяли.

const dwmFrameBounds = 9 // DWMWA_EXTENDED_FRAME_BOUNDS: видимая рамка, без невидимых полей и тени

var (
	snapTargets []rect
	snapFound   []rect
	snapCB      = windows.NewCallback(func(h, _ uintptr) uintptr {
		if h == app.hwnd || !programWindow(h) {
			return 1
		}
		var r rect
		if hr, _, _ := pDwmGetWindowAttr.Call(h, dwmFrameBounds, uintptr(unsafe.Pointer(&r)), unsafe.Sizeof(r)); hr == 0 {
			snapFound = append(snapFound, r)
		}
		return 1
	})
)

// otherWindows — видимые окна программ. Только в потоке UI.
func otherWindows() []rect {
	snapFound = nil
	pEnumWindows.Call(snapCB, 0)
	return snapFound
}
