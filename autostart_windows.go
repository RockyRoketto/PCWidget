package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/windows"
)

// schtasks запускает schtasks.exe без окна консоли.
func schtasks(args ...string) error {
	c := exec.Command("schtasks.exe", args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	return c.Run()
}

func isElevated() bool { return windows.GetCurrentProcessToken().IsElevated() }

func taskExists() bool { return schtasks("/Query", "/TN", taskName) == nil }

func currentUser() string {
	u := os.Getenv("USERNAME")
	if d := os.Getenv("USERDOMAIN"); d != "" {
		return d + `\` + u
	}
	return u
}

// createTask создаёт (или перезаписывает) задачу автозапуска для exe.
func createTask(exe string, admin bool) bool {
	f, err := os.CreateTemp("", "pcwidget-task-*.xml")
	if err != nil {
		return false
	}
	defer os.Remove(f.Name())
	_, err = f.Write(utf16BOM(taskXML(currentUser(), exe, admin)))
	f.Close()
	if err != nil {
		return false
	}
	return schtasks("/Create", "/TN", taskName, "/XML", f.Name(), "/F") == nil
}

// syncAutostart приводит задачу планировщика в соответствие с настройкой. Вызывается при старте и из меню.
func syncAutostart() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	exe, _ = filepath.Abs(exe)
	if !app.settings.autostartEnabled() {
		if taskExists() {
			_ = schtasks("/Delete", "/TN", taskName, "/F")
		}
		app.settings.AutostartKey = ""
		app.settings.save()
		return
	}
	admin := isElevated()
	key := autostartKey(exe, admin)
	if app.settings.AutostartKey == key && taskExists() {
		return
	}
	if createTask(exe, admin) {
		app.settings.AutostartKey = key
	} else {
		app.settings.AutostartKey = ""
	}
	app.settings.save()
}

// setAutostart переключает автозапуск из меню.
func setAutostart(on bool) {
	app.settings.Autostart = &on
	app.settings.AutostartKey = ""
	app.settings.save()
	go syncAutostart()
}
