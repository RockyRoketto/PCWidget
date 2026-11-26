package main

import (
	"encoding/binary"
	"math"
)

// Загрузка по логическим ядрам (потокам): разбор записей ядра Windows и расчёт процентов.

// coreRecSize — размер SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION: пять 8-байтных времён
// (простой, ядро, пользователь, DPC, прерывания), счётчик прерываний и выравнивание.
const coreRecSize = 48

// coreTimes — накопленные времена одного потока; ядро включает простой.
type coreTimes struct{ idle, kernel, user uint64 }

// parseCoreTimes разбирает ответ системы: подряд по записи на поток. Неполный хвост отбрасывается.
func parseCoreTimes(b []byte) []coreTimes {
	out := make([]coreTimes, 0, len(b)/coreRecSize)
	for ; len(b) >= coreRecSize; b = b[coreRecSize:] {
		le := binary.LittleEndian
		out = append(out, coreTimes{le.Uint64(b), le.Uint64(b[8:]), le.Uint64(b[16:])})
	}
	return out
}

// coreLoads — загрузка каждого потока в целых % между двумя замерами. Нет прошлого замера или
// изменилось число потоков — nil. Откат счётчика даёт 0.
func coreLoads(prev, cur []coreTimes) []float64 {
	if len(cur) == 0 || len(prev) != len(cur) {
		return nil
	}
	out := make([]float64, len(cur))
	for i, c := range cur {
		p := prev[i]
		if c.idle < p.idle || c.kernel < p.kernel || c.user < p.user {
			continue
		}
		out[i] = math.Round(cpuLoad(c.idle-p.idle, (c.kernel-p.kernel)+(c.user-p.user)))
	}
	return out
}
