package main

// Чистые расчёты положения окон (без WinAPI).

// popupPos ставит меню w*h у точки: вправо-вниз, а где не влезает, в другую сторону, внутри рабочей области.
func popupPos(px, py, w, h int, work rect) (int, int) {
	x, y := px, py
	if x+w > int(work.R) {
		x = px - w
	}
	if y+h > int(work.B) {
		y = py - h
	}
	return clampToScreen(x, y, w, h, work)
}

// panelLeft: панель настроек шириной need встаёт слева, если справа от виджета места нет, а слева есть.
func panelLeft(win, work rect, need int) bool {
	return int(work.R-win.R) < need && int(win.L-work.L) >= need
}
