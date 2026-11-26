package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"golang.org/x/sys/windows"
)

func main() {
	runtime.LockOSThread() // окно и WebView живут в этом потоке
	setDPIAware()
	// Рабочий каталог (задача планировщика ставит папку установки) не должен наследоваться WebView2:
	// его процессы переживают виджет и мешали бы удалению папки.
	_ = os.Chdir(os.TempDir())

	switch cliMode(os.Args[1:]) {
	case "install":
		runInstall()
		return
	case "uninstall":
		runUninstall()
		return
	}
	// Скачанный exe сразу ставится в Program Files и запускается оттуда.
	if shouldAutoInstall(os.Args[1:], installed(), os.Getenv("PCWIDGET_DEBUG") != "") {
		autoInstall()
		return
	}
	if !singleInstance() {
		return
	}
	page, err := buildPage()
	if err != nil {
		fatal("Ошибка сборки интерфейса: " + err.Error())
	}
	if !createUI(loadSettings(), page) {
		fatal("Не удалось создать окно. Нужен WebView2 Runtime (на Windows 11 он есть всегда):\nhttps://developer.microsoft.com/microsoft-edge/webview2/")
	}
	go syncAutostart()
	go cleanUpdate()
	go updater.run()
	col := newCollector()
	go statsLoop(col)
	runLoop()
	col.close()
}

// statsLoop раз в секунду собирает показатели и отдаёт странице.
// PCWIDGET_DUMP=<файл> (отладка) дополнительно пишет последний снимок в файл.
func statsLoop(col *collector) {
	dump := os.Getenv("PCWIDGET_DUMP")
	for range time.Tick(time.Second) {
		b, err := json.Marshal(col.collect())
		if err != nil {
			continue
		}
		pushStats(string(b))
		if dump != "" {
			_ = os.WriteFile(dump, b, 0o644)
		}
	}
}

// singleInstance: второй экземпляр просто завершается.
func singleInstance() bool {
	_, err := windows.CreateMutex(nil, false, windows.StringToUTF16Ptr(`Local\pcwidget-single-instance`))
	return err != windows.ERROR_ALREADY_EXISTS
}

func fatal(text string) {
	windows.MessageBox(0, windows.StringToUTF16Ptr(text), windows.StringToUTF16Ptr("PC Widget"), windows.MB_OK|windows.MB_ICONERROR)
	os.Exit(1)
}

// logf пишет в лог только при PCWIDGET_DEBUG=1 (в %TEMP%, без личных данных).
func logf(format string, a ...any) {
	if os.Getenv("PCWIDGET_DEBUG") == "" {
		return
	}
	f, err := os.OpenFile(filepath.Join(os.TempDir(), "pcwidget-debug.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, time.Now().Format("15:04:05 ")+format+"\n", a...)
}
