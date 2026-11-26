package main

import "testing"

func TestPopupPos(t *testing.T) {
	work := rect{L: 0, T: 0, R: 1920, B: 1040}
	cases := []struct{ px, py, wx, wy int }{
		{100, 100, 100, 100},    // вправо-вниз
		{1900, 100, 1660, 100},  // у правого края: влево
		{100, 1000, 100, 700},   // у нижнего: вверх
		{1900, 1070, 1660, 740}, // трей: курсор ниже рабочей области
		{-50, 100, 0, 100},      // за левым краем
	}
	for _, c := range cases {
		if x, y := popupPos(c.px, c.py, 240, 300, work); x != c.wx || y != c.wy {
			t.Errorf("popupPos(%d,%d) = %d,%d; want %d,%d", c.px, c.py, x, y, c.wx, c.wy)
		}
	}
}

func TestAnchor(t *testing.T) {
	work := rect{L: 0, T: 0, R: 1920, B: 1040}
	cases := []struct {
		win  rect
		want anchor
	}{
		{rect{1556, 40, 1900, 700}, anchor{Right: true, X: 1900, Y: 40}},
		{rect{20, 40, 364, 700}, anchor{X: 20, Y: 40}},
		{rect{1556, 360, 1900, 1020}, anchor{Right: true, Bottom: true, X: 1900, Y: 1020}},
	}
	for _, c := range cases {
		a := anchorFor(c.win, work)
		if a != c.want {
			t.Errorf("anchorFor(%v) = %v", c.win, a)
		}
		// то же окно встаёт на то же место
		if x, y := a.pos(int(c.win.R-c.win.L), int(c.win.B-c.win.T), work); x != int(c.win.L) || y != int(c.win.T) {
			t.Errorf("pos(%v) = %d,%d", c.win, x, y)
		}
	}
	// выросло и не влезло: сдвинуто внутрь экрана; уменьшилось: снова на старом месте
	a := anchor{X: 20, Y: 600}
	if _, y := a.pos(344, 700, work); y != 340 {
		t.Errorf("рост: y = %d", y)
	}
	if _, y := a.pos(600, 40, work); y != 600 {
		t.Errorf("возврат: y = %d", y)
	}
}

func TestSettingsRect(t *testing.T) {
	work := rect{L: 0, T: 0, R: 1920, B: 1040}
	s := setSpot{w: 380, h: 600, minH: 420, fullW: 344, stripH: 46, gap: 12}
	for _, a := range []anchor{
		{X: 20, Y: 20}, {Right: true, X: 1900, Y: 20}, {X: 20, Y: 1020, Bottom: true},
		{Right: true, Bottom: true, X: 1900, Y: 1020}, {X: 700, Y: 400}, {Right: true, Bottom: true, X: 1300, Y: 640},
	} {
		x, y, h := settingsRect(a, s, work)
		set := rect{int32(x), int32(y), int32(x + s.w), int32(y + h)}
		if set.L < work.L || set.T < work.T || set.R > work.R || set.B > work.B || h < s.minH {
			t.Errorf("%v: вылезло за экран: %v", a, set)
		}
		for _, sz := range [][2]int{{344, 680}, {164, 300}, {700, 46}} { // полный, колонка, полоска
			wx, wy := a.pos(sz[0], sz[1], work)
			if w := (rect{int32(wx), int32(wy), int32(wx + sz[0]), int32(wy + sz[1])}); overlaps(w, set) {
				t.Errorf("%v: виджет %v накрыл настройки %v", a, w, set)
			}
		}
	}
}

func TestDragRect(t *testing.T) {
	work := rect{L: 0, T: 0, R: 1920, B: 1040}
	cases := []struct{ in, want rect }{
		{rect{500, 300, 836, 900}, rect{500, 300, 836, 900}},     // посередине: как есть
		{rect{1700, 300, 2036, 900}, rect{1584, 300, 1920, 900}}, // за правым краем: на край
		{rect{1575, 300, 1911, 900}, rect{1584, 300, 1920, 900}}, // рядом с правым: прилип
		{rect{-80, -20, 256, 580}, rect{0, 0, 336, 600}},         // за левым верхним углом
		{rect{8, 500, 344, 1036}, rect{0, 504, 336, 1040}},       // у левого и нижнего: прилип к обоим
		{rect{100, 100, 2100, 300}, rect{0, 100, 2000, 300}},     // шире экрана
	}
	for _, c := range cases {
		if got := dragRect(c.in, work, 12); got != c.want {
			t.Errorf("dragRect(%v) = %v; want %v", c.in, got, c.want)
		}
	}
}

func TestAtSide(t *testing.T) {
	work := rect{L: 0, T: 0, R: 1920, B: 1040}
	for _, c := range []struct {
		r    rect
		want bool
	}{{rect{0, 300, 336, 900}, true}, {rect{1584, 300, 1920, 900}, true}, {rect{500, 0, 836, 600}, false}, {rect{1, 300, 337, 900}, false}} {
		if atSide(c.r, work) != c.want {
			t.Errorf("atSide(%v) != %v", c.r, c.want)
		}
	}
}
