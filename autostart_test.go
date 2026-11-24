package main

import (
	"strings"
	"testing"
)

func TestTaskXML(t *testing.T) {
	x := taskXML(`PC\user&1`, `C:\Program Files\PCWidget\widget.exe`, true)
	for _, want := range []string{
		"<LogonTrigger>", "<Delay>PT5S</Delay>", "HighestAvailable", "InteractiveToken",
		"<DisallowStartIfOnBatteries>false", "<StopIfGoingOnBatteries>false", "<ExecutionTimeLimit>PT0S",
		"IgnoreNew", `PC\user&amp;1`, `<WorkingDirectory>C:\Program Files\PCWidget</WorkingDirectory>`,
	} {
		if !strings.Contains(x, want) {
			t.Errorf("в XML нет %q", want)
		}
	}
	if !strings.Contains(taskXML("u", "c:/a.exe", false), "LeastPrivilege") {
		t.Error("без админа должен быть LeastPrivilege")
	}
}

func TestUTF16BOM(t *testing.T) {
	b := utf16BOM("aЯ")
	want := []byte{0xFF, 0xFE, 'a', 0, 0x2F, 0x04}
	if string(b) != string(want) {
		t.Errorf("получили % x, ждали % x", b, want)
	}
}

func TestAutostartDefault(t *testing.T) {
	var s Settings
	if !s.autostartEnabled() {
		t.Error("по умолчанию автозапуск включён")
	}
	off := false
	s.Autostart = &off
	if s.autostartEnabled() {
		t.Error("явное «выключено» должно сохраняться")
	}
	if autostartKey("a", true) == autostartKey("a", false) {
		t.Error("ключ обязан различать уровень прав")
	}
}
