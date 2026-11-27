package main

import (
	"testing"
	"time"
)

func TestMediaName(t *testing.T) {
	cases := map[string]string{
		"Spotify.exe":      "Spotify",
		"Chrome":           "Chrome",
		"MSEdge":           "Edge",
		"308046B0AF4A39CB": "Firefox",
		"Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic": "Медиаплеер",
		"SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify":          "Spotify",
		`C:\Program Files\VideoLAN\VLC\vlc.exe`:                 "VLC",
		"SomePlayer.exe":                                        "SomePlayer",
		"":                                                      "",
	}
	for in, want := range cases {
		if got := mediaName(in); got != want {
			t.Errorf("mediaName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMediaPos(t *testing.T) {
	t0 := time.Unix(1000, 0)
	if p := mediaPos(10, 100, t0, t0.Add(5*time.Second), 1, true); p != 15 {
		t.Errorf("playing: %v", p)
	}
	if p := mediaPos(10, 100, t0, t0.Add(5*time.Second), 1, false); p != 10 {
		t.Errorf("paused: %v", p)
	}
	if p := mediaPos(10, 100, t0, t0.Add(4*time.Second), 2, true); p != 18 {
		t.Errorf("rate 2: %v", p)
	}
	if p := mediaPos(98, 100, t0, t0.Add(10*time.Second), 1, true); p != 100 {
		t.Errorf("clamp end: %v", p)
	}
	if p := mediaPos(10, 0, time.Time{}, t0, 1, true); p != 10 {
		t.Errorf("unknown update time: %v", p)
	}
	if p := mediaPos(10, 100, t0, t0.Add(3*time.Second), 0, true); p != 13 {
		t.Errorf("zero rate means 1: %v", p)
	}
}

func TestMediaPick(t *testing.T) {
	ids := []string{"a", "b", "c"}
	pl := []bool{false, false, true}
	if i := mediaPick(ids, pl, "b", "c"); i != 2 {
		t.Errorf("picked wins: %d", i)
	}
	if i := mediaPick(ids, pl, "b", "gone"); i != 1 {
		t.Errorf("current when picked gone: %d", i)
	}
	if i := mediaPick(ids, pl, "", ""); i != 2 {
		t.Errorf("first playing: %d", i)
	}
	if i := mediaPick(ids, []bool{false, false, false}, "", ""); i != 0 {
		t.Errorf("first: %d", i)
	}
	if i := mediaPick(nil, nil, "a", ""); i != -1 {
		t.Errorf("empty: %d", i)
	}
}

func TestMediaState(t *testing.T) {
	if mediaState(4) != "playing" || mediaState(5) != "paused" || mediaState(99) != "stopped" {
		t.Error("states")
	}
}
