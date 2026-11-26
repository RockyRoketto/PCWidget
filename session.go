package main

import "math"

// Итог игровой сессии без WinAPI: копит кадры одного процесса, пока он на переднем плане.

const (
	freezeMs      = 50.0  // кадр дольше — фриз
	minSessionSec = 60    // меньше минуты кадров — итог не нужен
	reportPoints  = 256   // точек графика в отчёте
	histBins      = 10001 // времена кадров с шагом 0,1 мс до 1 с (дольше — пауза, в счёт не идёт)
)

// GameReport — то, что показывает карточка итога и хранит lastgame.json.
type GameReport struct {
	Name    string     `json:"name"`
	End     int64      `json:"end"` // unix, мс
	Sec     int        `json:"sec"` // секунды, когда игра рисовала на переднем плане
	Frames  int        `json:"frames"`
	FPS     float64    `json:"fps"`
	Low1    float64    `json:"low1"`
	Freezes int        `json:"freezes"`
	Share   [4]float64 `json:"share"` // % времени: меньше 60, 60–90, 90–120, от 120 FPS
	Avg     []float64  `json:"avg"`   // время кадра по ходу игры, мс
	Worst   []float64  `json:"worst"`
	CPUMax  *float64   `json:"cpuMax,omitempty"`
	GPUMax  *float64   `json:"gpuMax,omitempty"`
	Wh      *float64   `json:"wh,omitempty"` // только CPU и GPU
}

// gameSample — датчики на этот тик; nil = недоступно.
type gameSample struct {
	cpuT, gpuT, watts *float64
}

type gameSession struct {
	name          string
	last          int64 // последний учтённый кадр
	frames        int
	ms            float64
	freezes       int
	bandMs        [4]float64
	hist          []uint32
	avg, worst    []float64 // по точке на тик
	cpuMax, gpMax *float64
	wh            float64
	hasW          bool
}

func newGameSession(name string) *gameSession {
	return &gameSession{name: name, hist: make([]uint32, histBins)}
}

// fpsBand — номер полосы FPS; границы чуть ниже круглых, чтобы дрожание ровных 60 не считалось провалом.
func fpsBand(ms float64) int {
	switch fps := 1000 / ms; {
	case fps < 59.5:
		return 0
	case fps < 89.5:
		return 1
	case fps < 119.5:
		return 2
	}
	return 3
}

// add учитывает новые кадры из stamps (единицы 100 нс). После перерыва (игра была свёрнута)
// берутся только последние две секунды: фоновые кадры в итог не идут.
func (s *gameSession) add(stamps []int64, now int64, smp gameSample) {
	from := s.last
	if from < now-frameStale {
		from = now - 2*tick
	}
	n, sum, worst := 0, 0.0, 0.0
	for i := 1; i < len(stamps); i++ {
		if stamps[i] <= from {
			continue
		}
		d := stamps[i] - stamps[i-1]
		if d <= 0 || d > frameGap {
			continue
		}
		ms := float64(d) / 1e4
		n++
		sum += ms
		worst = math.Max(worst, ms)
		s.bandMs[fpsBand(ms)] += ms
		s.hist[min(int(ms*10+0.5), histBins-1)]++
		if ms > freezeMs {
			s.freezes++
		}
	}
	if k := len(stamps); k > 0 && stamps[k-1] > s.last {
		s.last = stamps[k-1]
	}
	if n == 0 {
		return
	}
	s.frames += n
	s.ms += sum
	s.avg = append(s.avg, sum/float64(n))
	s.worst = append(s.worst, worst)
	s.cpuMax = maxOf(s.cpuMax, smp.cpuT)
	s.gpMax = maxOf(s.gpMax, smp.gpuT)
	if smp.watts != nil {
		s.wh += *smp.watts * sum / 3.6e6
		s.hasW = true
	}
}

func maxOf(a, b *float64) *float64 {
	if b == nil || a != nil && *a >= *b {
		return a
	}
	return ptr(*b)
}

func (s *gameSession) seconds() float64 { return s.ms / 1000 }

// slowFrameMs — 99-й процентиль времени кадра по гистограмме.
func (s *gameSession) slowFrameMs() float64 {
	need := int(math.Ceil(0.99 * float64(s.frames)))
	got := 0
	for i, c := range s.hist {
		got += int(c)
		if got >= need {
			return float64(max(i, 1)) / 10
		}
	}
	return float64(histBins-1) / 10
}

// report: nil, если играли меньше минуты.
func (s *gameSession) report(end int64) *GameReport {
	if s.frames == 0 || s.seconds() < minSessionSec {
		return nil
	}
	r := &GameReport{Name: s.name, End: end, Sec: int(s.seconds()), Frames: s.frames,
		FPS: round1(float64(s.frames) / s.seconds()), Low1: round1(1000 / s.slowFrameMs()),
		Freezes: s.freezes, Avg: downsampleMean(s.avg, reportPoints), Worst: downsampleMax(s.worst, reportPoints),
		CPUMax: s.cpuMax, GPUMax: s.gpMax}
	for i, v := range s.bandMs {
		r.Share[i] = round1(v / s.ms * 100)
	}
	if s.hasW {
		r.Wh = ptr(round1(s.wh))
	}
	return r
}

// downsampleMean сжимает ряд до n точек средним по группе.
func downsampleMean(v []float64, n int) []float64 {
	n = min(n, len(v))
	out := make([]float64, n)
	for i := range out {
		out[i] = round2(mean(v[i*len(v)/n : (i+1)*len(v)/n]))
	}
	return out
}
