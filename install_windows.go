package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const idYes = 6

const uninstallKey = `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PCWidget`

func msgBox(text string, flags uint32) int32 {
	r, _ := windows.MessageBox(0, windows.StringToUTF16Ptr(text), windows.StringToUTF16Ptr("PC Widget"), flags)
	return r
}

// relaunchElevated перезапускает этот exe с аргументом и запросом UAC.
func relaunchElevated(arg string) bool {
	exe := selfExe()
	err := windows.ShellExecute(0, windows.StringToUTF16Ptr("runas"), windows.StringToUTF16Ptr(exe),
		windows.StringToUTF16Ptr(arg), windows.StringToUTF16Ptr(filepath.Dir(exe)), windows.SW_NORMAL)
	return err == nil
}

// startInstall запускается из меню: просит права и закрывает эту копию (поставит и запустит новая).
func startInstall() {
	if relaunchElevated("--install") {
		pDestroyWindow.Call(app.hwnd)
	}
}

func startUninstall() {
	if msgBox("Удалить PC Widget? Настройки и накопленный трафик останутся в профиле.", windows.MB_YESNO|windows.MB_ICONQUESTION) != idYes {
		return
	}
	if relaunchElevated("--uninstall") {
		pDestroyWindow.Call(app.hwnd)
	}
}

// killOthers закрывает все остальные копии widget.exe (работающую копию нельзя перезаписать).
func killOthers() {
	_ = runHidden("taskkill.exe", "/F", "/IM", exeName, "/FI", "PID ne "+strconv.Itoa(os.Getpid()))
	time.Sleep(700 * time.Millisecond)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err = out.Close(); err != nil {
		return err
	}
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}

// runInstall: запуск с --install. Копирует exe в Program Files, создаёт задачу автозапуска, запись для
// «Приложения и возможности» и запускает установленную копию.
func runInstall() {
	if !isElevated() {
		if !relaunchElevated("--install") {
			fatal("Для установки нужны права администратора.")
		}
		return
	}
	pf := os.Getenv("ProgramFiles")
	dir := installDir(pf)
	dst := filepath.Join(dir, exeName)
	src := selfExe()
	killOthers()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fatal("Не удалось создать " + dir + ": " + err.Error())
	}
	if filepath.Clean(src) != filepath.Clean(dst) {
		if err := copyFile(src, dst); err != nil {
			fatal("Не удалось скопировать файл: " + err.Error())
		}
	}
	writeUninstallEntry(dst)
	// Всё нужное ставится сразу: драйвер для температуры CPU (с согласием владельца), чтобы не искать его в меню.
	if !pawnInstalled() && askPawnIO() {
		if err := runPawnIOInstall(); err != nil {
			msgBox("Драйвер PawnIO поставить не удалось (нужен winget и интернет). "+
				"Позже это можно сделать из меню виджета.", windows.MB_OK|windows.MB_ICONWARNING)
		}
	}
	// Задачу создаёт сама установленная копия при старте (syncAutostart, с учётом настройки в меню).
	c := exec.Command(dst)
	c.Dir = dir
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.DETACHED_PROCESS}
	if err := c.Start(); err != nil {
		fatal("Установлено, но запустить не удалось: " + err.Error())
	}
}

func writeUninstallEntry(exe string) {
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, uninstallKey, registry.SET_VALUE)
	if err != nil {
		return
	}
	defer k.Close()
	_ = k.SetStringValue("DisplayName", "PC Widget")
	_ = k.SetStringValue("DisplayIcon", exe)
	_ = k.SetStringValue("InstallLocation", filepath.Dir(exe))
	_ = k.SetStringValue("UninstallString", fmt.Sprintf(`"%s" --uninstall`, exe))
	_ = k.SetDWordValue("NoModify", 1)
	_ = k.SetDWordValue("NoRepair", 1)
}

// runUninstall: запуск с --uninstall. Удаляет задачу, запись в реестре и (после выхода) папку установки.
func runUninstall() {
	if !isElevated() {
		if !relaunchElevated("--uninstall") {
			fatal("Для удаления нужны права администратора.")
		}
		return
	}
	killOthers()
	deleteTask()
	_ = registry.DeleteKey(registry.LOCAL_MACHINE, uninstallKey)
	msgBox("PC Widget удалён.", windows.MB_OK|windows.MB_ICONINFORMATION)
	dir := installDir(os.Getenv("ProgramFiles"))
	// Свой exe удалить нельзя, пока он работает: отдельный процесс подождёт выхода и сотрёт папку.
	c := exec.Command("cmd.exe")
	// CmdLine задаём целиком: Go иначе экранирует кавычки так, что cmd их не понимает.
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW,
		CmdLine: `cmd.exe /C ping -n 3 127.0.0.1 >nul & rmdir /S /Q "` + dir + `"`}
	_ = c.Start()
}
