package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	utf16x "unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Экспорт и импорт профиля через стандартные диалоги Windows. Разбор файла — profile.go.

var (
	comdlg32          = lazyDLL("comdlg32.dll")
	pGetSaveFileName  = comdlg32.NewProc("GetSaveFileNameW")
	pGetOpenFileName  = comdlg32.NewProc("GetOpenFileNameW")
	profileDialogOpen bool
)

const (
	ofnOverwritePrompt = 0x2
	ofnHideReadOnly    = 0x4
	ofnNoChangeDir     = 0x8
	ofnPathMustExist   = 0x800
	ofnFileMustExist   = 0x1000
	ofnExplorer        = 0x80000
	ofnDontAddToRecent = 0x02000000
	maxPathW           = 1024
)

// openFileName — OPENFILENAMEW.
type openFileName struct {
	structSize    uint32
	owner         uintptr
	instance      uintptr
	filter        *uint16
	customFilter  *uint16
	maxCustFilter uint32
	filterIndex   uint32
	file          *uint16
	maxFile       uint32
	fileTitle     *uint16
	maxFileTitle  uint32
	initialDir    *uint16
	title         *uint16
	flags         uint32
	fileOffset    uint16
	fileExtension uint16
	defExt        *uint16
	custData      uintptr
	hook          uintptr
	templateName  *uint16
	reserved      uintptr
	reservedDw    uint32
	flagsEx       uint32
}

// fileDialog показывает диалог «Сохранить» или «Открыть». Пустая строка — передумали.
func fileDialog(save bool, title, name string) string {
	return fileDialogOf(set.hwnd, save, title, name, "Профиль PC Widget (*.json)\x00*.json", "json")
}

// fileDialogOf — то же для любого окна и типа файла; kind — «подпись@маска» через NUL.
func fileDialogOf(owner uintptr, save bool, title, name, kind, ext string) string {
	buf := make([]uint16, maxPathW)
	copy(buf[:maxPathW-1], windows.StringToUTF16(name))
	// пары «подпись, маска» через NUL, в конце двойной NUL (StringToUTF16 NUL внутри не пропускает)
	filter := append(utf16x.Encode([]rune(kind+"\x00Все файлы\x00*.*\x00")), 0)
	o := openFileName{
		owner:   owner,
		filter:  &filter[0],
		file:    &buf[0],
		maxFile: maxPathW,
		title:   utf16(title),
		defExt:  utf16(ext),
		flags:   ofnExplorer | ofnNoChangeDir | ofnHideReadOnly | ofnPathMustExist | ofnDontAddToRecent,
	}
	o.structSize = uint32(unsafe.Sizeof(o))
	proc := pGetOpenFileName
	if save {
		o.flags |= ofnOverwritePrompt
		proc = pGetSaveFileName
	} else {
		o.flags |= ofnFileMustExist
	}
	if r, _, _ := proc.Call(uintptr(unsafe.Pointer(&o))); r == 0 {
		return ""
	}
	return windows.UTF16ToString(buf)
}

// onProfile — запросы страницы настроек: «export:{name,cfg}» и «import».
func onProfile(m string) {
	if profileDialogOpen || set.hwnd == 0 {
		return
	}
	profileDialogOpen = true
	defer func() { profileDialogOpen = false }()
	if raw, ok := strings.CutPrefix(m, "export:"); ok {
		b, name, err := profileFile([]byte(raw))
		if err != nil {
			profileReply(map[string]any{"msg": "Не вышло: " + err.Error(), "bad": true})
			return
		}
		path := fileDialog(true, "Сохранить профиль", profileFileName(name))
		if path == "" {
			return
		}
		if err := os.WriteFile(path, b, 0o644); err != nil {
			logf("profile export: %v", err)
			profileReply(map[string]any{"msg": "Файл не записан", "bad": true})
			return
		}
		profileReply(map[string]any{"msg": "Сохранён в " + filepath.Base(path)})
		return
	}
	if m != "import" {
		return
	}
	path := fileDialog(false, "Загрузить профиль", "")
	if path == "" {
		return
	}
	p, err := readProfileFile(path)
	if err != nil {
		profileReply(map[string]any{"msg": "Не вышло: " + err.Error(), "bad": true})
		return
	}
	profileReply(map[string]any{"imp": p})
}

// readProfileFile читает не больше лимита: огромный файл не грузится в память целиком.
func readProfileFile(path string) (profile, error) {
	f, err := os.Open(path)
	if err != nil {
		return profile{}, errProfileJSON
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, maxProfileFile+1))
	if err != nil {
		return profile{}, errProfileJSON
	}
	base := filepath.Base(path)
	return parseProfile(b, strings.TrimSuffix(base, filepath.Ext(base)))
}

func profileReply(v map[string]any) {
	b, err := json.Marshal(v)
	if err == nil && set.cr != nil && set.ready {
		set.cr.Eval("window.__prof(" + string(b) + ")")
	}
}

// profileNames — имена профилей для системного меню трея.
func profileNames() []string {
	var ui struct {
		Profiles []struct {
			Name string `json:"name"`
		} `json:"profiles"`
	}
	_ = json.Unmarshal(app.settings.UI, &ui)
	var out []string
	for _, p := range ui.Profiles {
		if len(out) == maxProfiles {
			break
		}
		if n := cleanProfileName(p.Name); n != "" {
			out = append(out, n)
		}
	}
	return out
}
