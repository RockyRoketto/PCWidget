package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// Названия и значки программ для «Куда ушёл день». Всё берётся с этого ПК, в сеть ничего не уходит.
// Значок и название приложений из Store отдаёт оболочка Windows (как в «Пуске»).

var (
	pSHCreateItemFromParsingName = shell32.NewProc("SHCreateItemFromParsingName")
	pCoInitializeEx              = lazyDLL("ole32.dll").NewProc("CoInitializeEx")
	pGetObject                   = lazyDLL("gdi32.dll").NewProc("GetObjectW")
	pGetDIBits                   = lazyDLL("gdi32.dll").NewProc("GetDIBits")
	pCreateCompatibleDC          = lazyDLL("gdi32.dll").NewProc("CreateCompatibleDC")
	pDeleteDC                    = lazyDLL("gdi32.dll").NewProc("DeleteDC")

	iidShellItem    = windows.GUID{Data1: 0x43826d1e, Data2: 0xe718, Data3: 0x42ee, Data4: [8]byte{0xbc, 0x55, 0xa1, 0xe2, 0x61, 0xc3, 0x7b, 0xfe}}
	iidImageFactory = windows.GUID{Data1: 0xbcc18b79, Data2: 0xba16, Data3: 0x442f, Data4: [8]byte{0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b}}
)

const (
	iconSize         = 32 // пикселей: хватает на 200% масштаба
	siigbfIconOnly   = 0x4
	sigdnNormalName  = 0
	slotDisplayName  = 5 // IShellItem
	slotGetImage     = 3 // IShellItemImageFactory
	gamesListMaxAge  = 5 * time.Minute
	versionBlockMax  = 1 << 20
	coinitApartment  = 0x2
	maxBitmapSidePix = 256
)

type bitmapHeader struct {
	Size                   uint32
	Width, Height          int32
	Planes, BitCount       uint16
	Compression, SizeImage uint32
	XPels, YPels           int32
	ClrUsed, ClrImportant  uint32
}

type gdiBitmap struct {
	Type, Width, Height, WidthBytes int32
	Planes, BitsPixel               uint16
	Bits                            uintptr
}

