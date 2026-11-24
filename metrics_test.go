package main

import (
	"testing"
	"time"
)

func TestRate(t *testing.T) {
	if got := rate(100, 300, 2); got != 100 {
		t.Errorf("rate = %v", got)
	}
	if got := rate(300, 100, 1); got != 0 {
		t.Errorf("сброс счётчика должен дать 0, got %v", got)
	}
	if got := rate(1, 2, 0); got != 0 {
		t.Errorf("dt=0 должен дать 0, got %v", got)
	}
}

func TestCPULoad(t *testing.T) {
	if got := cpuLoad(75, 100); got != 25 {
		t.Errorf("cpuLoad = %v", got)
	}
	if cpuLoad(0, 0) != 0 || cpuLoad(200, 100) != 0 {
		t.Error("крайние случаи должны давать 0")
	}
}

func TestParseGPULine(t *testing.T) {
	g, ok := parseGPULine("0, NVIDIA GeForce RTX 3070 Laptop GPU, 55, 12, 1234, 8192, 20.50, [N/A], 300")
	if !ok || g.Name != "NVIDIA GeForce RTX 3070 Laptop GPU" || g.Load != 12 {
		t.Fatalf("разбор: %+v ok=%v", g, ok)
	}
	if g.Temp == nil || *g.Temp != 55 || g.Power == nil || *g.Power != 20.5 {
		t.Errorf("числа: %+v", g)
	}
	if g.Fan != nil {
		t.Error("[N/A] должен быть nil")
	}
	if _, ok := parseGPULine("1, Other, 1, 1, 1, 1, 1, 1, 1"); ok {
		t.Error("берём только GPU с индексом 0")
	}
	if _, ok := parseGPULine("мусор"); ok {
		t.Error("мусор должен отбрасываться")
	}
}

func TestTopNAndAggregate(t *testing.T) {
	m := map[string]*ProcItem{}
	aggregateByName(m, "chrome.exe", 10)
	aggregateByName(m, "Chrome.exe", 15)
	aggregateByName(m, "game.exe", 20)
	aggregateByName(m, "idle.exe", 0)
	var items []ProcItem
	for _, v := range m {
		items = append(items, *v)
	}
	top := topN(items, 3)
	if len(top) != 2 || top[0].Name != "chrome" || top[0].V != 25 {
		t.Errorf("top = %+v", top)
	}
}

func TestTrafficRollover(t *testing.T) {
	var tr traffic
	d1 := time.Date(2026, 11, 30, 23, 59, 0, 0, time.UTC)
	tr.add(d1, 100, 10)
	tr.add(d1, 50, 5)
	if tr.DayDown != 150 || tr.MonthDown != 150 || tr.MonthUp != 15 {
		t.Fatalf("накопление: %+v", tr)
	}
	tr.add(d1.Add(2*time.Minute), 7, 1) // 1 декабря
	if tr.DayDown != 7 || tr.MonthDown != 7 || tr.MonthUp != 1 {
		t.Errorf("смена дня и месяца: %+v", tr)
	}
	tr.add(d1.Add(26*time.Hour), 3, 0) // 2 декабря: день сброшен, месяц нет
	if tr.DayDown != 3 || tr.MonthDown != 10 {
		t.Errorf("смена дня: %+v", tr)
	}
}
