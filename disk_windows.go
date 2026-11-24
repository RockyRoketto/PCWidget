package main

import (
	"fmt"
	"strings"

	"golang.org/x/sys/windows"
)

const driveFixed = 3

// readDisks: заполненность по фиксированным дискам плюс скорость и занятость из PDH.
func readDisks(p *perf) []DiskStat {
	mask, err := windows.GetLogicalDrives()
	if err != nil {
		return nil
	}
	var read, write, busy map[string]float64
	if p != nil {
		read, write, busy = p.array(p.diskRead), p.array(p.diskWrite), p.array(p.diskBusy)
	}
	// буква диска -> значения физического диска
	type io struct{ r, w, b float64 }
	byLetter := map[string]io{}
	for inst, r := range read {
		for _, l := range driveLetters(inst) {
			byLetter[l] = io{r: r, w: write[inst], b: busy[inst]}
		}
	}

	var out []DiskStat
	for i := 0; i < 26; i++ {
		if mask&(1<<i) == 0 {
			continue
		}
		name := fmt.Sprintf("%c:", 'A'+i)
		root := windows.StringToUTF16Ptr(name + `\`)
		if windows.GetDriveType(root) != driveFixed {
			continue
		}
		var free, total, totalFree uint64
		if windows.GetDiskFreeSpaceEx(root, &free, &total, &totalFree) != nil || total == 0 {
			continue
		}
		d := DiskStat{
			Name:    name,
			TotalGB: float64(total) / gb,
			FreeGB:  float64(totalFree) / gb,
			UsedPct: 100 * (1 - float64(totalFree)/float64(total)),
		}
		if v, ok := byLetter[strings.ToUpper(name)]; ok {
			d.Read, d.Write = ptr(v.r), ptr(v.w)
			d.Busy = ptr(min(v.b, 100))
		}
		out = append(out, d)
	}
	return out
}
