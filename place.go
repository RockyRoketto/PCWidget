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

// anchor — угол, за который держится виджет: при смене размера (режим, плитки, масштаб) этот угол
// остаётся на месте. X, Y — координаты угла; Right, Bottom — какой это угол окна.
type anchor struct {
	Right  bool `json:"right"`
	Bottom bool `json:"bottom"`
	X      int  `json:"x"`
	Y      int  `json:"y"`
}

// anchorFor выбирает угол окна, ближайший к краям экрана.
func anchorFor(win, work rect) anchor {
	a := anchor{X: int(win.L), Y: int(win.T)}
	if win.L-work.L > work.R-win.R {
		a.Right, a.X = true, int(win.R)
	}
	if win.T-work.T > work.B-win.B {
		a.Bottom, a.Y = true, int(win.B)
	}
	return a
}

// probe — точка чуть внутри окна от угла: по ней ищется монитор.
func (a anchor) probe() (int, int) {
	x, y := a.X+8, a.Y+8
	if a.Right {
		x = a.X - 8
	}
	if a.Bottom {
		y = a.Y - 8
	}
	return x, y
}

// pos — левый верхний угол окна w*h, которое держится за якорь и не вылезает за экран.
// Сам якорь при этом не меняется: окно, ставшее меньше, вернётся на своё место.
func (a anchor) pos(w, h int, bounds rect) (int, int) {
	x, y := a.X, a.Y
	if a.Right {
		x -= w
	}
	if a.Bottom {
		y -= h
	}
	return clampToScreen(x, y, w, h, bounds)
}

// setSpot — размеры (в физических пикселях), нужные для места окна настроек.
type setSpot struct {
	w, h, minH int // окно настроек
	fullW      int // ширина виджета в полном режиме
	stripH     int // высота полоски
	gap        int
}

// settingsRect ставит окно настроек рядом с виджетом так, чтобы ни в одном режиме виджет его не накрыл:
// сбоку дальше самого широкого «столбика» (полный режим) и ниже (выше) полоски. Поэтому при смене
// режима окно настроек никуда не двигается. Мало места по высоте: окно становится ниже, до minH.
func settingsRect(a anchor, s setSpot, work rect) (x, y, h int) {
	x = a.X + s.fullW + s.gap
	if a.Right {
		x = a.X - s.fullW - s.gap - s.w
	}
	room := int(work.B) - (a.Y + s.stripH + s.gap) - s.gap
	if a.Bottom {
		room = a.Y - s.stripH - s.gap - int(work.T) - s.gap
	}
	h = min(s.h, max(room, s.minH))
	y = a.Y + s.stripH + s.gap
	if a.Bottom {
		y = a.Y - s.stripH - s.gap - h
	}
	x, y = clampToScreen(x, y, s.w, h, work)
	return x, y, h
}

func overlaps(a, b rect) bool { return a.L < b.R && b.L < a.R && a.T < b.B && b.T < a.B }

// dragRect — место окна, которое тащат мышью: целиком внутри рабочей области, а у края ближе snap
// прилипает к нему (магнит). Размер окна не меняется.
func dragRect(r, work rect, snap int32) rect {
	w, h := r.R-r.L, r.B-r.T
	x, y := r.L, r.T
	if x-work.L < snap {
		x = work.L
	}
	if work.R-(x+w) < snap {
		x = work.R - w
	}
	if y-work.T < snap {
		y = work.T
	}
	if work.B-(y+h) < snap {
		y = work.B - h
	}
	if x < work.L { // окно шире экрана: левый край важнее
		x = work.L
	}
	if y < work.T {
		y = work.T
	}
	return rect{x, y, x + w, y + h}
}

// atSide — окно стоит вплотную к левому или правому краю рабочей области (туда его прилепил магнит).
func atSide(r, work rect) bool { return r.L <= work.L || r.R >= work.R }
