package main

import (
	"bytes"
	"encoding/json"
	"math"
	"time"
)

// Разбор локальных файлов Claude Code (папка ~/.claude): лимиты, токены по дням, работающие чаты.
// Читаются только числа; текст переписки не разбирается и никуда не уходит. В сеть ничего не ходит.

// ClaudeStat — то, что уходит странице. Недоступное поле пустое.
type ClaudeStat struct {
	Limits   []ClaudeLimit `json:"limits,omitempty"`
	LimitsAt int64         `json:"limitsAt,omitempty"` // когда лимиты записаны, unix
	Ctx      *ClaudeCtx    `json:"ctx,omitempty"`      // контекст чата, который последним сообщил о себе
	Days     []ClaudeDay   `json:"days,omitempty"`     // 7 дней, последний = сегодня
	Busy     int           `json:"busy"`               // чаты, которые сейчас работают
	Wait     int           `json:"wait"`               // чаты, которые ждут ответа
	Open     int           `json:"open"`               // всего открыто
}

type ClaudeLimit struct {
	Kind  string  `json:"kind"` // five_hour, seven_day, seven_day_opus, ...
	Pct   float64 `json:"pct"`
	Reset int64   `json:"reset,omitempty"` // unix
}

type ClaudeCtx struct {
	Tokens float64 `json:"tokens"`
	Window float64 `json:"window"`
	Pct    float64 `json:"pct"`
}

type ClaudeDay struct {
	Date   string `json:"date"` // 2006-01-02, местное время
	Tokens int64  `json:"tokens"`
}

// parseClaudeLimits разбирает файл лимитов:
// {"at":мс,"limits":[{"kind","percentUsed","resetsAt":ISO}],"context":{"tokens","window","percent"}}.
// Окно, чьё время сброса прошло, считается пустым: новых данных о нём ещё нет.
func parseClaudeLimits(b []byte, now time.Time) (lims []ClaudeLimit, ctx *ClaudeCtx, at int64) {
	var f struct {
		At     int64 `json:"at"`
		Limits []struct {
			Kind  string   `json:"kind"`
			Pct   *float64 `json:"percentUsed"`
			Reset string   `json:"resetsAt"`
		} `json:"limits"`
		Context *struct {
			Tokens *float64 `json:"tokens"`
			Window float64  `json:"window"`
			Pct    *float64 `json:"percent"`
		} `json:"context"`
	}
	if json.Unmarshal(bytes.TrimPrefix(b, []byte("\xef\xbb\xbf")), &f) != nil {
		return nil, nil, 0
	}
	for _, l := range f.Limits {
		if l.Kind == "" || l.Pct == nil {
			continue
		}
		o := ClaudeLimit{Kind: l.Kind, Pct: math.Max(0, *l.Pct)}
		if t, err := time.Parse(time.RFC3339, l.Reset); err == nil {
			if t.After(now) {
				o.Reset = t.Unix()
			} else {
				o.Pct = 0
			}
		}
		lims = append(lims, o)
	}
	if c := f.Context; c != nil && c.Window > 0 && (c.Tokens != nil || c.Pct != nil) {
		ctx = &ClaudeCtx{Window: c.Window}
		if c.Tokens != nil {
			ctx.Tokens = *c.Tokens
			ctx.Pct = ctx.Tokens / c.Window * 100
		}
		if c.Pct != nil {
			ctx.Pct = *c.Pct
		}
	}
	return lims, ctx, f.At / 1000
}

// parseClaudeUsage достаёт из строки журнала чата расход одного ответа.
// Считаются новые токены: вход, ответ и запись в кэш. Чтение из кэша не считается.
func parseClaudeUsage(line []byte) (id string, at time.Time, tokens int64, ok bool) {
	if !bytes.Contains(line, []byte(`"usage"`)) || !bytes.Contains(line, []byte(`"assistant"`)) {
		return
	}
	var r struct {
		Type    string    `json:"type"`
		At      time.Time `json:"timestamp"`
		Message struct {
			ID    string `json:"id"`
			Usage *struct {
				In    int64 `json:"input_tokens"`
				Out   int64 `json:"output_tokens"`
				Write int64 `json:"cache_creation_input_tokens"`
			} `json:"usage"`
		} `json:"message"`
	}
	if json.Unmarshal(line, &r) != nil || r.Type != "assistant" || r.Message.ID == "" || r.Message.Usage == nil || r.At.IsZero() {
		return
	}
	u := r.Message.Usage
	return r.Message.ID, r.At, u.In + u.Out + u.Write, true
}

const claudeDays = 7

func dayKey(t time.Time) string { return t.Local().Format("2006-01-02") }

// claudeDaysFrom — полночь первого из последних семи дней.
func claudeDaysFrom(now time.Time) time.Time {
	y, m, d := now.Local().Date()
	return time.Date(y, m, d-claudeDays+1, 0, 0, 0, 0, time.Local)
}

// claudeTotals копит токены по дням. Один ответ встречается в журналах несколько раз
// (по строке на блок, копии при продолжении чата), поэтому учёт идёт по его номеру.
type claudeTotals struct{ seen map[string]claudeMsg }

type claudeMsg struct {
	at     time.Time
	tokens int64
}

func (c *claudeTotals) add(id string, at time.Time, tokens int64) {
	if c.seen == nil {
		c.seen = map[string]claudeMsg{}
	}
	if old, dup := c.seen[id]; dup {
		at = old.at
		tokens = max(tokens, old.tokens)
	}
	c.seen[id] = claudeMsg{at, tokens}
}

// days возвращает семь дней подряд и забывает то, что старше.
func (c *claudeTotals) days(now time.Time) []ClaudeDay {
	from := claudeDaysFrom(now)
	sum := map[string]int64{}
	for id, m := range c.seen {
		if m.at.Before(from) {
			delete(c.seen, id)
			continue
		}
		sum[dayKey(m.at)] += m.tokens
	}
	out := make([]ClaudeDay, claudeDays)
	for i := range out {
		k := from.AddDate(0, 0, i).Format("2006-01-02")
		out[i] = ClaudeDay{Date: k, Tokens: sum[k]}
	}
	return out
}

// parseClaudeSession — файл открытого чата: номер процесса и состояние.
func parseClaudeSession(b []byte) (pid uint32, status string, ok bool) {
	var r struct {
		Pid    uint32 `json:"pid"`
		Status string `json:"status"`
	}
	if json.Unmarshal(b, &r) != nil || r.Pid == 0 {
		return 0, "", false
	}
	return r.Pid, r.Status, true
}
