package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseClaudeLimits(t *testing.T) {
	now := time.Date(2026, 11, 25, 18, 0, 0, 0, time.UTC)
	l, ctx, at := parseClaudeLimits([]byte(`{"at":1795629600000,"limits":[
		{"kind":"five_hour","percentUsed":19.5,"resetsAt":"2026-11-25T20:50:00.153Z"},
		{"kind":"seven_day","percentUsed":80,"resetsAt":"2026-11-25T17:00:00Z"},
		{"kind":"spend_limit","percentUsed":120},{"kind":"bad"}],
		"context":{"tokens":80000,"window":1000000}}`), now)
	if len(l) != 3 || l[0].Pct != 19.5 || l[0].Reset == 0 {
		t.Fatalf("%+v", l)
	}
	if l[1].Pct != 0 || l[1].Reset != 0 {
		t.Fatalf("прошедший сброс обнуляет окно: %+v", l[1])
	}
	if l[2].Pct != 120 {
		t.Fatalf("%+v", l[2])
	}
	if ctx == nil || ctx.Pct != 8 || at != 1795629600 {
		t.Fatalf("%+v %d", ctx, at)
	}
	if l, ctx, _ := parseClaudeLimits([]byte(`мусор`), now); l != nil || ctx != nil {
		t.Fatal("битый файл ничего не даёт")
	}
}

const usageLine = `{"type":"assistant","timestamp":"2026-11-25T12:00:00Z","message":{"id":"m1","usage":{"input_tokens":2,"output_tokens":10,"cache_creation_input_tokens":100,"cache_read_input_tokens":9999}}}` + "\n"

func TestParseClaudeUsage(t *testing.T) {
	id, at, n, ok := parseClaudeUsage([]byte(usageLine))
	if !ok || id != "m1" || n != 112 || at.Hour() != 12 {
		t.Fatalf("%v %v %v %v", id, at, n, ok)
	}
	for _, s := range []string{``, `{"type":"user","message":{"usage":"assistant"}}`, `{"type":"assistant","message":{"id":"x"},"usage":1}`} {
		if _, _, _, ok := parseClaudeUsage([]byte(s)); ok {
			t.Fatalf("лишняя строка: %s", s)
		}
	}
}

func TestClaudeTotals(t *testing.T) {
	now := time.Date(2026, 11, 25, 15, 0, 0, 0, time.Local)
	var c claudeTotals
	c.add("a", now, 10)
	c.add("a", now.Add(time.Second), 30) // тот же ответ, дописан
	c.add("b", now.AddDate(0, 0, -6), 5)
	c.add("c", now.AddDate(0, 0, -7), 7) // старше недели
	d := c.days(now)
	if len(d) != 7 || d[6].Date != "2026-11-25" || d[6].Tokens != 30 || d[0].Tokens != 5 {
		t.Fatalf("%+v", d)
	}
	if _, ok := c.seen["c"]; ok {
		t.Fatal("старое должно забываться")
	}
}

func TestClaudeReadFrom(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.jsonl")
	if err := os.WriteFile(p, []byte(usageLine+usageLine[:40]), 0o644); err != nil {
		t.Fatal(err)
	}
	c := &claudeSvc{}
	if off := c.readFrom(p, 0); off != int64(len(usageLine)) || len(c.totals.seen) != 1 {
		t.Fatalf("недописанная строка ждёт: %d %v", off, c.totals.seen)
	}
}

func TestParseClaudeSession(t *testing.T) {
	if pid, st, ok := parseClaudeSession([]byte(`{"pid":12,"status":"busy"}`)); !ok || pid != 12 || st != "busy" {
		t.Fatal(pid, st, ok)
	}
	if _, _, ok := parseClaudeSession([]byte(`{}`)); ok {
		t.Fatal("без pid не считается")
	}
}
