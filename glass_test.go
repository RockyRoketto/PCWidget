package main

import "testing"

func TestParseStyle(t *testing.T) {
	cases := []struct {
		in    string
		theme string
		light bool
	}{
		{"sheet:dark", "sheet", false},
		{"fill:light", "fill", true},
		{"gauge", "gauge", false},
		{"lcd:light", "lcd", true},
		{"osc:dark", "osc", false},
		{"bp:light", "bp", true},
		{"pixel:dark", "pixel", false},
		{"pixel:light", "pixel", true},
		{"glass", "sheet", false}, // старая тема
		{"", "sheet", false},
	}
	for _, c := range cases {
		th, l := parseStyle(c.in)
		if th != c.theme || l != c.light {
			t.Errorf("parseStyle(%q) = %s,%v; want %s,%v", c.in, th, l, c.theme, c.light)
		}
	}
}

func TestAccentHex(t *testing.T) {
	if got := accentHex(0xFFD77800); got != "#0078d7" {
		t.Errorf("accentHex = %s", got)
	}
}
