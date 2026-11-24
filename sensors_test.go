package main

import "testing"

func TestParseSensors(t *testing.T) {
	got := parseSensors("Cpu|Temperature|CPU Package|55.5\tbroken\tCpu|Clock|Core #1|3000\tCpu|Load|x|abc\n")
	if len(got) != 2 || got[0].name != "CPU Package" || got[0].val != 55.5 || got[1].kind != "Clock" {
		t.Errorf("parseSensors: %+v", got)
	}
	if len(parseSensors("")) != 0 {
		t.Error("пустая строка не даёт записей")
	}
}

func TestPickCPU(t *testing.T) {
	ss := parseSensors("Cpu|Temperature|Core #1|50\tCpu|Temperature|Core #2|60\tCpu|Clock|Core #1|3000\tCpu|Clock|Core #2|4000\tCpu|Clock|Bus Speed|100\tCpu|Power|CPU Package|45\tGpuNvidia|Temperature|GPU Core|70")
	r := pickCPU(ss)
	if r.Temp == nil || *r.Temp != 55 {
		t.Errorf("среднее по ядрам: %v", r.Temp)
	}
	if r.Freq == nil || *r.Freq != 3500 {
		t.Errorf("частота без Bus Speed: %v", r.Freq)
	}
	if r.Power == nil || *r.Power != 45 {
		t.Errorf("мощность: %v", r.Power)
	}
	r = pickCPU(parseSensors("Cpu|Temperature|Core Max|80\tCpu|Temperature|CPU Package|65\tCpu|Temperature|Core #1|10"))
	if *r.Temp != 65 {
		t.Errorf("приоритет CPU Package, получили %v", *r.Temp)
	}
	r = pickCPU(parseSensors("Cpu|Temperature|Core (Tctl/Tdie)|72"))
	if *r.Temp != 72 {
		t.Errorf("AMD Tctl: %v", *r.Temp)
	}
	r = pickCPU(parseSensors("Cpu|Clock|Cores (Average)|4200\tCpu|Clock|Core #1 (Effective)|3000"))
	if r.Freq == nil || *r.Freq != 4200 {
		t.Errorf("AMD: готовое среднее частоты: %v", r.Freq)
	}
	r = pickCPU(parseSensors("Cpu|Temperature|Core (Tctl/Tdie)|0\tCpu|Power|Package|0\tCpu|Clock|Cores (Average)|0"))
	if r.Temp != nil || r.Power != nil || r.Freq != nil {
		t.Error("нули без драйвера = нет данных")
	}
	if r := pickCPU(parseSensors("GpuNvidia|Temperature|GPU Core|70")); r.Temp != nil || r.Freq != nil || r.Power != nil {
		t.Error("GPU не должен попадать в CPU")
	}
}
