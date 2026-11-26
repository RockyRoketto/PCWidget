package main

import (
	"math"
	"testing"
	"time"
)

func TestPowerSum(t *testing.T) {
	if _, ok := powerSum(nil, nil); ok {
		t.Fatal("без датчиков должно быть ok=false")
	}
	if w, ok := powerSum(ptr(65), nil); !ok || w != 65 {
		t.Fatalf("только CPU: %v %v", w, ok)
	}
	if w, _ := powerSum(ptr(65), ptr(250)); w != 315 {
		t.Fatalf("CPU+GPU: %v", w)
	}
	if w, ok := powerSum(ptr(-1), ptr(100)); !ok || w != 100 {
		t.Fatalf("отрицательное отбрасывается: %v", w)
	}
}

func TestEnergyAdd(t *testing.T) {
	e := &energy{}
	t0 := time.Date(2026, 11, 26, 12, 0, 0, 0, time.Local)
	e.add(t0, 360) // первый замер: только время
	if e.DayWh != 0 {
		t.Fatalf("первый замер не считается: %v", e.DayWh)
	}
	for i := 1; i <= 10; i++ { // 10 секунд по 360 Вт = 1 Вт·ч
		e.add(t0.Add(time.Duration(i)*time.Second), 360)
	}
	if math.Abs(e.DayWh-1) > 1e-9 || math.Abs(e.MonthWh-1) > 1e-9 {
		t.Fatalf("ждали 1 Вт·ч: день %v, месяц %v", e.DayWh, e.MonthWh)
	}
	if !e.dirty {
		t.Fatal("после прибавки нужно сохранить")
	}

	e.add(t0.Add(time.Hour), 360) // перерыв (сон): не считаем
	if math.Abs(e.DayWh-1) > 1e-9 {
		t.Fatalf("перерыв не должен считаться: %v", e.DayWh)
	}

	e.pause()
	e.add(t0.Add(time.Hour+time.Second), 360)
	if math.Abs(e.DayWh-1) > 1e-9 {
		t.Fatalf("после паузы первый замер не считается: %v", e.DayWh)
	}
}

func TestEnergyRollover(t *testing.T) {
	e := &energy{}
	t0 := time.Date(2026, 11, 30, 23, 59, 58, 0, time.Local)
	e.add(t0, 3600)
	e.add(t0.Add(time.Second), 3600)   // +1 Вт·ч 30 ноября
	e.add(t0.Add(2*time.Second), 3600) // 1 декабря: день и месяц с нуля, эта секунда уже декабрьская
	if e.Day != "2026-12-01" || e.Month != "2026-12" {
		t.Fatalf("не сменилась дата: %s %s", e.Day, e.Month)
	}
	if math.Abs(e.DayWh-1) > 1e-9 || math.Abs(e.MonthWh-1) > 1e-9 {
		t.Fatalf("новый день и месяц: %v %v", e.DayWh, e.MonthWh)
	}
	e.add(time.Date(2026, 12, 2, 0, 0, 0, 0, time.Local), 100) // новый день, месяц тот же
	if e.DayWh != 0 || math.Abs(e.MonthWh-1) > 1e-9 {
		t.Fatalf("смена дня внутри месяца: %v %v", e.DayWh, e.MonthWh)
	}
}
