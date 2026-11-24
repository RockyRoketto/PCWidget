package main

import (
	"bytes"
	"encoding/xml"
	"path/filepath"
	u16 "unicode/utf16"
)

// taskName — имя задачи планировщика.
const taskName = "PCWidget"

// taskXML собирает определение задачи «при входе пользователя».
// user — «DOMAIN\name», exe — полный путь, admin — запускать с наивысшими правами.
// Параметры Settings важны: без них планировщик не стартует задачу на батарее и убивает её через 72 часа.
func taskXML(user, exe string, admin bool) string {
	esc := func(s string) string {
		var b bytes.Buffer
		_ = xml.EscapeText(&b, []byte(s))
		return b.String()
	}
	level := "LeastPrivilege"
	if admin {
		level = "HighestAvailable"
	}
	return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>PC Widget</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>` + esc(user) + `</UserId><Delay>PT5S</Delay></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author"><UserId>` + esc(user) + `</UserId><LogonType>InteractiveToken</LogonType><RunLevel>` + level + `</RunLevel></Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec><Command>` + esc(exe) + `</Command><WorkingDirectory>` + esc(filepath.Dir(exe)) + `</WorkingDirectory></Exec>
  </Actions>
</Task>
`
}

// utf16BOM кодирует строку в UTF-16 LE с BOM: другой кодировки schtasks /XML не принимает.
func utf16BOM(s string) []byte {
	u := u16.Encode([]rune(s))
	b := make([]byte, 2, 2+len(u)*2)
	b[0], b[1] = 0xFF, 0xFE
	for _, c := range u {
		b = append(b, byte(c), byte(c>>8))
	}
	return b
}

// autostartKey описывает, с чем создана задача. Изменился путь или уровень прав — задачу пересоздаём.
func autostartKey(exe string, admin bool) string {
	if admin {
		return exe + "|admin"
	}
	return exe + "|user"
}

// autostartEnabled: по умолчанию автозапуск включён (поле не задано).
func (s Settings) autostartEnabled() bool { return s.Autostart == nil || *s.Autostart }
