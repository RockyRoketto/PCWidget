package main

import "strings"

// Карточка подробного графика: окно рядом с виджетом. Историю копит и разметку собирает
// страница виджета (assets/js/95-hover.js), окно только показывает её (hist_windows.go).

// buildHistPage собирает страницу окна карточки: те же стили, что у виджета.
func buildHistPage() (string, error) {
	idx, err := assetsFS.ReadFile("assets/hist.html")
	if err != nil {
		return "", err
	}
	css, err := concatGlob("assets/css/*.css")
	if err != nil {
		return "", err
	}
	return strings.Replace(string(idx), "/*{{CSS}}*/", css, 1), nil
}

// histPos ставит карточку w×h у виджета win напротив плитки tile: слева, справа, сверху или снизу,
// там, где она целиком влезает в рабочую область и ближе всего к плитке. Виджет карточка не закрывает,
// чтобы не мешать наводить мышь на соседние плитки. Если не влезает нигде, прижимается к краю экрана.
func histPos(tile, win rect, w, h, gap int, work rect) (int, int) {
	tx, ty := int(tile.L+tile.R)/2, int(tile.T+tile.B)/2
	alongY := func(y int) int { return clampInt(y, int(work.T), int(work.B)-h) }
	alongX := func(x int) int { return clampInt(x, int(work.L), int(work.R)-w) }
	cands := [][2]int{
		{int(win.L) - gap - w, alongY(int(tile.T))}, // слева
		{int(win.R) + gap, alongY(int(tile.T))},     // справа
		{alongX(int(tile.L)), int(win.T) - gap - h}, // сверху
		{alongX(int(tile.L)), int(win.B) + gap},     // снизу
	}
	best, bestD := -1, 0
	for i, c := range cands {
		if c[0] < int(work.L) || c[1] < int(work.T) || c[0]+w > int(work.R) || c[1]+h > int(work.B) {
			continue
		}
		dx, dy := c[0]+w/2-tx, c[1]+h/2-ty
		if d := dx*dx + dy*dy; best < 0 || d < bestD {
			best, bestD = i, d
		}
	}
	if best < 0 { // экран мал: у плитки, сколько влезет
		return clampToScreen(int(tile.R)+gap, int(tile.T), w, h, work)
	}
	return cands[best][0], cands[best][1]
}

func clampInt(v, lo, hi int) int {
	if v > hi {
		v = hi
	}
	if v < lo {
		v = lo
	}
	return v
}
