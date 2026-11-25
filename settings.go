package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Settings хранится одним JSON в %APPDATA%\pcwidget\settings.json.
type Settings struct {
	HasPos bool `json:"hasPos"`
	X      int  `json:"x"`
	Y      int  `json:"y"`
	// Anchor — за какой угол держится окно (place.go). X, Y: место для первого кадра.
	Anchor  *anchor `json:"anchor,omitempty"`
	Theme   string  `json:"theme"`
	Topmost bool    `json:"topmost"`
	// Autostart: nil = ещё не выбирали (по умолчанию включён). AutostartKey — с чем создана задача.
	Autostart    *bool  `json:"autostart,omitempty"`
	AutostartKey string `json:"autostartKey,omitempty"`
	// UI — настройки интерфейса (плитки, порядок, пороги, режим). Их ведёт страница, Go хранит как есть.
	UI json.RawMessage `json:"ui,omitempty"`
}

func defaultSettings() Settings {
	return Settings{Theme: "sheet"}
}

func settingsPath() string {
	dir, err := os.UserConfigDir() // %APPDATA%
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "pcwidget", "settings.json")
}

func loadSettings() Settings {
	s := defaultSettings()
	b, err := os.ReadFile(settingsPath())
	if err != nil {
		return s
	}
	_ = json.Unmarshal(b, &s) // битый файл = значения по умолчанию
	if s.Theme == "" {
		s.Theme = "sheet"
	}
	return s
}

func (s Settings) save() {
	p := settingsPath()
	if os.MkdirAll(filepath.Dir(p), 0o755) != nil {
		return
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	tmp := p + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		_ = os.Rename(tmp, p)
	}
}

// clampToScreen сдвигает окно w*h так, чтобы оно целиком лежало в виртуальном экране v.
func clampToScreen(x, y, w, h int, v rect) (int, int) {
	maxX := int(v.R) - w
	maxY := int(v.B) - h
	if x > maxX {
		x = maxX
	}
	if y > maxY {
		y = maxY
	}
	if x < int(v.L) {
		x = int(v.L)
	}
	if y < int(v.T) {
		y = int(v.T)
	}
	return x, y
}
