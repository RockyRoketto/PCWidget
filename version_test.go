package main

import (
	"os"
	"strings"
	"testing"
)

func TestVersionMatchesResources(t *testing.T) {
	b, err := os.ReadFile("winres/winres.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"file_version", "product_version"} {
		if !strings.Contains(string(b), `"`+key+`": "`+appVersion+`.0.0"`) {
			t.Errorf("winres.json: %s не совпадает с %s", key, appVersion)
		}
	}
	if !strings.Contains(string(b), `"ProductVersion": "`+appVersion+`"`) {
		t.Errorf("winres.json: нет ProductVersion %s", appVersion)
	}
}
