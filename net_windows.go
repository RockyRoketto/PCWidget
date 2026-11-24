package main

import (
	"net"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Сеть: скорость по физическим адаптерам (без петли и виртуальных) и пинг.

type ifPrev struct{ in, out uint64 }

type netMeter struct {
	prev map[uint64]ifPrev // по LUID адаптера, чтобы появление адаптера не давало скачков
	at   time.Time
}

// read возвращает скорость вниз/вверх (байт/с) и приращение байт с прошлого вызова.
func (m *netMeter) read() (down, up float64, dDown, dUp uint64, ok bool) {
	var t *windows.MibIfTable2
	if err := windows.GetIfTable2Ex(windows.MibIfTableNormal, &t); err != nil || t == nil {
		return
	}
	defer windows.FreeMibTable(unsafe.Pointer(t))

	now := time.Now()
	cur := make(map[uint64]ifPrev)
	for _, r := range unsafe.Slice(&t.Table[0], t.NumEntries) {
		// Только живые физические адаптеры: бит 0 флагов = HardwareInterface.
		if r.Type == windows.IF_TYPE_SOFTWARE_LOOPBACK || r.OperStatus != windows.IfOperStatusUp || r.InterfaceAndOperStatusFlags&1 == 0 {
			continue
		}
		cur[r.InterfaceLuid] = ifPrev{r.InOctets, r.OutOctets}
	}
	prev, at := m.prev, m.at
	m.prev, m.at = cur, now
	if prev == nil {
		return
	}
	for id, c := range cur {
		if p, found := prev[id]; found {
			if c.in >= p.in {
				dDown += c.in - p.in
			}
			if c.out >= p.out {
				dUp += c.out - p.out
			}
		}
	}
	dt := now.Sub(at).Seconds()
	return float64(dDown) / dt, float64(dUp) / dt, dDown, dUp, dt > 0
}

// pinger раз в 5 секунд замеряет время TCP-подключения к 1.1.1.1:443; потери считаются по последним 20 замерам.
type pinger struct {
	mu      sync.Mutex
	last    float64
	lastOK  bool
	results []bool
}

const pingWindow = 20

func startPinger() *pinger {
	p := &pinger{}
	go func() {
		for {
			t0 := time.Now()
			c, err := net.DialTimeout("tcp", "1.1.1.1:443", 1500*time.Millisecond)
			ms := float64(time.Since(t0).Microseconds()) / 1000
			if err == nil {
				c.Close()
			}
			p.mu.Lock()
			p.lastOK, p.last = err == nil, ms
			p.results = append(p.results, err == nil)
			if len(p.results) > pingWindow {
				p.results = p.results[1:]
			}
			p.mu.Unlock()
			time.Sleep(5 * time.Second)
		}
	}()
	return p
}

func (p *pinger) get() (ping, loss *float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.results) == 0 {
		return nil, nil
	}
	fails := 0
	for _, ok := range p.results {
		if !ok {
			fails++
		}
	}
	if p.lastOK {
		ping = ptr(p.last)
	}
	return ping, ptr(100 * float64(fails) / float64(len(p.results)))
}
