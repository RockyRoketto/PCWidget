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
	// В свойствах exe всегда четыре числа: «1.3» -> «1.3.0.0», «1.3.1» -> «1.3.1.0».
	full := appVersion + strings.Repeat(".0", 3-strings.Count(appVersion, "."))
	for _, key := range []string{"file_version", "product_version"} {
		if !strings.Contains(string(b), `"`+key+`": "`+full+`"`) {
			t.Errorf("winres.json: %s не совпадает с %s", key, appVersion)
		}
	}
	if !strings.Contains(string(b), `"ProductVersion": "`+appVersion+`"`) {
		t.Errorf("winres.json: нет ProductVersion %s", appVersion)
	}
}
