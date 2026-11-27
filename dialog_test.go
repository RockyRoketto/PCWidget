package main

import (
	"encoding/binary"
	"strings"
	"testing"
)

func TestTaskConfigPack(t *testing.T) {
	b := taskConfig{flags: 7, common: 1, title: 0x1111, content: 0x2222, count: 2, buttons: 0x3333, def: 100, callback: 0x4444}.pack()
	if len(b) != 160 || binary.LittleEndian.Uint32(b) != 160 {
		t.Fatalf("размер структуры: %d", len(b))
	}
	for at, want := range map[int]uint64{28: 0x1111, 52: 0x2222, 64: 0x3333, 140: 0x4444} {
		if got := binary.LittleEndian.Uint64(b[at:]); got != want {
			t.Errorf("смещение %d: %#x, нужно %#x", at, got, want)
		}
	}
	p := packButtons([]dlgButton{{id: 100, text: 5}, {id: 101, text: 9}})
	if len(p) != 24 || binary.LittleEndian.Uint32(p[12:]) != 101 || binary.LittleEndian.Uint64(p[16:]) != 9 {
		t.Errorf("кнопки: %v", p)
	}
}

func TestInstallTexts(t *testing.T) {
	cases := []struct {
		present  bool
		old      string
		head, ok string
	}{
		{false, "", "Установить PC Widget 2.0?", "Установить"},
		{true, "2.0", "PC Widget 2.0 уже установлен", "Переустановить"},
		{true, "1.0", "Обновить PC Widget с 1.0 до 2.0?", "Обновить"},
		{true, "", "Обновить PC Widget до 2.0?", "Обновить"},
	}
	for _, c := range cases {
		head, _, ok := installQuestion(c.present, c.old, "2.0", `C:\X`)
		if head != c.head || ok != c.ok {
			t.Errorf("%v %q: %q / %q", c.present, c.old, head, ok)
		}
	}
	if _, text, _ := installQuestion(false, "", "2.0", `C:\X`); !strings.Contains(text, `C:\X`) {
		t.Error("в вопросе нет папки установки")
	}
	if got := downloadText(1<<20, 4<<20); got != "Скачано 1.0 из 4.0 МБ" {
		t.Error(got)
	}
	if got := downloadText(1<<20, -1); got != "Скачано 1.0 МБ" {
		t.Error(got)
	}
}
