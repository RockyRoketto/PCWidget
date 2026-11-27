package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

// Живая проверка «Сейчас играет» (нужен играющий плеер или вкладка браузера):
// PCWIDGET_MEDIA_LIVE=1 go test -run TestMediaLive -v .
// Вместо 1 можно дать команды через запятую: PCWIDGET_MEDIA_LIVE=pause,play,toggle,toggle,next,prev
func TestMediaLive(t *testing.T) {
	mode := os.Getenv("PCWIDGET_MEDIA_LIVE")
	if mode == "" {
		t.Skip("PCWIDGET_MEDIA_LIVE не задан")
	}
	m := startMedia()
	m.setOn(true)
	show := func(what string) {
		time.Sleep(1500 * time.Millisecond)
		st := m.get()
		b, _ := json.Marshal(st)
		t.Logf("%s: %s", what, b)
		if st != nil && st.Art > 0 {
			js := m.artJS()
			t.Logf("  обложка: %d байт, %s", len(js), js[strings.Index(js, "data:"):][:30])
		}
	}
	show("сейчас")
	time.Sleep(2 * time.Second)
	show("через 2 с (позиция досчитана)")
	for _, c := range strings.Split(mode, ",") {
		if c != "1" {
			m.command(c)
			show("после " + c)
		}
	}
	m.setOn(false)
	time.Sleep(1200 * time.Millisecond)
	if m.get() != nil {
		t.Error("после выключения данные остались")
	}
}
