package main

import (
	"testing"
)

const ms = int64(10_000) // 1 мс в единицах 100 нс

// feed добавляет n кадров с шагом step начиная с t0 и возвращает время последнего.
func feed(c *frameCounter, src presentSource, pid uint32, t0, step int64, n int) int64 {
	t := t0
	for i := 0; i < n; i++ {
		c.add(src, pid, t)
		t += step
	}
	return t - step
}

func TestFrameStatSteady(t *testing.T) {
	c := newFrameCounter()
	end := feed(c, srcDXGI, 10, 0, 16*ms, 700) // ~62.5 FPS, 11 с
	s := c.stat(10, end)
	if s == nil {
		t.Fatal("нет показателей")
	}
	if s.FPS != 62.5 || s.FrameMs != 16 || s.FrameMs10 != 16 {
		t.Fatalf("fps=%v frame=%v frame10=%v", s.FPS, s.FrameMs, s.FrameMs10)
	}
	if s.Low1 == nil || *s.Low1 != 62.5 {
		t.Fatalf("low1=%v", s.Low1)
	}
	if len(s.Graph) != frameGraphMax {
		t.Fatalf("graph=%d", len(s.Graph))
	}
}

func TestFrameStatLowCatchesStutter(t *testing.T) {
	c := newFrameCounter()
	tt := int64(0)
	for i := 0; i < 600; i++ { // 10 с по 10 мс, каждый 50-й кадр 50 мс
		step := 10 * ms
		if i%50 == 49 {
			step = 50 * ms
		}
		tt += step
		c.add(srcDXGI, 1, tt)
	}
	s := c.stat(1, tt)
	if s.Low1 == nil || *s.Low1 != 20 { // 2% кадров по 50 мс → 99-й процентиль = 50 мс
		t.Fatalf("low1=%v", s.Low1)
	}
	if s.FPS >= 100 || s.FPS < 80 {
		t.Fatalf("fps=%v", s.FPS)
	}
	max := 0.0
	for _, v := range s.Graph {
		if v > max {
			max = v
		}
	}
	if max != 50 {
		t.Fatalf("рывок потерян в графике: max=%v", max)
	}
}

func TestFramePrefersRuntimeOverKernel(t *testing.T) {
	c := newFrameCounter()
	feed(c, srcKernel, 5, 0, 10*ms, 200)
	end := feed(c, srcDXGI, 5, 0, 20*ms, 100)
	if s := c.stat(5, end); s == nil || s.FPS != 50 {
		t.Fatalf("ждали DXGI 50 FPS: %+v", s)
	}
	// Только ядро (OpenGL/Vulkan): берём его.
	end = feed(c, srcKernel, 6, 0, 10*ms, 200)
	if s := c.stat(6, end); s == nil || s.FPS != 100 {
		t.Fatalf("ждали ядро 100 FPS: %+v", s)
	}
}

func TestFrameStaleAndUnknown(t *testing.T) {
	c := newFrameCounter()
	end := feed(c, srcDXGI, 7, 0, 10*ms, 100)
	if c.stat(8, end) != nil {
		t.Fatal("у чужого процесса не должно быть показателей")
	}
	if c.stat(7, end+4*tick) != nil {
		t.Fatal("процесс давно не рисует — показатели не нужны")
	}
	c.prune(end + 11*tick)
	if len(c.runs) != 0 {
		t.Fatal("prune не убрал старое")
	}
}

func TestFrameKeepsOnlyTenSeconds(t *testing.T) {
	c := newFrameCounter()
	feed(c, srcDXGI, 1, 0, 10*ms, 3000) // 30 с
	r := c.runs[frameKey{1, srcDXGI}]
	if span := r[len(r)-1] - r[0]; span > frameKeep {
		t.Fatalf("храним %v", span)
	}
}

func TestFramePauseIgnored(t *testing.T) {
	c := newFrameCounter()
	end := feed(c, srcDXGI, 1, 0, 10*ms, 100)
	end = feed(c, srcDXGI, 1, end+5*tick, 10*ms, 100) // 5 с паузы (свёрнуто)
	s := c.stat(1, end)
	if s == nil || s.FrameMs10 != 10 {
		t.Fatalf("пауза попала в среднее: %+v", s)
	}
}

func TestWantedPresentEvent(t *testing.T) {
	if !wantedPresentEvent(srcDXGI, 42) || !wantedPresentEvent(srcKernel, 184) || !wantedPresentEvent(srcD3D9, 1) {
		t.Fatal("нужные события отброшены")
	}
	if wantedPresentEvent(srcDXGI, 43) || wantedPresentEvent(srcKernel, 215) {
		t.Fatal("лишние события")
	}
}
