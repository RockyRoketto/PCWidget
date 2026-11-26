package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Профиль — именованный снимок оформления и раскладки. Список профилей ведёт страница (CFG.profiles),
// Go только пишет профиль в файл и читает из файла, чтобы раскладкой можно было поделиться.
// Из файла берутся только ключи оформления; значения потом проверяет mergeCfg на странице.

const (
	maxProfileFile = 64 << 10 // профиль весит пару килобайт, больше — не наш файл
	maxProfileName = 32
	maxProfiles    = 6 // как PROF_MAX на странице
	profileKind    = "pcwidget-profile"
)

// profileKeys совпадает с PROF_KEYS в assets/js/07-profiles.js.
var profileKeys = []string{"theme", "tone", "accent", "pal", "glass", "mode", "scale", "rows", "hide", "mini", "tileColors", "thin", "cores"}

var (
	errProfileBig   = errors.New("файл слишком большой")
	errProfileJSON  = errors.New("это не файл профиля")
	errProfileEmpty = errors.New("в файле нет оформления")
)

// profile — то, что уходит странице после импорта.
type profile struct {
	Name string          `json:"name"`
	Cfg  json.RawMessage `json:"cfg"`
}

// cleanProfileName убирает управляющие символы, лишние пробелы и обрезает длину.
func cleanProfileName(s string) string {
	s = strings.ToValidUTF8(s, "")
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == '\u2028' || r == '\u2029' {
			return ' '
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > maxProfileName {
		s = strings.TrimSpace(string([]rune(s)[:maxProfileName]))
	}
	return s
}

// pickProfileCfg оставляет в настройках только ключи профиля.
func pickProfileCfg(m map[string]json.RawMessage) (json.RawMessage, bool) {
	out := map[string]json.RawMessage{"ver": json.RawMessage("3")}
	n := 0
	for _, k := range profileKeys {
		if v, ok := m[k]; ok && len(v) > 0 && string(v) != "null" {
			out[k] = v
			n++
		}
	}
	if n == 0 {
		return nil, false
	}
	b, err := json.Marshal(out)
	return b, err == nil
}

// parseProfile разбирает файл профиля. Понимает свой формат ({name, cfg}), а также голые настройки
// страницы и settings.json целиком (там они в поле ui). fallback — имя, если в файле его нет.
func parseProfile(b []byte, fallback string) (profile, error) {
	if len(b) > maxProfileFile {
		return profile{}, errProfileBig
	}
	b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf"))
	var top map[string]json.RawMessage
	if json.Unmarshal(b, &top) != nil || top == nil {
		return profile{}, errProfileJSON
	}
	var name string
	if raw, ok := top["name"]; ok {
		_ = json.Unmarshal(raw, &name)
	}
	src := top
	for _, k := range []string{"cfg", "ui"} {
		if raw, ok := top[k]; ok {
			var inner map[string]json.RawMessage
			if json.Unmarshal(raw, &inner) != nil || inner == nil {
				return profile{}, errProfileJSON
			}
			src = inner
			break
		}
	}
	cfg, ok := pickProfileCfg(src)
	if !ok {
		return profile{}, errProfileEmpty
	}
	if name = cleanProfileName(name); name == "" {
		name = cleanProfileName(fallback)
	}
	if name == "" {
		name = "Профиль"
	}
	return profile{Name: name, Cfg: cfg}, nil
}

// profileFile — содержимое файла для экспорта. raw — {name, cfg} от страницы.
func profileFile(raw []byte) ([]byte, string, error) {
	p, err := parseProfile(raw, "")
	if err != nil {
		return nil, "", err
	}
	b, err := json.MarshalIndent(struct {
		Kind string          `json:"kind"`
		Name string          `json:"name"`
		Cfg  json.RawMessage `json:"cfg"`
	}{profileKind, p.Name, p.Cfg}, "", "  ")
	return b, p.Name, err
}

// profileFileName — имя файла по имени профиля, без запрещённых в Windows символов.
func profileFileName(name string) string {
	s := strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '_'
		}
		return r
	}, cleanProfileName(name))
	s = strings.Trim(s, ". ")
	up := strings.ToUpper(s)
	if base, _, _ := strings.Cut(up, "."); s == "" || isReservedName(base) {
		s = "profile"
	}
	return s + ".json"
}

func isReservedName(s string) bool {
	switch s {
	case "CON", "PRN", "AUX", "NUL":
		return true
	}
	return len(s) == 4 && (strings.HasPrefix(s, "COM") || strings.HasPrefix(s, "LPT")) && s[3] >= '0' && s[3] <= '9'
}
