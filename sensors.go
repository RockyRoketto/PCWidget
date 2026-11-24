package main

import (
	"strconv"
	"strings"
)

// sensor — одна запись помощника: «тип железа|тип датчика|имя|значение».
type sensor struct {
	hw, kind, name string
	val            float64
}

// parseSensors разбирает строку помощника (записи через табуляцию). Битые записи пропускаются.
func parseSensors(line string) []sensor {
	var out []sensor
	for _, rec := range strings.Split(strings.TrimSpace(line), "\t") {
		f := strings.Split(rec, "|")
		if len(f) != 4 {
			continue
		}
		v, err := strconv.ParseFloat(strings.TrimSpace(f[3]), 64)
		if err != nil {
			continue
		}
		out = append(out, sensor{hw: f[0], kind: f[1], name: f[2], val: v})
	}
	return out
}

// cpuReadings — то, что удалось узнать про процессор.
type cpuReadings struct {
	Temp, Freq, Power *float64
}

// pickCPU выбирает показания CPU. Температура: «CPU Package», иначе «Core (Tctl/Tdie)» (AMD),
// иначе «Core Max», иначе среднее по ядрам. Мощность: «Package». Частота: среднее по «Core #N».
func pickCPU(ss []sensor) cpuReadings {
	var r cpuReadings
	temps := map[string]float64{}
	var coreTemps, coreClocks []float64
	clockAvg := 0.0
	for _, s := range ss {
		// Без драйвера PawnIO библиотека отдаёт нули: настоящего нуля у температуры, частоты и мощности не бывает.
		if s.hw != "Cpu" || s.val <= 0 {
			continue
		}
		switch s.kind {
		case "Temperature":
			temps[s.name] = s.val
			if strings.HasPrefix(s.name, "Core #") {
				coreTemps = append(coreTemps, s.val)
			}
		case "Clock":
			if s.name == "Cores (Average)" { // AMD отдаёт готовое среднее
				clockAvg = s.val
			} else if strings.HasPrefix(s.name, "Core #") && !strings.Contains(s.name, "Bus") {
				coreClocks = append(coreClocks, s.val)
			}
		case "Power":
			if r.Power == nil && strings.Contains(s.name, "Package") {
				r.Power = ptr(s.val)
			}
		}
	}
	for _, n := range []string{"CPU Package", "Core (Tctl/Tdie)", "Core Max"} {
		if v, ok := temps[n]; ok {
			r.Temp = ptr(v)
			break
		}
	}
	if r.Temp == nil && len(coreTemps) > 0 {
		r.Temp = ptr(avg(coreTemps))
	}
	if clockAvg > 0 {
		r.Freq = ptr(clockAvg)
	} else if len(coreClocks) > 0 {
		r.Freq = ptr(avg(coreClocks))
	}
	return r
}

func avg(v []float64) float64 {
	t := 0.0
	for _, x := range v {
		t += x
	}
	return t / float64(len(v))
}
