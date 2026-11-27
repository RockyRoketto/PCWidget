package main

import (
	"testing"
	"time"
)

func TestUpdateWait(t *testing.T) {
	if got := updateWait(0); got != updateEvery {
		t.Errorf("после удачи: %v", got)
	}
	if got := updateWait(1); got != 30*time.Second {
		t.Errorf("после первой неудачи: %v", got)
	}
	if got := updateWait(len(updateRetry) + 1); got != updateEvery {
		t.Errorf("после многих неудач: %v", got)
	}
}

func TestUpdateDue(t *testing.T) {
	last := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		after time.Duration
		want  bool
	}{{time.Minute, false}, {time.Hour, true}, {10 * time.Hour, true}, {-time.Hour, true}}
	for _, c := range cases {
		if got := updateDue(last.Add(c.after), last, time.Hour); got != c.want {
			t.Errorf("через %v: %v", c.after, got)
		}
	}
	if !updateDue(last, time.Time{}, updateNudge) {
		t.Error("ни разу не проверяли — пора")
	}
}
