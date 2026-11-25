package main

import (
	"bufio"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

const (
	claudeEvery = 5 * time.Second
	// файл лимитов пишет мод внутри Claude Code (сам виджет в аккаунт не ходит)
	claudeLimitsFile = "pcwidget-limits.json"
)

// claudeSvc читает ~/.claude в фоне и только пока плитка включена.
type claudeSvc struct {
	mu   sync.Mutex
	on   bool
	cur  *ClaudeStat
	wake chan struct{}
	// ниже: только поток loop
	pos    map[string]int64 // сколько байт журнала уже разобрано
	totals claudeTotals
}

func startClaude() *claudeSvc {
	c := &claudeSvc{wake: make(chan struct{}, 1), pos: map[string]int64{}}
	go c.loop()
	return c
}

// setOn вызывается страницей: плитка включена или выключена.
func (c *claudeSvc) setOn(on bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.on == on {
		return
	}
	c.on = on
	if on {
		select {
		case c.wake <- struct{}{}:
		default:
		}
	}
}

func (c *claudeSvc) get() *ClaudeStat {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.on {
		return nil
	}
	return c.cur
}

func (c *claudeSvc) loop() {
	tick := time.NewTicker(claudeEvery)
	for {
		select {
		case <-tick.C:
		case <-c.wake:
		}
		c.mu.Lock()
		on := c.on
		c.mu.Unlock()
		if !on {
			continue
		}
		st := c.collect(time.Now())
		c.mu.Lock()
		c.cur = st
		c.mu.Unlock()
	}
}

func claudeDir() string {
	if d := os.Getenv("CLAUDE_CONFIG_DIR"); d != "" {
		return d
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude")
}

// collect возвращает nil, если Claude Code на этом ПК не найден.
func (c *claudeSvc) collect(now time.Time) *ClaudeStat {
	dir := claudeDir()
	if fi, err := os.Stat(dir); dir == "" || err != nil || !fi.IsDir() {
		return nil
	}
	st := &ClaudeStat{}
	if b, err := os.ReadFile(filepath.Join(dir, claudeLimitsFile)); err == nil {
		st.Limits, st.Ctx, st.LimitsAt = parseClaudeLimits(b, now)
	}
	c.scan(filepath.Join(dir, "projects"), now)
	st.Days = c.totals.days(now)
	st.Busy, st.Wait, st.Open = claudeSessions(filepath.Join(dir, "sessions"))
	return st
}

// scan дочитывает журналы, менявшиеся за последние семь дней.
func (c *claudeSvc) scan(dir string, now time.Time) {
	from := claudeDaysFrom(now)
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".jsonl") {
			return nil
		}
		fi, err := d.Info()
		if err != nil || fi.ModTime().Before(from) {
			return nil
		}
		done := c.pos[p]
		if fi.Size() == done {
			return nil
		}
		if fi.Size() < done { // файл переписан
			done = 0
		}
		c.pos[p] = c.readFrom(p, done)
		return nil
	})
}

// readFrom разбирает целые строки с места off и возвращает новое место; недописанная строка ждёт следующего раза.
func (c *claudeSvc) readFrom(p string, off int64) int64 {
	f, err := os.Open(p)
	if err != nil {
		return off
	}
	defer f.Close()
	if _, err := f.Seek(off, io.SeekStart); err != nil {
		return off
	}
	r := bufio.NewReaderSize(f, 1<<18)
	for {
		line, err := r.ReadBytes('\n')
		if err != nil {
			return off
		}
		off += int64(len(line))
		if id, at, n, ok := parseClaudeUsage(line); ok {
			c.totals.add(id, at, n)
		}
	}
}

func claudeSessions(dir string) (busy, wait, open int) {
	files, _ := filepath.Glob(filepath.Join(dir, "*.json"))
	for _, p := range files {
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		pid, status, ok := parseClaudeSession(b)
		if !ok || !pidAlive(pid) {
			continue
		}
		open++
		switch status {
		case "busy":
			busy++
		case "waiting":
			wait++
		}
	}
	return
}

func pidAlive(pid uint32) bool {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)
	var code uint32
	return windows.GetExitCodeProcess(h, &code) == nil && code == 259 // STILL_ACTIVE
}
