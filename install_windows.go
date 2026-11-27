package main

import (
	"context"
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
	if !askDialog("Удалить PC Widget?", "Настройки и накопленный трафик останутся в профиле.", "Удалить") {
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

// autoInstall: обычный запуск скачанного exe. Если уже стоит версия новее, запускаем её, а не откатываем.
func autoInstall() {
	dst := filepath.Join(installDir(os.Getenv("ProgramFiles")), exeName)
	if _, err := os.Stat(dst); err == nil && newerVersion(installedVersion(), appVersion) {
		startInstalled(dst)
		return
	}
	_, err := os.Stat(dst)
	head, text, ok := installQuestion(err == nil, installedVersion(), appVersion, filepath.Dir(dst))
	if askDialog(head, text, ok) {
		runInstall()
	}
}

// installedVersion — номер из записи «Приложения и возможности»; у 1.0 его нет.
func installedVersion() string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, uninstallKey, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, _ := k.GetStringValue("DisplayVersion")
	return v
}

func startInstalled(dst string) {
	c := exec.Command(dst)
	c.Dir = filepath.Dir(dst)
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.DETACHED_PROCESS}
	if err := c.Start(); err != nil {
		fatal("Установлено, но запустить не удалось: " + err.Error())
	}
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
	_, statErr := os.Stat(dst)
	fresh := statErr != nil // при обновлении про драйвер повторно не спрашиваем
	err := progressDialog(installTitle(fresh), "Подготовка…", false, func(_ context.Context, p *progress) error {
		p.say("Закрываю работающий виджет…")
		killOthers()
		p.say("Копирую файлы в " + dir + "…")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("не удалось создать %s: %w", dir, err)
		}
		if filepath.Clean(src) != filepath.Clean(dst) {
			if err := copyFile(src, dst); err != nil {
				return fmt.Errorf("не удалось скопировать файл: %w", err)
			}
		}
		p.say("Добавляю в меню «Пуск» и список программ…")
		writeUninstallEntry(dst)
		if err := runHidden("powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
			shortcutScript(startMenuLink(os.Getenv("ProgramData")), dst)); err != nil {
			logf("ярлык в меню «Пуск»: %v", err) // без ярлыка виджет всё равно работает
		}
		return nil
	})
	if err != nil {
		fatal("Установить не получилось: " + err.Error())
	}
	// Всё нужное ставится сразу: драйвер для температуры CPU (с согласием владельца), чтобы не искать его в меню.
	if fresh && !pawnInstalled() && askPawnIO() {
		err := progressDialog("Ставлю драйвер PawnIO", "Скачивание и установка через winget, это может занять пару минут…", false,
			func(context.Context, *progress) error { return runPawnIOInstall() })
		if err != nil {
			msgBox("Драйвер PawnIO поставить не удалось (нужен winget и интернет). "+
				"Позже это можно сделать из меню виджета.", windows.MB_OK|windows.MB_ICONWARNING|mbFront)
		}
	}
	// Задачу создаёт сама установленная копия при старте (syncAutostart, с учётом настройки в меню).
	startInstalled(dst)
	infoDialog(installDone(fresh, appVersion))
}

func installTitle(fresh bool) string {
	if fresh {
		return "Устанавливаю PC Widget " + appVersion
	}
	return "Обновляю PC Widget до " + appVersion
}

func writeUninstallEntry(exe string) {
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, uninstallKey, registry.SET_VALUE)
	if err != nil {
		return
	}
	defer k.Close()
	_ = k.SetStringValue("DisplayName", "PC Widget")
	_ = k.SetStringValue("DisplayIcon", exe)
	_ = k.SetStringValue("DisplayVersion", appVersion)
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
	_ = os.Remove(startMenuLink(os.Getenv("ProgramData")))
	_ = removeClaudeMod(claudeDir())
	_ = registry.DeleteKey(registry.LOCAL_MACHINE, uninstallKey)
	infoDialog("PC Widget удалён", "Настройки остались в профиле.")
	dir := installDir(os.Getenv("ProgramFiles"))
	// Свой exe удалить нельзя, пока он работает: отдельный процесс подождёт выхода и сотрёт папку.
	c := exec.Command("cmd.exe")
	// CmdLine задаём целиком: Go иначе экранирует кавычки так, что cmd их не понимает.
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW,
		CmdLine: `cmd.exe /C ping -n 3 127.0.0.1 >nul & rmdir /S /Q "` + dir + `"`}
	_ = c.Start()
}
