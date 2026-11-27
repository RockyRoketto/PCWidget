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

// underCursor переносит окно r туда, где ему быть по курсору: (cx, cy) минус точка (gx, gy), за которую взяли.
// Считать от предложенного системой места нельзя: она отталкивается от прошлого, уже прилипшего,
// и медленным движением окно от края не оторвать.
func underCursor(r rect, cx, cy, gx, gy int32) rect {
	x, y := cx-gx, cy-gy
	return rect{x, y, x + r.R - r.L, y + r.B - r.T}
}

// dragRect — место окна, которое тащат мышью: целиком внутри рабочей области, а ближе snap к чему-то
// ровному прилипает (магнит): к краям и середине экрана, к краям окон others. Размер не меняется.
func dragRect(r, work rect, snap int32, others []rect) rect {
	w, h := r.R-r.L, r.B-r.T
	xs := []int32{work.L, work.R - w, work.L + (work.R-work.L-w)/2}
	ys := []int32{work.T, work.B - h, work.T + (work.B-work.T-h)/2}
	for _, o := range others {
		// окно притягивает, только если виджет рядом с ним по другой оси
		if r.T < o.B+snap && o.T < r.B+snap {
			xs = append(xs, o.L-w, o.R, o.L, o.R-w) // слева, справа, вровень по левому и правому краю
		}
		if r.L < o.R+snap && o.L < r.R+snap {
			ys = append(ys, o.T-h, o.B, o.T, o.B-h)
		}
	}
	x := magnet(r.L, xs, snap, work.L, work.R-w)
	y := magnet(r.T, ys, snap, work.T, work.B-h)
	return rect{x, y, x + w, y + h}
}

// magnet возвращает ближайшую к v точку притяжения (ближе snap) внутри [lo, hi]; нет такой — v,
// не выпуская за пределы. Окно больше экрана (hi < lo): левый (верхний) край важнее.
func magnet(v int32, points []int32, snap, lo, hi int32) int32 {
	v = max(min(v, hi), lo)
	best, dist := v, snap
	for _, p := range points {
		if d := max(p-v, v-p); d < dist && p >= lo && p <= max(hi, lo) {
			best, dist = p, d
		}
	}
	return best
}
