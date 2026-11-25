package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// Мод, который записывает лимиты в файл для виджета. Claude Code сам подхватывает такие папки из
// ~/.claude/skills, поэтому его настройки не меняются: подключить = положить папку, отключить = убрать.

const claudeModName = "pcwidget-limits"

// файл мода -> откуда он вшит (папку с точкой go:embed не берёт, поэтому раскладка своя)
var claudeModFiles = map[string]string{
	".claude-plugin/plugin.json": "assets/claude-mod/plugin.json",
	"hooks/hooks.json":           "assets/claude-mod/hooks.json",
	"hooks/register.ts":          "assets/claude-mod/register.ts",
}

var errModForeign = errors.New("папка занята чужим модом")

func claudeModDir(dir string) string { return filepath.Join(dir, "skills", claudeModName) }

// claudeModState: none (Claude Code не найден), off, on.
func claudeModState(dir string) string {
	if fi, err := os.Stat(dir); dir == "" || err != nil || !fi.IsDir() {
		return "none"
	}
	if claudeModOurs(dir) {
		return "on"
	}
	return "off"
}

// claudeModOurs: папка мода на месте и в ней именно наш мод.
func claudeModOurs(dir string) bool {
	b, err := os.ReadFile(filepath.Join(claudeModDir(dir), ".claude-plugin", "plugin.json"))
	if err != nil {
		return false
	}
	var p struct {
		Name string `json:"name"`
	}
	return json.Unmarshal(b, &p) == nil && p.Name == claudeModName
}

// installClaudeMod кладёт мод. Чужую папку с тем же именем не трогает.
func installClaudeMod(dir string) error {
	if claudeModState(dir) == "none" {
		return errors.New("Claude Code не найден")
	}
	root := claudeModDir(dir)
	if list, err := os.ReadDir(root); err == nil && len(list) > 0 && !claudeModOurs(dir) {
		return errModForeign
	}
	for name, src := range claudeModFiles {
		b, err := assetsFS.ReadFile(src)
		if err != nil {
			return err
		}
		p := filepath.Join(root, filepath.FromSlash(name))
		if old, err := os.ReadFile(p); err == nil && bytes.Equal(old, b) {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(p, b, 0o644); err != nil {
			return err
		}
	}
	return nil
}

// removeClaudeMod стирает папку мода (вместе с тем, что дописал в неё Claude Code) и файл лимитов, если мод наш.
func removeClaudeMod(dir string) error {
	if !claudeModOurs(dir) {
		return nil
	}
	if err := os.RemoveAll(claudeModDir(dir)); err != nil {
		return err
	}
	if err := os.Remove(filepath.Join(dir, claudeLimitsFile)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// refreshClaudeMod обновляет уже подключённый мод, если в новой версии виджета он другой.
func refreshClaudeMod(dir string) {
	if claudeModState(dir) != "on" {
		return
	}
	if err := installClaudeMod(dir); err != nil {
		logf("claude mod: %v", err)
	}
}
