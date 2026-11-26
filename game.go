package main

import (
	"slices"
	"strings"
)

// Игровой режим: настройки оверлея, разбор горячей клавиши, место панели. Без WinAPI.

// GameCfg хранится в Settings.Game. Набор строк и порядок задаёт gameRowKeys.
type GameCfg struct {
	Corner   string   `json:"corner"`   // tl, tr, bl, br
	Rows     []string `json:"rows"`     // какие строки показывать
	HideMain bool     `json:"hideMain"` // прятать главный виджет, пока режим включён
	Key      string   `json:"key"`      // «Ctrl+Shift+F»; пусто = без горячей клавиши
}

var (
	gameRowKeys = []string{"fps", "low", "frame", "cpu", "gpu", "vram", "power"}
	gameCorners = []string{"tl", "tr", "bl", "br"}
)

const defaultGameKey = "Ctrl+Shift+F"

func defaultGameCfg() GameCfg {
	return GameCfg{Corner: "tl", Rows: slices.Clone(gameRowKeys), Key: defaultGameKey}
}

// gameCfgOf: настройки из файла или со страницы; неизвестное отбрасывается, нет файла — по умолчанию.
func gameCfgOf(g *GameCfg) GameCfg {
	d := defaultGameCfg()
	if g == nil {
		return d
	}
	if slices.Contains(gameCorners, g.Corner) {
		d.Corner = g.Corner
	}
	if g.Rows != nil {
		d.Rows = []string{}
		for _, k := range gameRowKeys { // порядок всегда свой, повторы исчезают
			if slices.Contains(g.Rows, k) {
				d.Rows = append(d.Rows, k)
			}
		}
	}
	d.HideMain = g.HideMain
	if g.Key == "" {
		d.Key = ""
	} else if _, _, ok := parseHotkey(g.Key); ok {
		d.Key = g.Key
	}
	return d
}

const (
	modAlt      = 0x1
	modCtrl     = 0x2
	modShift    = 0x4
	modWin      = 0x8
	modNoRepeat = 0x4000
)

// parseHotkey: «Ctrl+Shift+F» → модификаторы и виртуальная клавиша для RegisterHotKey.
// Клавиша — буква, цифра или F1–F24. Без модификатора разрешены только F-клавиши.
func parseHotkey(s string) (mods, vk uint32, ok bool) {
	parts := strings.Split(s, "+")
	if len(parts) == 0 {
		return 0, 0, false
	}
	for _, p := range parts[:len(parts)-1] {
		var m uint32
		switch strings.ToLower(strings.TrimSpace(p)) {
		case "ctrl":
			m = modCtrl
		case "shift":
			m = modShift
		case "alt":
			m = modAlt
		case "win":
			m = modWin
		default:
			return 0, 0, false
		}
		if mods&m != 0 {
			return 0, 0, false
		}
		mods |= m
	}
	key := strings.ToUpper(strings.TrimSpace(parts[len(parts)-1]))
	fkey := false
	switch {
	case len(key) == 1 && (key[0] >= 'A' && key[0] <= 'Z' || key[0] >= '0' && key[0] <= '9'):
		vk = uint32(key[0])
	case len(key) >= 2 && len(key) <= 3 && key[0] == 'F':
		n := 0
		for _, c := range key[1:] {
			if c < '0' || c > '9' {
				return 0, 0, false
			}
			n = n*10 + int(c-'0')
		}
		if n < 1 || n > 24 {
			return 0, 0, false
		}
		vk, fkey = uint32(0x70+n-1), true
	default:
		return 0, 0, false
	}
	if mods == 0 && !fkey {
		return 0, 0, false
	}
	return mods | modNoRepeat, vk, true
}

// overlayPos ставит панель w*h в угол монитора mon с отступом margin. Монитор целиком, а не рабочая
// область: игра без рамки закрывает и панель задач.
func overlayPos(corner string, mon rect, w, h, margin int) (x, y int) {
	x, y = int(mon.L)+margin, int(mon.T)+margin
	if corner == "tr" || corner == "br" {
		x = int(mon.R) - margin - w
	}
	if corner == "bl" || corner == "br" {
		y = int(mon.B) - margin - h
	}
	return x, y
}
