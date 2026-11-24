package main

import (
	"strconv"
	"strings"
)

// gpuQuery — поля в том порядке, в котором их разбирает parseGPULine.
const gpuQuery = "index,name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,fan.speed,clocks.gr"

// parseGPULine разбирает строку CSV от nvidia-smi (--format=csv,noheader,nounits).
// ok=false, если это не GPU с индексом 0 или строка битая.
func parseGPULine(line string) (g GPUStat, ok bool) {
	f := strings.Split(strings.TrimSpace(line), ",")
	if len(f) < 9 {
		return g, false
	}
	for i := range f {
		f[i] = strings.TrimSpace(f[i])
	}
	if f[0] != "0" {
		return g, false
	}
	g.Name = f[1]
	g.Temp = gpuNum(f[2])
	if v := gpuNum(f[3]); v != nil {
		g.Load = *v
	}
	g.MemUsed = gpuNum(f[4])
	g.MemTotal = gpuNum(f[5])
	g.Power = gpuNum(f[6])
	g.Fan = gpuNum(f[7])
	g.Clock = gpuNum(f[8])
	return g, true
}

// gpuNum: «[N/A]», «[Not Supported]» и мусор = недоступно.
func gpuNum(s string) *float64 {
	if s == "" || strings.HasPrefix(s, "[") {
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil
	}
	return &v
}
