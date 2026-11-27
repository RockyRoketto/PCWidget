//go:build windows

package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

// Живая проверка названий и значков на этом ПК:
// PCWIDGET_DAY_LIVE=1 go test -run TestDayLive -v .
func TestDayLive(t *testing.T) {
	if os.Getenv("PCWIDGET_DAY_LIVE") == "" {
		t.Skip("только вручную")
	}
	runtime.LockOSThread()
	pCoInitializeEx.Call(0, coinitApartment)
	games, programs := append(steamGames(), epicGames()...), installedPrograms()
	t.Logf("игр в Steam и Epic: %d, программ в списке Windows: %d", len(games), len(programs))
	show := func(name, icon string) {
		if out := os.Getenv("PCWIDGET_DAY_OUT"); out != "" && icon != "" {
			f, _ := os.OpenFile(out, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
			f.WriteString("<p><img src='data:image/png;base64," + icon + "'> " + name + "</p>\n")
			f.Close()
		}
	}
	for _, g := range games {
		exe, size := "", int64(0) // самый большой exe в папке игры — обычно она сама
		filepath.WalkDir(g.Dir, func(p string, e fs.DirEntry, err error) error {
			if err == nil && !e.IsDir() && strings.EqualFold(filepath.Ext(p), ".exe") {
				if i, err := e.Info(); err == nil && i.Size() > size {
					exe, size = p, i.Size()
				}
			}
			return nil
		})
		if exe == "" {
			continue
		}
		desc, prod := versionNames(exe)
		name := appName(exe, nameSources{games, programs, desc, prod})
		_, icon := shellInfo(exe)
		t.Logf("игра: %s (%s) -> %s, значок %d", g.Name, filepath.Base(exe), name, len(icon))
		show(name, icon)
	}
	pids := make([]uint32, 2048)
	var n uint32
	if err := windows.EnumProcesses(pids, &n); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, pid := range pids[:n/4] {
		ref, ok := processRef(pid)
		if !ok || seen[ref.key()] || strings.HasPrefix(strings.ToLower(ref.path), `c:\windows\system32`) {
			continue
		}
		seen[ref.key()] = true
		name, icon := "", ""
		if ref.aumid != "" {
			name, icon = shellInfo(`shell:AppsFolder\` + ref.aumid)
		}
		desc, prod := versionNames(ref.path)
		if name == "" {
			name = appName(ref.path, nameSources{games, programs, desc, prod})
		}
		if icon == "" {
			_, icon = shellInfo(ref.path)
		}
		t.Logf("%-32s -> %-40s значок %5d store=%v", exeFile(ref.path), name, len(icon), ref.aumid != "")
		show(name, icon)
	}
	t.Logf("экран держат включённым: %v", displayKept())

	// Сам счёт: несколько секунд следим за настоящим передним окном. Файл дня не пишется.
	d := startDayTracker()
	d.mu.Lock()
	d.log = &dayLog{}
	d.mu.Unlock()
	d.setOn(true)
	var s *DayStat
	for i := 0; i < 5; i++ {
		s = d.tick(time.Now(), userIdle())
		time.Sleep(time.Second)
	}
	if s == nil {
		t.Log("счёт: за 5 секунд нечего считать (на переднем плане стол или простой)")
		return
	}
	for _, a := range s.Apps {
		t.Logf("счёт: %s — %d с из %d, значок №%d (%d б)", a.Name, a.Sec, s.Total, a.Icon, len(d.log.icon(a.Icon)))
	}
}
