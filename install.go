package main

import (
	"path/filepath"
	"strings"
)

const (
	appDirName = "PCWidget"
	exeName    = "widget.exe"
)

// installDir — каталог установки внутри programFiles. Писать туда может только админ,
// поэтому задача планировщика с наивысшими правами не запускает подменяемый файл.
func installDir(programFiles string) string { return filepath.Join(programFiles, appDirName) }

// isInstalled: exe лежит в каталоге установки (имя файла не важно, регистр пути не важен).
func isInstalled(exe, programFiles string) bool {
	if programFiles == "" {
		return false
	}
	return strings.EqualFold(filepath.Clean(filepath.Dir(exe)), filepath.Clean(installDir(programFiles)))
}

// startMenuLink — ярлык в меню «Пуск» для всех пользователей.
func startMenuLink(programData string) string {
	return filepath.Join(programData, "Microsoft", "Windows", "Start Menu", "Programs", "PC Widget.lnk")
}

// shortcutScript — команда PowerShell, создающая ярлык. В одинарных кавычках всё буквально,
// кроме самой кавычки: её удваиваем.
func shortcutScript(link, target string) string {
	q := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	return "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(" + q(link) + ");" +
		"$s.TargetPath=" + q(target) + ";$s.Description='PC Widget';$s.Save()"
}

// shouldAutoInstall: запущенный не из папки установки exe ставит себя сам.
// --portable и отладка (PCWIDGET_DEBUG) запускают его на месте.
func shouldAutoInstall(args []string, installed, debug bool) bool {
	for _, a := range args {
		if strings.EqualFold(a, "--portable") {
			return false
		}
	}
	return !installed && !debug
}

// cliMode разбирает аргументы командной строки: "", "install" или "uninstall".
func cliMode(args []string) string {
	for _, a := range args {
		switch strings.ToLower(a) {
		case "--install":
			return "install"
		case "--uninstall":
			return "uninstall"
		}
	}
	return ""
}
