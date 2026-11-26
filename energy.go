package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// EnergyStat — сколько сейчас берут CPU и GPU и сколько набежало за день и месяц.
// Считаются только датчики CPU и GPU: от розетки весь ПК берёт больше.
type EnergyStat struct {
	Power   float64 `json:"power"`   // Вт сейчас
	DayWh   float64 `json:"dayWh"`   // Вт·ч с полуночи
	MonthWh float64 `json:"monthWh"` // Вт·ч с первого числа
}

// maxGap — дольше этого между замерами (сон, зависание) не считаем: неизвестно, что было.
const maxGap = 5 * time.Second

// energy — накопленное за день и месяц, хранится в %APPDATA%\pcwidget\energy.json.
type energy struct {
	Day     string    `json:"day"`
	DayWh   float64   `json:"dayWh"`
	Month   string    `json:"month"`
	MonthWh float64   `json:"monthWh"`
	last    time.Time // прошлый замер
	dirty   bool
}

// powerSum складывает известную мощность CPU и GPU. ok = false, если не известна ни одна.
func powerSum(cpu, gpu *float64) (float64, bool) {
	w, ok := 0.0, false
	for _, p := range []*float64{cpu, gpu} {
		if p != nil && *p >= 0 {
			w += *p
			ok = true
		}
	}
	return w, ok
}

// add прибавляет энергию за время с прошлого замера, при смене даты обнуляет день и месяц.
// Первый замер и замер после долгого перерыва только запоминают время.
func (e *energy) add(now time.Time, watts float64) {
	d, m := now.Format("2006-01-02"), now.Format("2006-01")
	if e.Day != d {
		e.Day, e.DayWh = d, 0
	}
	if e.Month != m {
		e.Month, e.MonthWh = m, 0
	}
	dt := now.Sub(e.last)
	prev := e.last
	e.last = now
	if prev.IsZero() || dt <= 0 || dt > maxGap || watts <= 0 {
		return
	}
	wh := watts * dt.Hours()
	e.DayWh += wh
	e.MonthWh += wh
	e.dirty = true
}

// pause: данных о мощности нет, следующий замер начнёт отсчёт заново.
func (e *energy) pause() { e.last = time.Time{} }

func (e *energy) stat(watts float64) *EnergyStat {
	return &EnergyStat{Power: watts, DayWh: e.DayWh, MonthWh: e.MonthWh}
}

func energyPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "pcwidget", "energy.json")
}

func loadEnergy() *energy {
	e := &energy{}
	if b, err := os.ReadFile(energyPath()); err == nil {
		_ = json.Unmarshal(b, e)
	}
	return e
}

func (e *energy) save() {
	if !e.dirty {
		return
	}
	p := energyPath()
	if os.MkdirAll(filepath.Dir(p), 0o755) != nil {
		return
	}
	if b, err := json.Marshal(e); err == nil {
		tmp := p + ".tmp"
		if os.WriteFile(tmp, b, 0o644) == nil && os.Rename(tmp, p) == nil {
			e.dirty = false
		}
	}
}
