package main

import (
	"slices"
	"testing"
)

func TestParseHotkey(t *testing.T) {
	cases := []struct {
		in       string
		mods, vk uint32
		ok       bool
	}{
		{"Ctrl+Shift+F", modCtrl | modShift | modNoRepeat, 'F', true},
		{"alt+1", modAlt | modNoRepeat, '1', true},
		{"F10", modNoRepeat, 0x79, true},
		{"Win+Ctrl+F24", modWin | modCtrl | modNoRepeat, 0x87, true},
		{"F", 0, 0, false},           // буква без модификатора мешала бы печатать
		{"Ctrl+Ctrl+F", 0, 0, false}, // повтор
		{"Ctrl+F25", 0, 0, false},
		{"Ctrl+Space", 0, 0, false},
		{"Hyper+F", 0, 0, false},
		{"", 0, 0, false},
	}
	for _, c := range cases {
		m, v, ok := parseHotkey(c.in)
		if ok != c.ok || m != c.mods || v != c.vk {
			t.Errorf("%q: %x %x %v", c.in, m, v, ok)
		}
	}
}

func TestGameCfgOf(t *testing.T) {
	d := gameCfgOf(nil)
	if d.Corner != "tl" || d.Key != defaultGameKey || !slices.Equal(d.Rows, gameRowKeys) || d.HideMain {
		t.Fatalf("по умолчанию: %+v", d)
	}
	g := gameCfgOf(&GameCfg{Corner: "xx", Rows: []string{"vram", "fps", "bogus", "fps"}, HideMain: true, Key: "Q"})
	if g.Corner != "tl" || !slices.Equal(g.Rows, []string{"fps", "vram"}) || !g.HideMain || g.Key != defaultGameKey {
		t.Fatalf("чистка: %+v", g)
	}
	if e := gameCfgOf(&GameCfg{Corner: "br", Rows: []string{}}); len(e.Rows) != 0 || e.Key != "" || e.Corner != "br" {
		t.Fatalf("пустой набор строк и без клавиши: %+v", e)
	}
}

func TestOverlayPos(t *testing.T) {
	mon := rect{L: -1920, T: 0, R: 0, B: 1080} // второй монитор слева
	for _, c := range []struct {
		corner string
		x, y   int
	}{{"tl", -1910, 10}, {"tr", -210, 10}, {"bl", -1910, 970}, {"br", -210, 970}} {
		if x, y := overlayPos(c.corner, mon, 200, 100, 10); x != c.x || y != c.y {
			t.Errorf("%s: %d,%d", c.corner, x, y)
		}
	}
}
