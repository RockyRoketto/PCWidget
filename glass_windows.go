package main

import "unsafe"

type accentPolicy struct {
	state, flags, gradientColor, animationID uint32
}

type compAttrData struct {
	attr uint32
	data uintptr
	size uintptr
}

// setGlass включает или выключает размытие под окном.
// Win11 22621+: системный backdrop; старее: accent acrylic. Не получилось — окно остаётся
// просто полупрозрачным (тема рисует тёмную подложку сама).
func setGlass(on bool) { setGlassFor(app.hwnd, on) }

func setGlassFor(h uintptr, on bool) {
	round := int32(2) // DWMWCP_ROUND
	pDwmSetWindowAttribute.Call(h, 33, uintptr(unsafe.Pointer(&round)), 4)
	dark := int32(1) // DWMWA_USE_IMMERSIVE_DARK_MODE
	pDwmSetWindowAttribute.Call(h, 20, uintptr(unsafe.Pointer(&dark)), 4)
	yes := int32(1)                                                      // не прятать окно в режиме peek / «показать рабочий стол»
	pDwmSetWindowAttribute.Call(h, 12, uintptr(unsafe.Pointer(&yes)), 4) // DWMWA_EXCLUDED_FROM_PEEK
	pDwmSetWindowAttribute.Call(h, 11, uintptr(unsafe.Pointer(&yes)), 4) // DWMWA_DISALLOW_PEEK

	if windowsBuild() >= 22621 {
		m := [4]int32{}
		bt := int32(1) // DWMSBT_NONE
		if on {
			m = [4]int32{-1, -1, -1, -1}
			bt = 3 // DWMSBT_TRANSIENTWINDOW (acrylic)
		}
		pDwmExtendFrame.Call(h, uintptr(unsafe.Pointer(&m)))
		pDwmSetWindowAttribute.Call(h, 38, uintptr(unsafe.Pointer(&bt)), 4)
		return
	}
	ap := accentPolicy{state: 0}
	if on {
		ap = accentPolicy{state: 4, flags: 2, gradientColor: 0x661A1616} // ACRYLICBLURBEHIND, AABBGGRR
	}
	d := compAttrData{attr: 19, data: uintptr(unsafe.Pointer(&ap)), size: unsafe.Sizeof(ap)}
	pSetWindowCompAttribute.Call(h, uintptr(unsafe.Pointer(&d)))
}
