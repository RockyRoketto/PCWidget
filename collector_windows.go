package main

import "time"

// collector собирает один снимок Stats из всех источников. Вызывается раз в секунду из одного потока.
type collector struct {
	cpu     cpuMeter
	net     netMeter
	procs   procMeter
	perf    *perf
	gpu     *gpuReader
	ping    *pinger
	traffic *traffic
	lastSav time.Time
	sensors *sensorHub
}

// hub — помощник датчиков (нужен ещё меню: пункт установки драйвера).
var hub *sensorHub

// weather — сервис погоды; город ему сообщает страница (сообщение «weather:<город>»).
var weather = startWeather()

// claude — лимиты и расход Claude Code; включена ли плитка, сообщает страница (сообщение «claude:1»).
var claude = startClaude()

func newCollector() *collector {
	hub = startSensors()
	return &collector{perf: newPerf(), gpu: startGPU(), ping: startPinger(), traffic: loadTraffic(), sensors: hub}
}

func (c *collector) collect() Stats {
	now := time.Now()
	s := Stats{TS: now.Unix(), Uptime: uptimeSeconds(), Idle: userIdle()}

	if load, ok := c.cpu.load(); ok {
		s.CPU = &CPUStat{Load: load}
		r := c.sensors.cpu()
		s.CPU.Temp, s.CPU.Freq, s.CPU.Power = r.Temp, r.Freq, r.Power
	}

	var pageUsage *float64
	if c.perf != nil {
		c.perf.collect()
		if v, ok := c.perf.value(c.perf.pageUsage); ok {
			pageUsage = &v
		}
	}
	s.Mem = readMem(pageUsage)
	s.Disks = readDisks(c.perf)
	s.GPU = c.gpu.get()
	s.Procs = c.procs.top()
	s.Weather = weather.get()
	s.WeatherState = weather.state()
	s.Claude = claude.get()

	if down, up, dDown, dUp, ok := c.net.read(); ok {
		c.traffic.add(now, dDown, dUp)
		n := &NetStat{Down: down, Up: up,
			DayDown: c.traffic.DayDown, DayUp: c.traffic.DayUp,
			MonthDown: c.traffic.MonthDown, MonthUp: c.traffic.MonthUp}
		n.Ping, n.Loss = c.ping.get()
		s.Net = n
	}
	if now.Sub(c.lastSav) > 30*time.Second {
		c.traffic.save()
		c.lastSav = now
	}
	return s
}

// close сохраняет накопленное при выходе.
func (c *collector) close() {
	c.traffic.save()
	c.sensors.close()
}
