package main

import "testing"

func TestClampToScreen(t *testing.T) {
	v := rect{L: -1920, T: 0, R: 1920, B: 1080}
	cases := []struct{ x, y, w, h, wx, wy int }{
		{100, 100, 330, 400, 100, 100},     // внутри
		{5000, 100, 330, 400, 1590, 100},   // за правым краем
		{-9000, -50, 330, 400, -1920, 0},   // за левым и верхним
		{100, 1000, 330, 400, 100, 680},    // за нижним
		{-1900, 300, 330, 400, -1900, 300}, // второй монитор слева
	}
	for _, c := range cases {
		x, y := clampToScreen(c.x, c.y, c.w, c.h, v)
		if x != c.wx || y != c.wy {
			t.Errorf("clamp(%d,%d) = %d,%d; want %d,%d", c.x, c.y, x, y, c.wx, c.wy)
		}
	}
}
