package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// rate считает скорость из двух значений счётчика. Сброс счётчика (cur < prev) даёт 0.
func rate(prev, cur uint64, dt float64) float64 {
	if cur < prev || dt <= 0 {
		return 0
	}
	return float64(cur-prev) / dt
}

// cpuLoad: загрузка в % из приращений «простой» и «всего» (ядро включает простой).
func cpuLoad(idle, total uint64) float64 {
	if total == 0 || idle > total {
		return 0
	}
	return 100 * (1 - float64(idle)/float64(total))
}

// topN возвращает n элементов с наибольшим V (нулевые отбрасываются).
func topN(items []ProcItem, n int) []ProcItem {
	sort.Slice(items, func(i, j int) bool { return items[i].V > items[j].V })
	out := make([]ProcItem, 0, n)
	for _, it := range items {
		if it.V <= 0 || len(out) == n {
			break
		}
		out = append(out, it)
	}
	return out
}

// aggregateByName суммирует значения процессов с одинаковым именем (без учёта регистра).
func aggregateByName(m map[string]*ProcItem, name string, v float64) {
	k := strings.ToLower(name)
	if it, ok := m[k]; ok {
		it.V += v
		return
	}
	m[k] = &ProcItem{Name: strings.TrimSuffix(name, ".exe"), V: v}
}

// traffic — накопленный трафик за день и месяц, хранится в %APPDATA%\pcwidget\traffic.json.
type traffic struct {
	Day       string `json:"day"`
	DayDown   uint64 `json:"dayDown"`
	DayUp     uint64 `json:"dayUp"`
	Month     string `json:"month"`
	MonthDown uint64 `json:"monthDown"`
	MonthUp   uint64 `json:"monthUp"`
	dirty     bool
}

// add прибавляет приращение, при смене даты обнуляет день и месяц.
func (t *traffic) add(now time.Time, down, up uint64) {
	d, m := now.Format("2006-01-02"), now.Format("2006-01")
	if t.Day != d {
		t.Day, t.DayDown, t.DayUp = d, 0, 0
	}
	if t.Month != m {
		t.Month, t.MonthDown, t.MonthUp = m, 0, 0
	}
	t.DayDown += down
	t.DayUp += up
	t.MonthDown += down
	t.MonthUp += up
	t.dirty = down+up > 0 || t.dirty
}

func trafficPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "pcwidget", "traffic.json")
}

func loadTraffic() *traffic {
	t := &traffic{}
	if b, err := os.ReadFile(trafficPath()); err == nil {
		_ = json.Unmarshal(b, t)
	}
	return t
}

func (t *traffic) save() {
	if !t.dirty {
		return
	}
	p := trafficPath()
	if os.MkdirAll(filepath.Dir(p), 0o755) != nil {
		return
	}
	if b, err := json.Marshal(t); err == nil {
		tmp := p + ".tmp"
		if os.WriteFile(tmp, b, 0o644) == nil && os.Rename(tmp, p) == nil {
			t.dirty = false
		}
	}
}
