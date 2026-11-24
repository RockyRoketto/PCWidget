package main

import "testing"

func TestIsInstalled(t *testing.T) {
	pf := `C:\Program Files`
	cases := []struct {
		exe  string
		want bool
	}{
		{`C:\Program Files\PCWidget\widget.exe`, true},
		{`c:\program files\pcwidget\Widget.exe`, true},
		{`C:\Program Files\PCWidget\sub\widget.exe`, false},
		{`D:\Projects\x\dist\widget.exe`, false},
		{`C:\Program Files\Other\widget.exe`, false},
	}
	for _, c := range cases {
		if got := isInstalled(c.exe, pf); got != c.want {
			t.Errorf("isInstalled(%q) = %v", c.exe, got)
		}
	}
	if isInstalled(`C:\a\widget.exe`, "") {
		t.Error("без ProgramFiles установленным быть нельзя")
	}
}

func TestCliMode(t *testing.T) {
	if cliMode([]string{"--install"}) != "install" || cliMode([]string{"x", "--UNINSTALL"}) != "uninstall" || cliMode(nil) != "" {
		t.Error("cliMode разбирает аргументы неверно")
	}
}
