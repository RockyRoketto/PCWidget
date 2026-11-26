package main

import (
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

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

// setStyle настраивает вид окна виджета. style = «тема:светлость» от страницы (sheet:dark, fill:light).
func setStyle(style string) { app.style = style; setStyleFor(app.hwnd, style) }

// parseStyle разбирает «тема:светлость»; неизвестная тема = Лист, светлость по умолчанию тёмная.
func parseStyle(style string) (theme string, light bool) {
	theme, tone, _ := strings.Cut(style, ":")
	if theme != "gauge" && theme != "fill" && theme != "lcd" {
		theme = "sheet"
	}
	return theme, tone == "light"
}

// setStyleFor: Лист — размытие под окном (accent acrylic) и системное скругление;
// Прибор, Заливка и ЖК-табло — окно полностью прозрачно, панель и карточки со скруглением рисует страница.
// Не получилось размытие — окно остаётся просто полупрозрачным (подложку рисует страница).
func setStyleFor(h uintptr, style string) {
	theme, light := parseStyle(style)
	glass := theme == "sheet"
	round := int32(2) // DWMWCP_ROUND
	if !glass {
		round = 1 // DWMWCP_DONOTROUND
	}
	pDwmSetWindowAttribute.Call(h, 33, uintptr(unsafe.Pointer(&round)), 4)
	dark := int32(1) // DWMWA_USE_IMMERSIVE_DARK_MODE
	if light {
		dark = 0
	}
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
	setClear(h, !glass)
	ap := accentPolicy{state: 0}
	if glass {
		tint := uint32(0x101B1513) // AABBGGRR; плотность рисует страница (--glass)
		if light {
			tint = 0x10FBF9F6
		}
		ap = accentPolicy{state: 4, flags: 2, gradientColor: tint} // ACRYLICBLURBEHIND
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

// windowsAccent — цвет акцента Windows как #rrggbb ("" — не прочитался).
func windowsAccent() string {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\DWM`, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, err := k.GetIntegerValue("AccentColor")
	if err != nil {
		return ""
	}
	return accentHex(uint32(v))
}

// accentHex: в реестре AABBGGRR.
func accentHex(v uint32) string {
	return fmt.Sprintf("#%02x%02x%02x", v&0xFF, v>>8&0xFF, v>>16&0xFF)
}
