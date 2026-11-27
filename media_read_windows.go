package main

import (
	"encoding/base64"
	"strings"
	"time"
)

// collect читает выбранный источник целиком и короткий список остальных.
// ok = false — менеджер сломался (например, служба перезапущена), его надо открыть заново.
func (m *mediaSvc) collect(picked string, now time.Time) (*MediaStat, bool) {
	ss, cur, ok := m.sessions()
	if !ok {
		return nil, false
	}
	defer releaseAll(ss)
	if len(ss) == 0 {
		m.setArt("", "")
		return nil, true
	}
	ids, playing := sessionIDs(ss)
	i := mediaPick(ids, playing, cur, picked)
	s := ss[i]
	st := &MediaStat{ID: ids[i], Src: mediaName(ids[i]), At: now.UnixMilli(), Rate: 1}

	if inf, err := s.obj(sesInfo); err == nil && inf != nil {
		st.State = mediaState(inf.u32(infoStatus))
		if c, err := inf.obj(infoControls); err == nil && c != nil {
			st.Play, st.Pause = c.flag(ctlPlay), c.flag(ctlPause)
			st.Next, st.Prev = c.flag(ctlNext), c.flag(ctlPrev)
			c.release()
		}
		if r, err := inf.obj(infoRate); err == nil && r != nil { // IReference<double>
			if v := r.f64(6); v > 0 {
				st.Rate = v
			}
			r.release()
		}
		inf.release()
	}
	if st.State == "closed" {
		m.setArt("", "")
		return nil, true
	}

	if tl, err := s.obj(sesTimeline); err == nil && tl != nil {
		start, end := tl.i64(tlStart), tl.i64(tlEnd)
		pos, upd := tl.i64(tlPos), tl.i64(tlUpdated)
		tl.release()
		if end > start {
			dur := float64(end-start) / 1e7
			var at time.Time
			if upd > ftUnixDelta {
				at = time.Unix(0, (upd-ftUnixDelta)*100)
			}
			p := mediaPos(float64(pos-start)/1e7, dur, at, now, st.Rate, st.State == "playing")
			st.Pos, st.Dur = &p, &dur
		}
	}

	p := m.readProps(s, ids[i], now, 0, true)
	st.Title, st.Artist, st.Album = p.title, p.artist, p.album
	m.mu.Lock()
	st.Art = m.artN
	if m.art == "" {
		st.Art = 0
	}
	m.mu.Unlock()

	if len(ss) > 1 {
		for j, o := range ss {
			it := MediaItem{ID: ids[j], Src: mediaName(ids[j]), State: "paused", Cur: ids[j] == cur}
			if playing[j] {
				it.State = "playing"
			}
			if j == i {
				it.Title = st.Title
			} else {
				it.Title = m.readProps(o, ids[j], now, mediaOthers, false).title
			}
			st.List = append(st.List, it)
		}
	}
	m.forget(ids)
	return st, true
}

// readProps берёт название и исполнителя (с кэшем на maxAge); для выбранного источника при смене трека
// достаёт и обложку.
func (m *mediaSvc) readProps(s *rtObj, id string, now time.Time, maxAge time.Duration, withArt bool) mediaProps {
	old, have := m.props[id]
	if have && now.Sub(old.at) < maxAge {
		return old
	}
	op, err := s.obj(sesProps)
	if err != nil || op == nil {
		return old
	}
	pr, err := awaitObj(op, time.Second)
	if err != nil || pr == nil {
		return old
	}
	defer pr.release()
	p := mediaProps{title: pr.str(propTitle), artist: pr.str(propArtist), album: pr.str(propAlbum), at: now}
	if p.artist == "" {
		p.artist = pr.str(propAlbumArtist)
	}
	m.props[id] = p
	if withArt {
		key := mediaKey(id, p.title, p.artist, p.album)
		if key != m.artKey {
			m.artKey, m.artTries = key, 0
			m.setArt("", "")
		}
		// браузеры часто присылают обложку позже названия: несколько попыток на трек
		if m.artTries < 5 && m.artEmpty() {
			m.artTries++
			if ct, data := readThumb(pr); len(data) > 0 {
				m.setArt(ct, base64.StdEncoding.EncodeToString(data))
			}
		}
	}
	return p
}

func (m *mediaSvc) forget(ids []string) {
	for id := range m.props {
		keep := false
		for _, x := range ids {
			keep = keep || x == id
		}
		if !keep {
			delete(m.props, id)
		}
	}
}

func (m *mediaSvc) artEmpty() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.art == ""
}

func (m *mediaSvc) setArt(ct, b64 string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if b64 == "" {
		m.art = ""
		return
	}
	ct, _, _ = strings.Cut(ct, ",") // Медиаплеер отдаёт список: «image/jpeg,image/jpe,…»
	if !strings.HasPrefix(ct, "image/") {
		ct = "image/png"
	}
	m.art = "data:" + ct + ";base64," + b64
	m.artN++
}

// readThumb читает обложку из свойств трека: тип и байты.
func readThumb(pr *rtObj) (string, []byte) {
	ref, err := pr.obj(propThumb)
	if err != nil || ref == nil {
		return "", nil
	}
	defer ref.release()
	op, err := ref.obj(6) // OpenReadAsync
	if err != nil || op == nil {
		return "", nil
	}
	stm, err := awaitObj(op, 2*time.Second)
	if err != nil || stm == nil {
		return "", nil
	}
	defer stm.release()
	ct := ""
	if cp, err := stm.qi(&iidContentType); err == nil {
		ct = cp.str(6)
		cp.release()
	}
	ras, err := stm.qi(&iidRandomStream)
	if err != nil {
		return "", nil
	}
	defer ras.release()
	data, err := readAllRAS(ras, uint64(ras.i64(6)), mediaArtMax)
	if err != nil {
		return "", nil
	}
	return ct, data
}
