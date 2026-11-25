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

type dwmBlurBehind struct {
	flags, enable uint32
	rgn           uintptr
	onMaximized   uint32
}

// setStyle настраивает вид окна виджета под тему.
func setStyle(theme string) { app.style = theme; setStyleFor(app.hwnd, theme) }

// setStyleFor: Стекло — размытие (accent acrylic) и системное скругление; Терминал — прямые углы;
// Apple — само окно полностью прозрачно, скруглённые карточки рисует страница.
// Не получилось размытие — окно остаётся просто полупрозрачным (тема рисует тёмную подложку сама).
func setStyleFor(h uintptr, theme string) {
	on := theme == "glass"
	round := int32(2) // DWMWCP_ROUND
	if theme != "glass" {
		round = 1 // DWMWCP_DONOTROUND
	}
	pDwmSetWindowAttribute.Call(h, 33, uintptr(unsafe.Pointer(&round)), 4)
	dark := int32(1) // DWMWA_USE_IMMERSIVE_DARK_MODE
	pDwmSetWindowAttribute.Call(h, 20, uintptr(unsafe.Pointer(&dark)), 4)
	yes := int32(1)                                                      // не прятать окно в режиме peek / «показать рабочий стол»
	pDwmSetWindowAttribute.Call(h, 12, uintptr(unsafe.Pointer(&yes)), 4) // DWMWA_EXCLUDED_FROM_PEEK
	pDwmSetWindowAttribute.Call(h, 11, uintptr(unsafe.Pointer(&yes)), 4) // DWMWA_DISALLOW_PEEK

	// Тень рисуется DWM только окнам с расширенной рамкой, а системный backdrop без неё не работает.
	// Поэтому размытие везде делается accent-acrylic, рамка не расширяется: тени нет.
	if windowsBuild() >= 22621 {
		m := [4]int32{}
		bt := int32(1) // DWMSBT_NONE
		pDwmExtendFrame.Call(h, uintptr(unsafe.Pointer(&m)))
		pDwmSetWindowAttribute.Call(h, 38, uintptr(unsafe.Pointer(&bt)), 4)
	}
	setClear(h, theme == "apple")
	ap := accentPolicy{state: 0}
	if on {
		ap = accentPolicy{state: 4, flags: 2, gradientColor: 0x101B1513} // ACRYLICBLURBEHIND, AABBGGRR; плотность рисует страница (--glass)
	}
	d := compAttrData{attr: 19, data: uintptr(unsafe.Pointer(&ap)), size: unsafe.Sizeof(ap)}
	pSetWindowCompAttribute.Call(h, uintptr(unsafe.Pointer(&d)))
}

// setClear: DWM учитывает прозрачность содержимого окна. Размытие при этом просим для пустой области, то есть нигде.
func setClear(h uintptr, on bool) {
	bb := dwmBlurBehind{flags: 1} // DWM_BB_ENABLE
	if on {
		bb.flags, bb.enable = 3, 1 // | DWM_BB_BLURREGION
		bb.rgn, _, _ = pCreateRectRgn.Call(0, 0, ^uintptr(0), ^uintptr(0))
		defer pDeleteObject.Call(bb.rgn)
	}
	pDwmEnableBlurBehind.Call(h, uintptr(unsafe.Pointer(&bb)))
}
