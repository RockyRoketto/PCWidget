package main

import (
	"encoding/binary"
	"reflect"
	"testing"
	"time"
)

func TestParseCoreTimes(t *testing.T) {
	b := make([]byte, 2*coreRecSize+7) // хвост неполной записи не читается
	for i := range 2 {
		r := b[i*coreRecSize:]
		for k := range 3 {
			binary.LittleEndian.PutUint64(r[k*8:], uint64(10*i+k+1))
		}
	}
	want := []coreTimes{{1, 2, 3}, {11, 12, 13}}
	if got := parseCoreTimes(b); !reflect.DeepEqual(got, want) {
		t.Errorf("parseCoreTimes = %v", got)
	}
	if got := parseCoreTimes(nil); len(got) != 0 {
		t.Errorf("пустой ввод: %v", got)
	}
}

func TestCoreLoads(t *testing.T) {
	prev := []coreTimes{{100, 200, 100}, {100, 200, 100}, {100, 200, 100}, {100, 200, 100}}
	cur := []coreTimes{
		{175, 280, 120}, // простой 75 из 100
		{100, 200, 200}, // занят полностью
		{100, 200, 100}, // времени не прошло
		{50, 250, 150},  // откат счётчика
	}
	if got, want := coreLoads(prev, cur), []float64{25, 100, 0, 0}; !reflect.DeepEqual(got, want) {
		t.Errorf("coreLoads = %v, хотели %v", got, want)
	}
	if coreLoads(nil, cur) != nil || coreLoads(prev[:2], cur) != nil || coreLoads(nil, nil) != nil {
		t.Error("без пары замеров должно быть nil")
	}
}

// Живой вызов системы: по записи на каждый поток во всех группах.
func TestCoreMeterLive(t *testing.T) {
	var m coreMeter
	if m.loads() != nil {
		t.Fatal("первый замер должен быть nil")
	}
	time.Sleep(200 * time.Millisecond)
	got := m.loads()
	n, _, _ := kernel32.NewProc("GetActiveProcessorCount").Call(0xffff) // все группы
	if len(got) != int(n) {
		t.Fatalf("потоков %d, а в системе %d", len(got), n)
	}
	for _, v := range got {
		if v < 0 || v > 100 {
			t.Fatalf("вне 0..100: %v", got)
		}
	}
}
