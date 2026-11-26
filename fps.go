package main

import (
	"math"
	"sort"
	"sync"
)

// Разбор кадров без WinAPI. На вход — события начала вывода кадра (pid, время в единицах 100 нс),
// на выход — FPS, 1% low и время кадра по выбранному процессу.

type presentSource uint8

const (
	srcDXGI   presentSource = iota + 1 // DirectX 10–12 (Present_Start, PresentMultiplaneOverlay_Start)
	srcD3D9                            // Direct3D 9 (Present_Start)
	srcKernel                          // DxgKrnl Present_Info: любой API, включая OpenGL и Vulkan
)

// wantedPresentEvent: какие события провайдеров означают «приложение отдало кадр».
func wantedPresentEvent(src presentSource, id uint16) bool {
	switch src {
	case srcDXGI:
		return id == 42 || id == 55
	case srcD3D9:
		return id == 1
	case srcKernel:
		return id == 184
	}
	return false
}

const (
	tick          = int64(10_000_000) // 1 с в единицах 100 нс
	frameKeep     = 10 * tick         // сколько истории держать (для 1% low и среднего за 10 с)
	frameStale    = 3 * tick          // процесс без кадров дольше — считаем, что он не рисует
	frameGap      = tick              // интервал длиннее — пауза (свёрнуто, загрузка), в статистику не идёт
	frameGraphMax = 20                // точек мини-графика за секунду (страница держит последние 3 с)
)

// FrameStat уходит в страницу как Stats.frames.
type FrameStat struct {
	FPS       float64   `json:"fps"`       // за последнюю секунду
	Low1      *float64  `json:"low1"`      // 1% low за 10 с: FPS по 99-му процентилю времени кадра
	FrameMs   float64   `json:"frameMs"`   // среднее время кадра за 1 с, мс
	FrameMs10 float64   `json:"frameMs10"` // среднее время кадра за 10 с, мс
	Graph     []float64 `json:"graph"`     // время кадра за последнюю секунду (худшее в группе), мс
}

type frameKey struct {
	pid uint32
	src presentSource
}

// frameCounter копит отметки кадров по процессам. add вызывается из потока ETW, stat — раз в секунду.
type frameCounter struct {
	mu   sync.Mutex
	runs map[frameKey][]int64
	last int64 // самая поздняя отметка вообще (для чистки)
}

func newFrameCounter() *frameCounter { return &frameCounter{runs: map[frameKey][]int64{}} }

func (c *frameCounter) add(src presentSource, pid uint32, ts int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	k := frameKey{pid, src}
	r := c.runs[k]
	if n := len(r); n > 0 && ts < r[n-1] {
		return // события из разных буферов бывают не по порядку; редкость, пропускаем
	}
	r = append(r, ts)
	if r[0] < ts-frameKeep {
		i := sort.Search(len(r), func(i int) bool { return r[i] >= ts-frameKeep })
		r = append(r[:0], r[i:]...)
	}
	c.runs[k] = r
	if ts > c.last {
		c.last = ts
	}
}

// prune выкидывает процессы, которые давно не рисовали.
func (c *frameCounter) prune(now int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, r := range c.runs {
		if len(r) == 0 || r[len(r)-1] < now-frameKeep {
			delete(c.runs, k)
		}
	}
}

// pick выбирает источник для процесса: события самого API точнее ядра, ядро — запасной путь.
func (c *frameCounter) pick(pid uint32, now int64) []int64 {
	for _, s := range []presentSource{srcDXGI, srcD3D9, srcKernel} {
		r := c.runs[frameKey{pid, s}]
		if len(r) >= 2 && r[len(r)-1] >= now-frameStale {
			return r
		}
	}
	return nil
}

// stat считает показатели процесса pid на момент now (те же единицы, что у отметок).
func (c *frameCounter) stat(pid uint32, now int64) *FrameStat {
	c.mu.Lock()
	r := append([]int64(nil), c.pick(pid, now)...)
	c.mu.Unlock()
	return frameStatOf(r)
}

// frameStatOf: окна считаются от последнего кадра, а не от часов, потому что ETW отдаёт события
// пачками с задержкой до секунды.
func frameStatOf(r []int64) *FrameStat {
	if len(r) < 2 {
		return nil
	}
	end := r[len(r)-1]
	var all, last []float64 // интервалы, мс
	for i := 1; i < len(r); i++ {
		d := r[i] - r[i-1]
		if d <= 0 || d > frameGap {
			continue
		}
		ms := float64(d) / 1e4
		all = append(all, ms)
		if r[i] > end-tick {
			last = append(last, ms)
		}
	}
	if len(last) == 0 {
		return nil
	}
	s := &FrameStat{FrameMs: round2(mean(last)), FrameMs10: round2(mean(all))}
	s.FPS = round1(1000 / mean(last))
	if len(all) >= 20 { // меньше — процентиль ни о чём не говорит
		s.Low1 = ptr(round1(1000 / percentile(all, 0.99)))
	}
	s.Graph = downsampleMax(last, frameGraphMax)
	return s
}

func mean(v []float64) float64 {
	t := 0.0
	for _, x := range v {
		t += x
	}
	return t / float64(len(v))
}

// percentile без интерполяции: значение, ниже которого доля p остальных.
func percentile(v []float64, p float64) float64 {
	s := append([]float64(nil), v...)
	sort.Float64s(s)
	i := int(math.Ceil(p*float64(len(s)))) - 1
	if i < 0 {
		i = 0
	}
	return s[i]
}

// downsampleMax сжимает ряд до n точек, оставляя в каждой группе худшее значение (рывки не теряются).
func downsampleMax(v []float64, n int) []float64 {
	if len(v) <= n {
		out := make([]float64, len(v))
		for i, x := range v {
			out[i] = round2(x)
		}
		return out
	}
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		a, b := i*len(v)/n, (i+1)*len(v)/n
		m := v[a]
		for _, x := range v[a:b] {
			m = math.Max(m, x)
		}
		out[i] = round2(m)
	}
	return out
}

func round1(x float64) float64 { return math.Round(x*10) / 10 }
func round2(x float64) float64 { return math.Round(x*100) / 100 }
