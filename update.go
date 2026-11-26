package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
)

// Разбор ответа GitHub о последнем выпуске и сравнение версий (без сети и WinAPI).

const (
	latestAPI    = "https://api.github.com/repos/RockyRoketto/PCWidget/releases/latest"
	downloadBase = repoURL + "/releases/download/"
)

// release — выпуск, который можно поставить.
type release struct {
	Version string // «1.2»
	URL     string // widget.exe этого выпуска
	SHA256  string // 64 знака hex, как посчитал GitHub
}

// parseRelease берёт из ответа только то, чему можно доверять: файл widget.exe из выпусков
// этого проекта и с контрольной суммой. Иначе ошибка: ставить нечего.
func parseRelease(b []byte) (release, error) {
	var r struct {
		Tag    string `json:"tag_name"`
		Assets []struct {
			Name   string `json:"name"`
			URL    string `json:"browser_download_url"`
			Digest string `json:"digest"`
		} `json:"assets"`
	}
	if err := json.Unmarshal(b, &r); err != nil {
		return release{}, err
	}
	ver := strings.TrimPrefix(r.Tag, "v")
	if _, ok := parseVersion(ver); !ok {
		return release{}, errors.New("непонятный номер версии")
	}
	for _, a := range r.Assets {
		if a.Name != exeName {
			continue
		}
		sum, ok := strings.CutPrefix(strings.ToLower(a.Digest), "sha256:")
		if raw, err := hex.DecodeString(sum); !ok || err != nil || len(raw) != 32 {
			return release{}, errors.New("у файла нет контрольной суммы")
		}
		if !strings.HasPrefix(a.URL, downloadBase) || strings.Contains(a.URL, "..") {
			return release{}, errors.New("чужой адрес файла")
		}
		return release{Version: ver, URL: a.URL, SHA256: sum}, nil
	}
	return release{}, errors.New("в выпуске нет " + exeName)
}

// parseVersion: «1.2» или «1.2.3» -> числа.
func parseVersion(s string) ([3]int, bool) {
	var v [3]int
	parts := strings.Split(s, ".")
	if len(parts) < 2 || len(parts) > 3 {
		return v, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return v, false
		}
		v[i] = n
	}
	return v, true
}

// newerVersion: a новее b. Непонятная версия новее не считается.
func newerVersion(a, b string) bool {
	x, okA := parseVersion(a)
	y, okB := parseVersion(b)
	if !okA {
		return false
	}
	if !okB {
		return true
	}
	for i := range x {
		if x[i] != y[i] {
			return x[i] > y[i]
		}
	}
	return false
}