// resolveApps — поток, который по очереди узнаёт название и значок новых программ.
func resolveApps(d *dayTracker) {
	runtime.LockOSThread() // COM живёт в этом потоке
	pCoInitializeEx.Call(0, coinitApartment)
	var games, programs []installedApp
	var read time.Time
	for ref := range d.ask {
		if time.Since(read) > gamesListMaxAge {
			games, programs, read = append(steamGames(), epicGames()...), installedPrograms(), time.Now()
		}
		name, icon := "", ""
		if ref.aumid != "" {
			name, icon = shellInfo(`shell:AppsFolder\` + ref.aumid)
			name = cleanName(name)
		}
		desc, prod := versionNames(ref.path)
		if name == "" {
			name = appName(ref.path, nameSources{games, programs, desc, prod})
		}
		if icon == "" {
			_, icon = shellInfo(ref.path)
		}
		logf("day: %s -> %q, значок %d б", exeFile(ref.path), name, len(icon))
		d.resolved(ref, name, icon)
	}
}

// shellInfo — название и значок (PNG в base64) по пути или по имени в оболочке.
func shellInfo(path string) (name, icon string) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", ""
	}
	var item *rtObj
	r, _, _ := pSHCreateItemFromParsingName.Call(uintptr(unsafe.Pointer(p)), 0, uintptr(unsafe.Pointer(&iidShellItem)), uintptr(unsafe.Pointer(&item)))
	if int32(r) < 0 || item == nil {
		return "", ""
	}
	defer item.release()
	var s *uint16
	if item.call(slotDisplayName, sigdnNormalName, uintptr(unsafe.Pointer(&s))) == nil && s != nil {
		name = windows.UTF16PtrToString(s)
		windows.CoTaskMemFree(unsafe.Pointer(s))
	}
	f, err := item.qi(&iidImageFactory)
	if err != nil {
		return name, ""
	}
	defer f.release()
	var bmp uintptr
	// SIZE передаётся значением: на x64 это одно машинное слово.
	if f.call(slotGetImage, uintptr(iconSize)|uintptr(iconSize)<<32, siigbfIconOnly, uintptr(unsafe.Pointer(&bmp))) != nil || bmp == 0 {
		return name, ""
	}
	defer pDeleteObject.Call(bmp)
	return name, bitmapPNG(bmp)
}

func bitmapPNG(bmp uintptr) string {
	var b gdiBitmap
	if r, _, _ := pGetObject.Call(bmp, unsafe.Sizeof(b), uintptr(unsafe.Pointer(&b))); r == 0 {
		return ""
	}
	w, h := int(b.Width), int(b.Height)
	if w <= 0 || h <= 0 || w > maxBitmapSidePix || h > maxBitmapSidePix {
		return ""
	}
	dc, _, _ := pCreateCompatibleDC.Call(0)
	if dc == 0 {
		return ""
	}
	defer pDeleteDC.Call(dc)
	// отрицательная высота: строки сверху вниз
	hd := bitmapHeader{Size: 40, Width: int32(w), Height: int32(-h), Planes: 1, BitCount: 32}
	img := image.NewRGBA(image.Rect(0, 0, w, h)) // как у Windows: цвет уже умножен на прозрачность
	if r, _, _ := pGetDIBits.Call(dc, bmp, 0, uintptr(h), uintptr(unsafe.Pointer(&img.Pix[0])), uintptr(unsafe.Pointer(&hd)), 0); r == 0 {
		return ""
	}
	alpha := false
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+2] = img.Pix[i+2], img.Pix[i] // BGRA -> RGBA
		alpha = alpha || img.Pix[i+3] != 0
	}
	if !alpha { // старый значок без прозрачности
		for i := 3; i < len(img.Pix); i += 4 {
			img.Pix[i] = 255
		}
	}
	var out bytes.Buffer
	if png.Encode(&out, img) != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(out.Bytes())
}

// versionNames — «Описание файла» и «Название продукта» из самого exe.
func versionNames(path string) (desc, product string) {
	var zero windows.Handle
	n, err := windows.GetFileVersionInfoSize(path, &zero)
	if err != nil || n == 0 || n > versionBlockMax {
		return "", ""
	}
	buf := make([]byte, n)
	if windows.GetFileVersionInfo(path, 0, n, unsafe.Pointer(&buf[0])) != nil {
		return "", ""
	}
	query := func(key string) (unsafe.Pointer, uint32) {
		var p unsafe.Pointer
		var l uint32
		if windows.VerQueryValue(unsafe.Pointer(&buf[0]), key, unsafe.Pointer(&p), &l) != nil {
			return nil, 0
		}
		return p, l
	}
	var langs []string
	if p, l := query(`\VarFileInfo\Translation`); p != nil && l >= 4 {
		t := (*[2]uint16)(p)
		langs = append(langs, hex4(t[0])+hex4(t[1]))
	}
	langs = append(langs, "040904b0", "040904e4", "000004b0")
	get := func(field string) string {
		for _, lang := range langs {
			if p, l := query(`\StringFileInfo\` + lang + `\` + field); p != nil && l > 0 {
				if s := strings.TrimSpace(windows.UTF16ToString(unsafe.Slice((*uint16)(p), l))); s != "" {
					return s
				}
			}
		}
		return ""
	}
	return get("FileDescription"), get("ProductName")
}

func hex4(v uint16) string {
	const d = "0123456789abcdef"
	return string([]byte{d[v>>12], d[v>>8&15], d[v>>4&15], d[v&15]})
}

func regString(root registry.Key, path, name string) string {
	k, err := registry.OpenKey(root, path, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	s, _, _ := k.GetStringValue(name)
	return s
}

// steamGames — установленные игры из всех библиотек Steam.
func steamGames() []installedApp {
	root := regString(registry.CURRENT_USER, `Software\Valve\Steam`, "SteamPath")
	if root == "" {
		return nil
	}
	root = filepath.Clean(root)
	libs := []string{root}
	if b, err := os.ReadFile(filepath.Join(root, "steamapps", "libraryfolders.vdf")); err == nil {
		libs = append(libs, vdfValues(string(b), "path")...)
	}
	var out []installedApp
	seen := map[string]bool{}
	for _, lib := range libs {
		dir := filepath.Join(lib, "steamapps")
		if k := strings.ToLower(dir); seen[k] {
			continue
		} else {
			seen[k] = true
		}
		files, _ := os.ReadDir(dir)
		for _, f := range files {
			if n := f.Name(); !strings.HasPrefix(n, "appmanifest_") || !strings.HasSuffix(n, ".acf") {
				continue
			}
			if b, err := os.ReadFile(filepath.Join(dir, f.Name())); err == nil {
				if g, ok := steamGame(dir, string(b)); ok {
					out = append(out, g)
				}
			}
		}
	}
	return out
}

// epicGames — установленные игры из Epic Games Launcher.
func epicGames() []installedApp {
	dir := filepath.Join(os.Getenv("ProgramData"), "Epic", "EpicGamesLauncher", "Data", "Manifests")
	files, _ := filepath.Glob(filepath.Join(dir, "*.item"))
	var out []installedApp
	for _, f := range files {
		if b, err := os.ReadFile(f); err == nil {
			if g, ok := epicGame(b); ok {
				out = append(out, g)
			}
		}
	}
	return out
}

// installedPrograms — список «Установленные приложения» Windows.
func installedPrograms() []installedApp {
	const path = `Software\Microsoft\Windows\CurrentVersion\Uninstall`
	roots := []struct {
		key  registry.Key
		view uint32
	}{{registry.LOCAL_MACHINE, registry.WOW64_64KEY}, {registry.LOCAL_MACHINE, registry.WOW64_32KEY}, {registry.CURRENT_USER, 0}}
	var out []installedApp
	for _, r := range roots {
		k, err := registry.OpenKey(r.key, path, registry.ENUMERATE_SUB_KEYS|r.view)
		if err != nil {
			continue
		}
		names, _ := k.ReadSubKeyNames(-1)
		for _, n := range names {
			sub, err := registry.OpenKey(k, n, registry.QUERY_VALUE|r.view)
			if err != nil {
				continue
			}
			str := func(v string) string { s, _, _ := sub.GetStringValue(v); return s }
			if name := str("DisplayName"); name != "" {
				out = append(out, installedApp{Name: name, Dir: strings.Trim(str("InstallLocation"), `" `), Icon: iconPath(str("DisplayIcon"))})
			}
			sub.Close()
		}
		k.Close()
	}
	return out
}
