package main

import (
	"strings"
	"time"
)

// MediaStat — что играет в системе (плитка «Сейчас играет»).
// Данные берутся из системного управления мультимедиа Windows: туда пишут браузеры и плееры.
type MediaStat struct {
	ID     string `json:"id"`  // идентификатор приложения (AUMID)
	Src    string `json:"src"` // имя приложения для показа
	Title  string `json:"title,omitempty"`
	Artist string `json:"artist,omitempty"`
	Album  string `json:"album,omitempty"`
	// State: playing, paused, stopped, changing, opened, closed
	State string `json:"state"`
	// Pos и Dur в секундах; Pos — на момент At (мс Unix). Нет шкалы времени — оба null.
	Pos  *float64 `json:"pos"`
	Dur  *float64 `json:"dur"`
	At   int64    `json:"at"`
	Rate float64  `json:"rate"`
	// Кнопки, которые источник сейчас разрешает.
	Prev  bool `json:"prev,omitempty"`
	Next  bool `json:"next,omitempty"`
	Play  bool `json:"play,omitempty"`
	Pause bool `json:"pause,omitempty"`
	// Art — номер обложки; саму картинку страница просит сообщением «media:art».
	Art  int         `json:"art,omitempty"`
	List []MediaItem `json:"list,omitempty"` // все источники, если их больше одного
}

// MediaItem — источник в списке для переключения.
type MediaItem struct {
	ID    string `json:"id"`
	Src   string `json:"src"`
	Title string `json:"title,omitempty"`
	State string `json:"state"`
	Cur   bool   `json:"cur,omitempty"` // текущий по версии Windows
}

var mediaStates = []string{"closed", "opened", "changing", "stopped", "playing", "paused"}

func mediaState(v uint32) string {
	if int(v) < len(mediaStates) {
		return mediaStates[v]
	}
	return "stopped"
}

// mediaPos досчитывает позицию от момента последнего обновления источником.
// Браузеры обновляют шкалу редко (при перемотке и паузе), поэтому без досчёта позиция стоит.
// pos, end — секунды; updated — когда источник прислал pos (нулевое — неизвестно).
func mediaPos(pos, end float64, updated, now time.Time, rate float64, playing bool) float64 {
	if playing && !updated.IsZero() && now.After(updated) {
		if rate <= 0 {
			rate = 1
		}
		pos += now.Sub(updated).Seconds() * rate
	}
	if pos < 0 {
		pos = 0
	}
	if end > 0 && pos > end {
		pos = end
	}
	return pos
}

// mediaPick выбирает источник: выбранный руками, если он ещё есть, иначе текущий по версии Windows,
// иначе первый играющий, иначе первый. Возвращает индекс или -1.
func mediaPick(ids []string, playing []bool, cur, picked string) int {
	if len(ids) == 0 {
		return -1
	}
	for _, want := range []string{picked, cur} {
		if want == "" {
			continue
		}
		for i, id := range ids {
			if id == want {
				return i
			}
		}
	}
	for i, p := range playing {
		if p {
			return i
		}
	}
	return 0
}

var mediaNames = map[string]string{
	"chrome": "Chrome", "msedge": "Edge", "firefox": "Firefox", "308046b0af4a39cb": "Firefox",
	"opera": "Opera", "brave": "Brave", "vivaldi": "Vivaldi", "browser": "Яндекс Браузер", "yandex": "Яндекс Браузер",
	"spotify": "Spotify", "spotifymusic": "Spotify", "zunemusic": "Медиаплеер", "zunevideo": "Кино и ТВ",
	"vlc": "VLC", "foobar2000": "foobar2000", "aimp": "AIMP", "musicbee": "MusicBee", "wmplayer": "Windows Media Player",
	"telegram": "Telegram", "discord": "Discord", "itunes": "iTunes", "applemusic": "Apple Music",
	"yandexmusic": "Яндекс Музыка", "potplayer": "PotPlayer", "potplayermini64": "PotPlayer", "mpc-hc64": "MPC-HC",
}

// mediaName делает из AUMID короткое имя приложения.
// Примеры: «Spotify.exe», «Chrome», «MSEdge», «Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic»,
// «C:\Program Files\VideoLAN\VLC\vlc.exe».
func mediaName(aumid string) string {
	s := aumid
	if i := strings.IndexByte(s, '!'); i >= 0 { // пакет: семейство!приложение
		s = s[:i]
		if j := strings.IndexByte(s, '_'); j >= 0 {
			s = s[:j]
		}
	}
	if i := strings.LastIndexAny(s, `\/`); i >= 0 {
		s = s[i+1:]
	}
	s = strings.TrimSuffix(strings.TrimSuffix(s, ".exe"), ".EXE")
	key := strings.ToLower(s)
	if n, ok := mediaNames[key]; ok {
		return n
	}
	if i := strings.LastIndexByte(key, '.'); i >= 0 { // Microsoft.ZuneMusic, SpotifyAB.SpotifyMusic
		if n, ok := mediaNames[key[i+1:]]; ok {
			return n
		}
		s = s[i+1:]
	}
	if s == "" {
		return aumid
	}
	return s
}

// mediaKey — признак смены трека: при смене нужна новая обложка.
func mediaKey(id, title, artist, album string) string {
	return id + "\x00" + title + "\x00" + artist + "\x00" + album
}
