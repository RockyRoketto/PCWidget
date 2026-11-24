package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/windows"
)

// runHidden запускает программу без окна консоли и ждёт завершения.
func runHidden(name string, args ...string) error {
	c := exec.Command(name, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	return c.Run()
}

func schtasks(args ...string) error { return runHidden("schtasks.exe", args...) }

func isElevated() bool { return windows.GetCurrentProcessToken().IsElevated() }

func taskExists() bool { return schtasks("/Query", "/TN", taskName) == nil }

func currentUser() string {
	u := os.Getenv("USERNAME")
	if d := os.Getenv("USERDOMAIN"); d != "" {
		return d + `\` + u
	}
	return u
}

// createTask создаёт (или перезаписывает) задачу автозапуска для exe. Права всегда наивысшие:
// создавать её можно только из установленной копии (см. syncAutostart), а у неё админский манифест.
func createTask(exe string) bool {
	f, err := os.CreateTemp("", "pcwidget-task-*.xml")
	if err != nil {
		return false
	}
	defer os.Remove(f.Name())
	_, err = f.Write(utf16BOM(taskXML(currentUser(), exe, true)))
	f.Close()
	if err != nil {
		return false
	}
	return schtasks("/Create", "/TN", taskName, "/XML", f.Name(), "/F") == nil
}

func deleteTask() {
	if taskExists() {
		_ = schtasks("/Delete", "/TN", taskName, "/F")
	}
}

func selfExe() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exe, _ = filepath.Abs(exe)
	return exe
}

func installed() bool { return isInstalled(selfExe(), os.Getenv("ProgramFiles")) }

// syncAutostart приводит задачу планировщика в соответствие с настройкой. Вызывается при старте и из меню.
// Портативная копия (не из каталога установки) задачу не трогает: иначе админская задача
// запускала бы exe из папки, куда может писать любая программа.
func syncAutostart() {
	if !installed() {
		return
	}
	exe := selfExe()
	if !app.settings.autostartEnabled() {
		deleteTask()
		app.settings.AutostartKey = ""
		app.settings.save()
		return
	}
	if app.settings.AutostartKey == exe && taskExists() {
		return
	}
	if createTask(exe) {
		app.settings.AutostartKey = exe
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
