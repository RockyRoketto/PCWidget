package main

import (
	"encoding/base64"
	"math"
	"testing"
	"time"
)

// playFrames прогоняет через сессию sec секунд ровных кадров по ms миллисекунд, начиная с момента at.
func playFrames(s *gameSession, at int64, sec int, ms float64, smp gameSample) int64 {
	step := int64(ms * 1e4)
	run := []int64{at}
	for i := 0; i < sec; i++ {
		end := at + int64(i+1)*tick
		for run[len(run)-1]+step <= end {
			run = append(run, run[len(run)-1]+step)
		}
		s.add(run, end, smp)
	}
	return run[len(run)-1]
}

func TestGameSessionReport(t *testing.T) {
	s := newGameSession("game.exe")
	smp := gameSample{cpuT: ptr(60), gpuT: ptr(70), watts: ptr(360)}
	end := playFrames(s, 1000*tick, 30, 10, smp)
	if s.report(1) != nil {
		t.Fatal("меньше минуты: отчёта быть не должно")
	}
	smp.gpuT = ptr(76)
	playFrames(s, end, 40, 10, smp)
	r := s.report(5)
	if r == nil {
		t.Fatal("нет отчёта")
	}
	if r.Name != "game.exe" || r.End != 5 || r.Sec < 69 || r.Sec > 70 {
		t.Errorf("шапка: %+v", r)
	}
	if math.Abs(r.FPS-100) > 0.5 || math.Abs(r.Low1-100) > 0.5 || r.Freezes != 0 || r.Share[2] != 100 {
		t.Errorf("fps %v low %v фризы %v доли %v", r.FPS, r.Low1, r.Freezes, r.Share)
	}
	if *r.GPUMax != 76 || *r.CPUMax != 60 || math.Abs(*r.Wh-7) > 0.2 {
		t.Errorf("датчики: %v %v %v", *r.CPUMax, *r.GPUMax, *r.Wh)
	}
	if len(r.Avg) != len(r.Worst) || len(r.Avg) == 0 || len(r.Avg) > reportPoints {
		t.Errorf("график: %d %d", len(r.Avg), len(r.Worst))
	}
}

func TestGameSessionFreezeAndBreak(t *testing.T) {
	s := newGameSession("g")
	at := int64(1000 * tick)
	run := []int64{at, at + 100_000, at + 900_000} // 10 мс и фриз 80 мс
	s.add(run, at+tick, gameSample{})
	if s.frames != 2 || s.freezes != 1 {
		t.Fatalf("кадры %d фризы %d", s.frames, s.freezes)
	}
	s.add(run, at+tick, gameSample{}) // те же кадры второй раз не считаются
	if s.frames != 2 {
		t.Fatalf("повтор посчитан: %d", s.frames)
	}
	// через минуту вернулись в игру: старые фоновые кадры (раньше двух секунд) пропускаются
	now := at + 60*tick
	back := []int64{now - 8*tick, now - 8*tick + 100_000, now - tick, now - tick + 100_000}
	s.add(back, now, gameSample{})
	if s.frames != 3 {
		t.Fatalf("после перерыва: %d", s.frames)
	}
	if s.cpuMax != nil || s.hasW {
		t.Error("датчиков не было")
	}
}

func TestFpsBand(t *testing.T) {
	for ms, want := range map[float64]int{33: 0, 16.7: 1, 11.2: 1, 11.1: 2, 8.34: 3, 4: 3} {
		if got := fpsBand(ms); got != want {
			t.Errorf("%v мс: %d, ждали %d", ms, got, want)
		}
	}
}

func TestReportPNG(t *testing.T) {
	png := append([]byte("\x89PNG\r\n\x1a\n"), 1, 2, 3)
	b, err := decodePNG("data:image/png;base64," + base64.StdEncoding.EncodeToString(png))
	if err != nil || len(b) != len(png) {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "data:image/png;base64,!!!", "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("MZ..."))} {
		if _, err := decodePNG(bad); err == nil {
			t.Errorf("принято %q", bad)
		}
	}
}

func TestReportFileName(t *testing.T) {
	at := time.Date(2026, 1, 2, 3, 4, 0, 0, time.Local).UnixMilli()
	if got := reportFileName(`a<b>:c.exe`, at); got != "abc 2026-01-02 03-04.png" {
		t.Error(got)
	}
	if got := reportFileName("", at); got != "Игра 2026-01-02 03-04.png" {
		t.Error(got)
	}
}

func TestReportPage(t *testing.T) {
	p, err := buildReportPage()
	if err != nil || len(p) < 1000 {
		t.Fatal(err)
	}
}
