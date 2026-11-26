package main

import (
	"embed"
	"errors"
	"io/fs"
	"sort"
	"strings"
)

//go:embed assets
var assetsFS embed.FS

// buildPage склеивает assets/index.html с css/*.css и js/*.js (по алфавиту)
// в одну строку для NavigateToString. Порядок JS задавай числовыми префиксами.
func buildPage() (string, error) {
	idx, err := assetsFS.ReadFile("assets/index.html")
	if err != nil {
		return "", err
	}
	css, err := concatGlob("assets/css/*.css")
	if err != nil {
		return "", err
	}
	js, err := concatGlob("assets/js/*.js")
	if err != nil {
		return "", err
	}
	page := string(idx)
	if !strings.Contains(page, "/*{{CSS}}*/") || !strings.Contains(page, "/*{{JS}}*/") {
		return "", errors.New("index.html: нет меток /*{{CSS}}*/ или /*{{JS}}*/")
	}
	// JS вставляем последним, чтобы метки внутри него не обрабатывались.
	page = strings.Replace(page, "/*{{CSS}}*/", css, 1)
	page = strings.Replace(page, "/*{{JS}}*/", js, 1)
	return page, nil
}

// buildPopupPage собирает страницу окна меню: те же стили, что у виджета.
func buildPopupPage() (string, error) {
	idx, err := assetsFS.ReadFile("assets/popup.html")
	if err != nil {
		return "", err
	}
	css, err := concatGlob("assets/css/*.css")
	if err != nil {
		return "", err
	}
	return strings.Replace(string(idx), "/*{{CSS}}*/", css, 1), nil
}

// buildSettingsPage собирает страницу окна настроек: общие скрипты виджета и свои из assets/settings/.
func buildSettingsPage() (string, error) {
	idx, err := assetsFS.ReadFile("assets/settings.html")
	if err != nil {
		return "", err
	}
	css, err := concatGlob("assets/css/*.css")
	if err != nil {
		return "", err
	}
	js := ""
	for _, g := range []string{"assets/js/00-core.js", "assets/js/05-layout.js", "assets/js/07-profiles.js", "assets/js/10-icons.js", "assets/settings/*.js"} {
		part, err := concatGlob(g)
		if err != nil {
			return "", err
		}
		js += part
	}
	page := strings.Replace(string(idx), "/*{{CSS}}*/", css, 1)
	return strings.Replace(page, "/*{{JS}}*/", js, 1), nil
}

// buildOverlayPage собирает страницу игровой панели: стили тем, общие скрипты и свои из assets/overlay/.
func buildOverlayPage() (string, error) {
	idx, err := assetsFS.ReadFile("assets/overlay.html")
	if err != nil {
		return "", err
	}
	css := ""
	for _, g := range []string{"assets/css/base.css", "assets/css/theme-*.css", "assets/overlay/*.css"} {
		part, err := concatGlob(g)
		if err != nil {
			return "", err
		}
		css += part
	}
	js := ""
	for _, g := range []string{"assets/js/00-core.js", "assets/js/05-layout.js", "assets/js/22-parts.js", "assets/overlay/*.js"} {
		part, err := concatGlob(g)
		if err != nil {
			return "", err
		}
		js += part
	}
	page := strings.Replace(string(idx), "/*{{CSS}}*/", css, 1)
	return strings.Replace(page, "/*{{JS}}*/", js, 1), nil
}

func concatGlob(pattern string) (string, error) {
	names, err := fs.Glob(assetsFS, pattern)
	if err != nil {
		return "", err
	}
	sort.Strings(names)
	var sb strings.Builder
	for _, n := range names {
		b, err := assetsFS.ReadFile(n)
		if err != nil {
			return "", err
		}
		sb.Write(b)
		sb.WriteByte('\n')
	}
	return sb.String(), nil
}
