package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// WeatherStat — то, что уходит странице. Поле Weather в Stats пустое, пока плитка выключена или данных нет.
type WeatherStat struct {
	City  string  `json:"city"`
	Temp  float64 `json:"temp"`
	Feels float64 `json:"feels"`
	Desc  string  `json:"desc"`
	Icon  string  `json:"icon"` // sun, cloud, fog, rain, snow, storm
}

const (
	weatherEvery = 25 * time.Minute
	weatherRetry = 2 * time.Minute
)

// wmoInfo переводит код погоды WMO (Open-Meteo) в описание и ключ иконки.
func wmoInfo(code int) (desc, icon string) {
	switch {
	case code == 0:
		return "ясно", "sun"
	case code == 1 || code == 2:
		return "переменная облачность", "cloud"
	case code == 3:
		return "пасмурно", "cloud"
	case code == 45 || code == 48:
		return "туман", "fog"
	case code >= 51 && code <= 57:
		return "морось", "rain"
	case code >= 61 && code <= 67, code >= 80 && code <= 82:
		return "дождь", "rain"
	case code >= 71 && code <= 77, code == 85 || code == 86:
		return "снег", "snow"
	case code >= 95:
		return "гроза", "storm"
	}
	return "", "cloud"
}

// parseGeocode достаёт координаты первого найденного города.
func parseGeocode(b []byte) (name string, lat, lon float64, err error) {
	var r struct {
		Results []struct {
			Name      string  `json:"name"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"results"`
	}
	if err = json.Unmarshal(b, &r); err != nil {
		return
	}
	if len(r.Results) == 0 {
		return "", 0, 0, errors.New("город не найден")
	}
	g := r.Results[0]
	return g.Name, g.Latitude, g.Longitude, nil
}

// parseForecast разбирает блок current ответа Open-Meteo.
func parseForecast(city string, b []byte) (*WeatherStat, error) {
	var r struct {
		Current *struct {
			Temp  float64 `json:"temperature_2m"`
			Feels float64 `json:"apparent_temperature"`
			Code  int     `json:"weather_code"`
		} `json:"current"`
	}
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	if r.Current == nil {
		return nil, errors.New("нет данных о погоде")
	}
	d, ic := wmoInfo(r.Current.Code)
	return &WeatherStat{City: city, Temp: r.Current.Temp, Feels: r.Current.Feels, Desc: d, Icon: ic}, nil
}

// ---- сервис: запросы в интернет идут только пока город задан (плитка включена) ----

type weatherCache struct {
	Query string       `json:"query"`
	At    time.Time    `json:"at"`
	Stat  *WeatherStat `json:"stat"`
}

type weatherSvc struct {
	mu       sync.Mutex
	query    string // название города из настроек; пусто = плитка выключена, в сеть не ходим
	cur      *WeatherStat
	curQuery string    // для какого названия получены данные
	at       time.Time // когда получены
	next     time.Time // не раньше этого момента пробовать снова
}

func startWeather() *weatherSvc {
	w := &weatherSvc{}
	if b, err := os.ReadFile(weatherCachePath()); err == nil {
		var c weatherCache
		if json.Unmarshal(b, &c) == nil && c.Stat != nil {
			w.cur, w.curQuery, w.at = c.Stat, c.Query, c.At
		}
	}
	go w.loop()
	return w
}

// setCity вызывается страницей: пустое имя выключает запросы.
func (w *weatherSvc) setCity(city string) {
	city = strings.TrimSpace(city)
	w.mu.Lock()
	defer w.mu.Unlock()
	if city != w.query {
		w.query = city
		w.next = time.Time{}
	}
}

func (w *weatherSvc) get() *WeatherStat {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.query == "" || w.cur == nil || !strings.EqualFold(w.curQuery, w.query) {
		return nil
	}
	return w.cur
}

// needFetch: пора ли идти в сеть (вызывать под замком).
func (w *weatherSvc) needFetch(now time.Time) bool {
	if w.query == "" || now.Before(w.next) {
		return false
	}
	return w.cur == nil || !strings.EqualFold(w.curQuery, w.query) || now.Sub(w.at) >= weatherEvery
}

func (w *weatherSvc) loop() {
	for range time.Tick(5 * time.Second) {
		w.mu.Lock()
		q, need := w.query, w.needFetch(time.Now())
		w.mu.Unlock()
		if !need {
			continue
		}
		st, err := fetchWeather(q)
		w.mu.Lock()
		if err != nil {
			logf("weather: %v", err)
			w.next = time.Now().Add(weatherRetry)
		} else {
			w.cur, w.curQuery, w.at = st, q, time.Now()
			w.next = time.Time{}
			saveWeatherCache(weatherCache{Query: q, At: w.at, Stat: st})
		}
		w.mu.Unlock()
	}
}

var httpClient = &http.Client{Timeout: 10 * time.Second}

func httpGet(u string) ([]byte, error) {
	resp, err := httpClient.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, errors.New("HTTP " + resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

func fetchWeather(city string) (*WeatherStat, error) {
	g, err := httpGet("https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&format=json&name=" + url.QueryEscape(city))
	if err != nil {
		return nil, err
	}
	name, lat, lon, err := parseGeocode(g)
	if err != nil {
		return nil, err
	}
	f, err := httpGet("https://api.open-meteo.com/v1/forecast?timezone=auto&current=temperature_2m,apparent_temperature,weather_code" +
		"&latitude=" + strconv.FormatFloat(lat, 'f', 4, 64) + "&longitude=" + strconv.FormatFloat(lon, 'f', 4, 64))
	if err != nil {
		return nil, err
	}
	return parseForecast(name, f)
}

func weatherCachePath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "pcwidget", "weather.json")
}

func saveWeatherCache(c weatherCache) {
	p := weatherCachePath()
	if os.MkdirAll(filepath.Dir(p), 0o755) != nil {
		return
	}
	if b, err := json.Marshal(c); err == nil {
		_ = os.WriteFile(p, b, 0o644)
	}
}
