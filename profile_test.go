package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestCleanProfileName(t *testing.T) {
	cases := map[string]string{
		"  Игры  ":                     "Игры",
		"Работа\n\tночью":              "Работа ночью",
		"a\x00b":                       "a b",
		strings.Repeat("я", 40):        strings.Repeat("я", 32),
		"bad\xffutf":                   "badutf",
		"":                             "",
		"x\u2028y":                     "x y",
		strings.Repeat("a", 31) + " b": strings.Repeat("a", 31),
	}
	for in, want := range cases {
		if got := cleanProfileName(in); got != want {
			t.Errorf("cleanProfileName(%q) = %q; want %q", in, got, want)
		}
	}
}

func cfgKeys(t *testing.T, raw json.RawMessage) map[string]json.RawMessage {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("cfg не JSON: %v", err)
	}
	return m
}

func TestParseProfileOwnFormat(t *testing.T) {
	in := `{"kind":"pcwidget-profile","name":" Игры ","cfg":{"theme":"fill","mode":"strip","rows":[["cpu"]],"thr":{"cpuTemp":60},"city":"Город","tariff":5,"profiles":[{"name":"x"}],"evil":1}}`
	p, err := parseProfile([]byte("\xef\xbb\xbf"+in), "file")
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "Игры" {
		t.Errorf("name = %q", p.Name)
	}
	m := cfgKeys(t, p.Cfg)
	for _, k := range []string{"thr", "city", "tariff", "profiles", "evil"} {
		if _, ok := m[k]; ok {
			t.Errorf("лишний ключ %q остался", k)
		}
	}
	if string(m["theme"]) != `"fill"` || string(m["mode"]) != `"strip"` || string(m["ver"]) != "3" {
		t.Errorf("cfg = %s", p.Cfg)
	}
}

func TestParseProfileOtherShapes(t *testing.T) {
	// settings.json целиком: настройки в ui, имени нет — берём из файла.
	p, err := parseProfile([]byte(`{"hasPos":true,"ui":{"theme":"lcd","notify":true}}`), "Мой профиль.json")
	if err != nil || p.Name != "Мой профиль.json" || string(cfgKeys(t, p.Cfg)["theme"]) != `"lcd"` {
		t.Errorf("settings.json: %+v %v", p, err)
	}
	// голые настройки страницы
	p, err = parseProfile([]byte(`{"theme":"gauge","scale":115}`), "")
	if err != nil || p.Name != "Профиль" || len(cfgKeys(t, p.Cfg)) != 3 {
		t.Errorf("голые: %+v %v", p, err)
	}
	// null вместо значения — как будто ключа нет
	if _, err = parseProfile([]byte(`{"cfg":{"theme":null}}`), ""); !errors.Is(err, errProfileEmpty) {
		t.Errorf("null: %v", err)
	}
}

func TestParseProfileBad(t *testing.T) {
	cases := []struct {
		in   string
		want error
	}{
		{`not json`, errProfileJSON},
		{`[1,2]`, errProfileJSON},
		{`null`, errProfileJSON},
		{`"str"`, errProfileJSON},
		{`{"cfg":[1]}`, errProfileJSON},
		{`{"cfg":"theme"}`, errProfileJSON},
		{`{"name":"x","cfg":{"city":"Город"}}`, errProfileEmpty},
		{`{}`, errProfileEmpty},
		{`{"theme":"sheet"` + strings.Repeat(" ", maxProfileFile) + `}`, errProfileBig},
	}
	for _, c := range cases {
		if _, err := parseProfile([]byte(c.in), "f"); !errors.Is(err, c.want) {
			t.Errorf("parseProfile(%.30q) = %v; want %v", c.in, err, c.want)
		}
	}
}

func TestProfileFileRoundTrip(t *testing.T) {
	b, name, err := profileFile([]byte(`{"name":"Тихий\n","cfg":{"theme":"sheet","accent":"#7cc4ff","thr":{"mem":70}}}`))
	if err != nil || name != "Тихий" {
		t.Fatalf("export: %q %v", name, err)
	}
	if !strings.Contains(string(b), `"kind": "pcwidget-profile"`) || strings.Contains(string(b), "thr") {
		t.Errorf("файл: %s", b)
	}
	p, err := parseProfile(b, "")
	if err != nil || p.Name != "Тихий" || string(cfgKeys(t, p.Cfg)["accent"]) != `"#7cc4ff"` {
		t.Errorf("import: %+v %v", p, err)
	}
	if _, _, err := profileFile([]byte(`{"name":"x","cfg":{}}`)); err == nil {
		t.Error("пустой профиль выгрузился")
	}
}

func TestProfileFileName(t *testing.T) {
	cases := map[string]string{
		"Игры":          "Игры.json",
		`a/b\c:d*?"<>|`: "a_b_c_d______.json",
		"  ..  ":        "profile.json",
		"":              "profile.json",
		"con":           "profile.json",
		"COM1":          "profile.json",
		"nul.txt":       "profile.json",
		"Console":       "Console.json",
		"конец.":        "конец.json",
	}
	for in, want := range cases {
		if got := profileFileName(in); got != want {
			t.Errorf("profileFileName(%q) = %q; want %q", in, got, want)
		}
	}
}
