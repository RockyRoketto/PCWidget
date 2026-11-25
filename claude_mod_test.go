package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestClaudeMod(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".claude")
	if claudeModState(dir) != "none" || installClaudeMod(dir) == nil {
		t.Fatal("без Claude Code ставить некуда")
	}
	other := filepath.Join(dir, "skills", "other")
	if err := os.MkdirAll(other, 0o755); err != nil {
		t.Fatal(err)
	}
	set := filepath.Join(dir, "settings.json")
	if err := os.WriteFile(set, []byte(`{"x":1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if claudeModState(dir) != "off" {
		t.Fatal("ещё не подключён")
	}
	for range 2 { // повторная установка ничего не ломает
		if err := installClaudeMod(dir); err != nil {
			t.Fatal(err)
		}
	}
	if claudeModState(dir) != "on" {
		t.Fatal("должен быть подключён")
	}
	for name := range claudeModFiles {
		if b, err := os.ReadFile(filepath.Join(claudeModDir(dir), name)); err != nil || len(b) == 0 {
			t.Fatal(name, err)
		}
	}
	reg := filepath.Join(claudeModDir(dir), "hooks", "register.ts")
	_ = os.WriteFile(reg, []byte("старая версия"), 0o644)
	refreshClaudeMod(dir)
	if b, _ := os.ReadFile(reg); string(b) == "старая версия" {
		t.Fatal("мод должен обновиться")
	}
	lim := filepath.Join(dir, claudeLimitsFile)
	_ = os.WriteFile(lim, []byte("{}"), 0o644)
	if err := removeClaudeMod(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(claudeModDir(dir)); !os.IsNotExist(err) {
		t.Fatal("папка мода должна уйти")
	}
	if _, err := os.Stat(lim); !os.IsNotExist(err) {
		t.Fatal("файл лимитов должен уйти")
	}
	if _, err := os.Stat(other); err != nil {
		t.Fatal("чужое не трогаем")
	}
	if b, _ := os.ReadFile(set); string(b) != `{"x":1}` {
		t.Fatal("настройки Claude Code не меняются")
	}
}

func TestClaudeModForeign(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(claudeModDir(dir), "SKILL.md")
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	_ = os.WriteFile(p, []byte("чужое"), 0o644)
	if err := installClaudeMod(dir); !errors.Is(err, errModForeign) {
		t.Fatal(err)
	}
	if err := removeClaudeMod(dir); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(p); string(b) != "чужое" {
		t.Fatal("чужую папку не трогаем")
	}
}
