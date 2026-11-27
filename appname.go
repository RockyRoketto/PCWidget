package main

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode"
)

// Человеческое название программы вместо имени exe. Источники по порядку:
// библиотеки Steam и Epic, список установленных программ (значок указывает на этот exe),
// описание внутри exe, список установленных программ (exe лежит в папке установки), имя файла.

// installed — папка установки и название того, что в ней лежит.
type installedApp struct {
	Dir, Name string
	Icon      string // exe из DisplayIcon, только у записей из списка программ Windows
}

type nameSources struct {
	Games             []installedApp // Steam и Epic
	Programs          []installedApp // «Установленные приложения» Windows
	Description, Prod string         // из самого exe
}

// underDir: файл лежит внутри папки (без учёта регистра).
func underDir(path, dir string) bool {
	dir = strings.TrimRight(strings.ToLower(strings.ReplaceAll(dir, "/", `\`)), `\`)
	return len(dir) > 3 && strings.HasPrefix(strings.ToLower(path), dir+`\`)
}

// inDir — самая глубокая из папок, в которой лежит файл.
func inDir(path string, list []installedApp) string {
	best, n := "", 0
	for _, a := range list {
		if len(a.Dir) > n && a.Name != "" && underDir(path, a.Dir) {
			best, n = a.Name, len(a.Dir)
		}
	}
	return best
}

var spaces = regexp.MustCompile(`\s+`)

func cleanName(s string) string {
	s = strings.Map(func(r rune) rune {
		if r == '®' || r == '™' || r == '©' || unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(spaces.ReplaceAllString(s, " "))
	if len(strings.ToLower(s)) > 4 && strings.HasSuffix(strings.ToLower(s), ".exe") {
		s = s[:len(s)-4]
	}
	if r := []rune(s); len(r) > 60 {
		s = strings.TrimSpace(string(r[:60]))
	}
	return s
}

// junkNames — описания, которые движки и сборщики оставляют по умолчанию.
var junkNames = map[string]bool{
	"bootstrappackagedgame": true, "application": true, "app": true, "game": true, "launcher": true,
	"unreal engine": true, "ue4game": true, "ue5game": true, "unity": true, "unity player": true,
	"electron": true, "todo: <file description>": true, "todo: <product name>": true,
	"microsoft windows operating system": true, "windows operating system": true,
	"операционная система microsoft windows": true, "win32 application": true, "java(tm) platform se binary": true,
	"java platform se binary": true,
}

func goodName(s string) string {
	s = cleanName(s)
	if junkNames[strings.ToLower(s)] || strings.HasPrefix(s, "TODO") || strings.Contains(s, "-Win64-Shipping") {
		return ""
	}
	return s
}

// appName выбирает название для exe по полному пути.
func appName(path string, src nameSources) string {
	if n := cleanName(inDir(path, src.Games)); n != "" {
		return n
	}
	for _, p := range src.Programs {
		if p.Icon != "" && strings.EqualFold(p.Icon, path) {
			if n := goodName(p.Name); n != "" && !uninstallerName(n) {
				return n
			}
		}
	}
	if n := goodName(src.Description); n != "" {
		return n
	}
	if n := goodName(src.Prod); n != "" {
		return n
	}
	if n := goodName(inDir(path, src.Programs)); n != "" {
		return n
	}
	return exeStem(path)
}

func uninstallerName(s string) bool {
	s = strings.ToLower(s)
	return strings.HasPrefix(s, "uninstall") || strings.HasPrefix(s, "удал")
}

// exeStem — имя файла без пути и .exe, с большой буквы.
func exeStem(path string) string {
	s := path[strings.LastIndexAny(path, `\/`)+1:]
	if len(s) > 4 && strings.EqualFold(s[len(s)-4:], ".exe") {
		s = s[:len(s)-4]
	}
	s = strings.TrimSuffix(s, "-Win64-Shipping")
	if r := []rune(s); len(r) > 0 {
		r[0] = unicode.ToUpper(r[0])
		s = string(r)
	}
	return s
}

// vdfPair — строка «"ключ" "значение"» из файлов Steam.
var vdfPair = regexp.MustCompile(`"([^"\\]*)"[ \t]+"((?:[^"\\]|\\.)*)"`)

func vdfValues(text, key string) []string {
	var out []string
	for _, m := range vdfPair.FindAllStringSubmatch(text, -1) {
		if strings.EqualFold(m[1], key) {
			out = append(out, strings.NewReplacer(`\\`, `\`, `\"`, `"`).Replace(m[2]))
		}
	}
	return out
}

// steamGame разбирает appmanifest_*.acf из папки steamapps.
func steamGame(steamapps, acf string) (installedApp, bool) {
	name, dir := vdfValues(acf, "name"), vdfValues(acf, "installdir")
	if len(name) == 0 || len(dir) == 0 || name[0] == "" || dir[0] == "" || strings.ContainsAny(dir[0], `\/`) || dir[0] == ".." {
		return installedApp{}, false
	}
	return installedApp{Dir: steamapps + `\common\` + dir[0], Name: name[0]}, true
}

// epicGame разбирает манифест *.item из папки Epic Games Launcher.
func epicGame(item []byte) (installedApp, bool) {
	var m struct {
		DisplayName     string
		InstallLocation string
	}
	if json.Unmarshal(item, &m) != nil || m.DisplayName == "" || m.InstallLocation == "" {
		return installedApp{}, false
	}
	return installedApp{Dir: m.InstallLocation, Name: m.DisplayName}, true
}

// iconPath убирает из DisplayIcon кавычки и номер значка («"C:\a\b.exe",0»).
func iconPath(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.LastIndexByte(s, ','); i > 0 && strings.Trim(s[i+1:], " -0123456789") == "" {
		s = s[:i]
	}
	return strings.Trim(s, `" `)
}
