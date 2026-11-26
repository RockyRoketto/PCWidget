package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Карточка итога игры без WinAPI: страница, файл последнего итога и картинка от страницы.

const maxReportPNG = 8 << 20

var errReportPNG = errors.New("не картинка")

// buildReportPage собирает страницу окна итога: цвета и тему берёт из 00-core.js, рисует своими скриптами.
func buildReportPage() (string, error) {
	idx, err := assetsFS.ReadFile("assets/report.html")
	if err != nil {
		return "", err
	}
	js := ""
	for _, g := range []string{"assets/js/00-core.js", "assets/js/21b-pixel.js", "assets/report/*.js"} {
		part, err := concatGlob(g)
		if err != nil {
			return "", err
		}
		js += part
	}
	return strings.Replace(string(idx), "/*{{JS}}*/", js, 1), nil
}

func lastReportPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "pcwidget", "lastgame.json")
}

func saveLastReport(r *GameReport) {
	p := lastReportPath()
	b, err := json.Marshal(r)
	if p == "" || err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err == nil {
		_ = os.WriteFile(p, b, 0o644)
	}
}

// loadLastReport: nil, если итога ещё не было или файл испорчен.
func loadLastReport() *GameReport {
	b, err := os.ReadFile(lastReportPath())
	if err != nil {
		return nil
	}
	var r GameReport
	if json.Unmarshal(b, &r) != nil || r.Frames <= 0 {
		return nil
	}
	return &r
}

// decodePNG разбирает data-URL картинки, нарисованной страницей.
func decodePNG(dataURL string) ([]byte, error) {
	raw, ok := strings.CutPrefix(dataURL, "data:image/png;base64,")
	if !ok || len(raw) > maxReportPNG {
		return nil, errReportPNG
	}
	b, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || !bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")) {
		return nil, errReportPNG
	}
	return b, nil
}

// reportFileName — имя картинки по умолчанию: игра и время окончания.
func reportFileName(game string, endMs int64) string {
	name := strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return -1
		}
		return r
	}, strings.TrimSuffix(game, ".exe"))
	if name = strings.TrimSpace(name); name == "" {
		name = "Игра"
	}
	return name + " " + time.UnixMilli(endMs).Format("2006-01-02 15-04") + ".png"
}
