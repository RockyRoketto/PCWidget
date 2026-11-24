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

func TestPanelLeft(t *testing.T) {
	work := rect{L: 0, T: 0, R: 1920, B: 1040}
	cases := []struct {
		l, r int32
		want bool
	}{
		{1556, 1900, true}, // у правого края
		{20, 364, false},   // у левого
		{800, 1144, false}, // посередине: справа место есть
	}
	for _, c := range cases {
		if got := panelLeft(rect{L: c.l, R: c.r}, work, 344); got != c.want {
			t.Errorf("panelLeft(%d..%d) = %v", c.l, c.r, got)
		}
	}
	if panelLeft(rect{L: 100, R: 444}, rect{L: 0, R: 500, B: 800}, 344) {
		t.Error("нет места ни с одной стороны: остаётся справа")
	}
}
