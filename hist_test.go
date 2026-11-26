package main

import (
	"strings"
	"testing"
)

func TestHistPos(t *testing.T) {
	work := rect{L: 0, T: 0, R: 1920, B: 1040}
	const w, h, gap = 300, 400, 8
	cases := []struct {
		name       string
		tile, win  rect
		wantX, wan int
	}{
		// виджет в правом верхнем углу: карточка слева от виджета, вровень с плиткой
		{"справа у края", rect{1700, 100, 1880, 200}, rect{1500, 40, 1900, 700}, 1500 - gap - w, 100},
		// виджет у левого края: справа
		{"слева у края", rect{40, 300, 200, 400}, rect{20, 40, 400, 700}, 400 + gap, 300},
		// плитка внизу: карточка поднимается, чтобы влезть по высоте
		{"низ экрана", rect{1700, 950, 1880, 1020}, rect{1500, 600, 1900, 1030}, 1500 - gap - w, 1040 - h},
		// полоска во всю ширину сверху: под ней, вровень с плиткой
		{"полоска", rect{900, 10, 1000, 50}, rect{0, 0, 1920, 60}, 900, 60 + gap},
		// виджет в центре, плитка в правой колонке: ближе справа
		{"центр", rect{1000, 300, 1100, 400}, rect{800, 200, 1120, 700}, 1120 + gap, 300},
	}
	for _, c := range cases {
		x, y := histPos(c.tile, c.win, w, h, gap, work)
		if x != c.wantX || y != c.wan {
			t.Errorf("%s: histPos = %d,%d; want %d,%d", c.name, x, y, c.wantX, c.wan)
		}
		if x < 0 || y < 0 || x+w > 1920 || y+h > 1040 {
			t.Errorf("%s: карточка за краем экрана: %d,%d", c.name, x, y)
		}
	}
	// экран меньше карточки по ширине вокруг виджета: остаётся на экране
	x, y := histPos(rect{100, 100, 200, 200}, rect{0, 0, 1900, 1040}, w, h, gap, work)
	if x < 0 || y < 0 || x+w > 1920 || y+h > 1040 {
		t.Errorf("тесно: карточка за краем экрана: %d,%d", x, y)
	}
}

func TestHistPage(t *testing.T) {
	p, err := buildHistPage()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(p, "/*{{CSS}}*/") || !strings.Contains(p, ".hc-g") || !strings.Contains(p, "__show") {
		t.Error("страница карточки собрана неверно")
	}
}
