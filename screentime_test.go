package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDayCounts(t *testing.T) {
	if !dayCounts(10, false, false) || dayCounts(dayIdle, false, false) {
		t.Fatal("простой должен останавливать счёт")
	}
	if !dayCounts(9999, true, false) || !dayCounts(9999, false, true) {
		t.Fatal("видео и игра на весь экран считаются и без мыши")
	}
}

func TestSkipApp(t *testing.T) {
	if !skipApp("LockApp.exe", "") || !skipApp("explorer.exe", "Progman") || skipApp("explorer.exe", "CabinetWClass") {
		t.Fatal("оболочка не считается, папки считаются")
	}
}

func TestDayLog(t *testing.T) {
	now := time.Date(2026, 3, 5, 12, 0, 0, 0, time.Local)
	l := &dayLog{}
	if l.stat(now) != nil {
		t.Fatal("пустой день без плитки")
	}
	l.add(now, "Б", "", 5)
	l.add(now, "А", "aWNvbg==", 90)
	l.add(now, "Б", "", 0.5)
	s := l.stat(now)
	if s.Total != 95 || len(s.Apps) != 2 || s.Apps[0].Name != "А" || s.Apps[0].Icon == 0 || s.Apps[1].Icon != 0 {
		t.Fatalf("неверный итог: %+v", s)
	}
	if l.icon(s.Apps[0].Icon) != "aWNvbg==" || l.icon(0) != "" || l.stat(now).Apps[0].Icon != s.Apps[0].Icon {
		t.Fatal("значок по номеру")
	}
	p := filepath.Join(t.TempDir(), "d", "day.json")
	l.save(p)
	if got := loadDay(p).stat(now); got == nil || got.Total != 95 || got.Apps[0].Icon == 0 {
		t.Fatalf("после чтения: %+v", got)
	}
	if l.stat(now.Add(24*time.Hour)) != nil {
		t.Fatal("новый день начинается с нуля")
	}
}

func TestAppName(t *testing.T) {
	games := []installedApp{{Dir: `D:\Steam\steamapps\common\Some Game`, Name: "Some Game: Deluxe™"}}
	programs := []installedApp{
		{Dir: `C:\Apps\Tool`, Name: "Tool Suite", Icon: `C:\Apps\Other\o.exe`},
		{Name: "Exact Name", Icon: `C:\Apps\x\x.exe`},
	}
	cases := []struct {
		path, desc, prod, want string
	}{
		{`d:\steam\steamapps\common\some game\bin\sg.exe`, "sg", "", "Some Game: Deluxe"},
		{`C:\Games\World of Warcraft\_retail_\Wow.exe`, "World of Warcraft", "", "World of Warcraft"},
		{`C:\Apps\x\X.exe`, "x helper", "", "Exact Name"},
		{`C:\Apps\Tool\t.exe`, "BootstrapPackagedGame", "", "Tool Suite"},
		{`C:\Apps\Tool\t.exe`, "Tool Editor", "", "Tool Editor"},
		{`C:\Windows\explorer.exe`, "", "Microsoft® Windows® Operating System", "Explorer"},
		{`C:\g\hero-Win64-Shipping.exe`, "", "", "Hero"},
	}
	for _, c := range cases {
		if got := appName(c.path, nameSources{games, programs, c.desc, c.prod}); got != c.want {
			t.Errorf("%s: %q, нужно %q", c.path, got, c.want)
		}
	}
	if underDir(`C:\a.exe`, `C:\`) {
		t.Error("корень диска не папка установки")
	}
}

func TestGameManifests(t *testing.T) {
	lib := "\"libraryfolders\"\n{\n \"0\"\n {\n  \"path\"\t\t\"D:\\\\Games\\\\Steam\"\n }\n}"
	if v := vdfValues(lib, "path"); len(v) != 1 || v[0] != `D:\Games\Steam` {
		t.Fatalf("библиотеки: %q", v)
	}
	g, ok := steamGame(`D:\s\steamapps`, "\"AppState\" { \"appid\" \"1\"\n\"name\"\t\"Half \\\"Life\\\"\"\n\"installdir\"\t\"HL\" }")
	if !ok || g.Name != `Half "Life"` || g.Dir != `D:\s\steamapps\common\HL` {
		t.Fatalf("steam: %+v", g)
	}
	e, ok := epicGame([]byte(`{"DisplayName":"Fort","InstallLocation":"D:\\E\\Fort"}`))
	if !ok || e.Name != "Fort" || e.Dir != `D:\E\Fort` {
		t.Fatalf("epic: %+v", e)
	}
	if got := iconPath(`"C:\p\a.exe",0`); got != `C:\p\a.exe` {
		t.Fatalf("значок: %q", got)
	}
}
