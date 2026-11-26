package main

import (
	"os"
	"strconv"
	"testing"
	"time"
)

// Живая проверка трассировки (нужны права администратора и запущенная игра):
// PCWIDGET_ETW_LIVE=<pid игры> go test -run TestETWLive -v .
func TestETWLive(t *testing.T) {
	pid, _ := strconv.Atoi(os.Getenv("PCWIDGET_ETW_LIVE"))
	if pid == 0 {
		t.Skip("PCWIDGET_ETW_LIVE не задан")
	}
	fc := newFrameCounter()
	tr, err := startPresentTrace(fc.add)
	if err != nil {
		t.Fatal(err)
	}
	defer tr.stop()
	for i := 0; i < 12; i++ {
		time.Sleep(time.Second)
		now := filetimeNow()
		s := fc.stat(uint32(pid), now)
		if s != nil {
			low := 0.0
			if s.Low1 != nil {
				low = *s.Low1
			}
			t.Logf("fps=%v low1=%v frame=%vms frame10=%vms lag=%vms", s.FPS, low, s.FrameMs, s.FrameMs10, (now-fc.last)/10000)
		}
	}
}
