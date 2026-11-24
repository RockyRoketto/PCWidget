package main

import (
	"strings"
	"testing"
)

func TestBuildPage(t *testing.T) {
	p, err := buildPage()
	if err != nil {
		t.Fatal(err)
	}
	if sp, err := buildSettingsPage(); err != nil || strings.Contains(sp, "{{") || !strings.Contains(sp, "buildSettings") {
		t.Errorf("страница настроек не собралась: %v", err)
	}
	if strings.Contains(p, "{{CSS}}") || strings.Contains(p, "{{JS}}") {
		t.Error("метки не заменены")
	}
	for _, want := range []string{"theme-glass", "__stats", "postMessage"} {
		if !strings.Contains(p, want) {
			t.Errorf("в странице нет %q", want)
		}
	}
}
