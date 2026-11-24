package main

import (
	"testing"
	"time"
)

func TestParseGeocode(t *testing.T) {
	n, lat, lon, err := parseGeocode([]byte(`{"results":[{"name":"Париж","latitude":48.85,"longitude":2.35}]}`))
	if err != nil || n != "Париж" || lat != 48.85 || lon != 2.35 {
		t.Fatalf("%v %v %v %v", n, lat, lon, err)
	}
	if _, _, _, err := parseGeocode([]byte(`{}`)); err == nil {
		t.Fatal("пустой ответ должен давать ошибку")
	}
}

func TestParseForecast(t *testing.T) {
	w, err := parseForecast("Х", []byte(`{"current":{"temperature_2m":12.4,"apparent_temperature":10.1,"weather_code":61}}`))
	if err != nil || w.Temp != 12.4 || w.Feels != 10.1 || w.Icon != "rain" || w.Desc != "дождь" {
		t.Fatalf("%+v %v", w, err)
	}
	if _, err := parseForecast("Х", []byte(`{}`)); err == nil {
		t.Fatal("нет current — ошибка")
	}
}

func TestWmoInfo(t *testing.T) {
	for code, icon := range map[int]string{0: "sun", 2: "cloud", 45: "fog", 73: "snow", 95: "storm", 999: "storm"} {
		if _, ic := wmoInfo(code); ic != icon {
			t.Errorf("код %d: %s, ждали %s", code, ic, icon)
		}
	}
}

func TestNeedFetch(t *testing.T) {
	now := time.Now()
	w := &weatherSvc{}
	if w.needFetch(now) {
		t.Fatal("без города в сеть ходить нельзя")
	}
	w.setCity(" Москва ")
	if !w.needFetch(now) {
		t.Fatal("город задан, данных нет: нужен запрос")
	}
	w.cur, w.curQuery, w.at = &WeatherStat{}, "москва", now
	if w.needFetch(now) || w.get() == nil {
		t.Fatal("свежие данные (регистр не важен): запрос не нужен")
	}
	if !w.needFetch(now.Add(weatherEvery + time.Second)) {
		t.Fatal("данные устарели")
	}
	w.setCity("Омск")
	if w.get() != nil || !w.needFetch(now) {
		t.Fatal("смена города: старые данные не показывать, запросить новые")
	}
	w.setCity("")
	if w.get() != nil || w.needFetch(now) {
		t.Fatal("выключено: ничего")
	}
}
