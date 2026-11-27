package main

import (
	"os"
	"runtime"
	"testing"
	"time"
)

// deepen занимает часть стека, чтобы рост стека пришёлся на разные места внутри вызовов WinRT.
//
//go:noinline
func deepen(n int, f func()) byte {
	var pad [64]byte
	pad[n%64] = 1
	if n > 0 {
		pad[0] += deepen(n-1, f)
	} else {
		f()
	}
	return pad[n%64]
}

// Много чтений на свежих горутинах с маленьким стеком под сборкой мусора: так ловится
// передача в Windows адреса переменной, которую Go успел переместить.
func TestMediaStackLive(t *testing.T) {
	if os.Getenv("PCWIDGET_MEDIA_LIVE") == "" {
		t.Skip("PCWIDGET_MEDIA_LIVE не задан")
	}
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		for {
			select {
			case <-stop:
				return
			default:
				runtime.GC()
			}
		}
	}()
	seen := 0
	for i := 0; i < 3000; i++ {
		done := make(chan struct{})
		go func() {
			defer close(done)
			runtime.LockOSThread()
			if err := rtInit(); err != nil {
				t.Error(err)
				return
			}
			deepen(i%200, func() {
				m := &mediaSvc{props: map[string]mediaProps{}}
				if !m.open() {
					t.Error("менеджер не открылся")
					return
				}
				defer m.drop()
				if st, ok := m.collect("", time.Now()); !ok {
					t.Error("чтение не удалось")
				} else if st != nil {
					seen++
				}
			})
		}()
		<-done
		if t.Failed() {
			t.Fatalf("проход %d", i)
		}
	}
	t.Logf("проходов 3000, с источником %d", seen)
}
