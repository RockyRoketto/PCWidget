package main

import (
	"os"
	"strings"
	"testing"
)

func TestNewerVersion(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"1.1", "1.0", true}, {"1.10", "1.9", true}, {"2.0", "1.9.9", true}, {"1.1.1", "1.1", true},
		{"1.1", "1.1", false}, {"1.1.0", "1.1", false}, {"1.0", "1.1", false},
		{"beta", "1.0", false}, {"1.0", "", true},
	}
	for _, c := range cases {
		if got := newerVersion(c.a, c.b); got != c.want {
			t.Errorf("newerVersion(%q, %q) = %v", c.a, c.b, got)
		}
	}
}

func TestParseRelease(t *testing.T) {
	sum := strings.Repeat("ab", 32)
	body := func(tag, name, url, digest string) []byte {
		return []byte(`{"tag_name":"` + tag + `","assets":[{"name":"` + name + `","browser_download_url":"` + url + `","digest":"` + digest + `"}]}`)
	}
	good := downloadBase + "v1.2/widget.exe"
	r, err := parseRelease(body("v1.2", "widget.exe", good, "sha256:"+sum))
	if err != nil || r.Version != "1.2" || r.URL != good || r.SHA256 != sum {
		t.Fatalf("хороший выпуск: %+v, %v", r, err)
	}
	bad := map[string][]byte{
		"не JSON":     []byte("<html>"),
		"без версии":  body("latest", "widget.exe", good, "sha256:"+sum),
		"другой файл": body("v1.2", "setup.msi", good, "sha256:"+sum),
		"без суммы":   body("v1.2", "widget.exe", good, ""),
		"короткая":    body("v1.2", "widget.exe", good, "sha256:abcd"),
		"чужой адрес": body("v1.2", "widget.exe", "https://example.com/widget.exe", "sha256:"+sum),
		"выход вверх": body("v1.2", "widget.exe", downloadBase+"../../x/widget.exe", "sha256:"+sum),
	}
	for name, b := range bad {
		if _, err := parseRelease(b); err == nil {
			t.Errorf("%s: принят", name)
		}
	}
}

// Настоящий ответ GitHub (в сеть ходит только по PCWIDGET_LIVE=1).
func TestParseReleaseLive(t *testing.T) {
	if os.Getenv("PCWIDGET_LIVE") == "" {
		t.Skip("нужна сеть")
	}
	b, err := httpGet(latestAPI)
	if err != nil {
		t.Fatal(err)
	}
	r, err := parseRelease(b)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("последний выпуск %s, %s", r.Version, r.URL)
}

func TestShouldAutoInstall(t *testing.T) {
	if !shouldAutoInstall(nil, false, false) {
		t.Error("скачанный exe должен ставиться сам")
	}
	if shouldAutoInstall(nil, true, false) || shouldAutoInstall([]string{"--Portable"}, false, false) || shouldAutoInstall(nil, false, true) {
		t.Error("установленная копия, --portable и отладка не ставят")
	}
}
