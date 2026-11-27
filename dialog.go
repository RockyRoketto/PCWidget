package main

import (
	"encoding/binary"
	"fmt"
)

// Окна установки и обновления без WinAPI: тексты и раскладка структур TaskDialog.

// dlgButton — своя кнопка окна.
type dlgButton struct {
	id   int32
	text uintptr // указатель на строку UTF-16
}

// taskConfig — поля TASKDIALOGCONFIG, которыми пользуется виджет.
type taskConfig struct {
	flags                      uint32
	common                     uint32 // системные кнопки
	title, icon, head, content uintptr
	buttons                    uintptr // массив TASKDIALOG_BUTTON
	count                      uint32
	def                        int32
	callback                   uintptr
}

const (
	taskConfigSize = 160
	taskButtonSize = 12
)

// pack собирает структуру так, как её ждёт comctl32: в заголовках Windows она упакована
// по одному байту, поэтому обычная структура Go не подходит (64 бита).
func (c taskConfig) pack() []byte {
	b := make([]byte, taskConfigSize)
	u32 := func(at int, v uint32) { binary.LittleEndian.PutUint32(b[at:], v) }
	ptr := func(at int, v uintptr) { binary.LittleEndian.PutUint64(b[at:], uint64(v)) }
	u32(0, taskConfigSize)
	u32(20, c.flags)
	u32(24, c.common)
	ptr(28, c.title)
	ptr(36, c.icon)
	ptr(44, c.head)
	ptr(52, c.content)
	u32(60, c.count)
	ptr(64, c.buttons)
	u32(72, uint32(c.def))
	ptr(140, c.callback)
	return b
}

func packButtons(list []dlgButton) []byte {
	b := make([]byte, taskButtonSize*len(list))
	for i, x := range list {
		binary.LittleEndian.PutUint32(b[i*taskButtonSize:], uint32(x.id))
		binary.LittleEndian.PutUint64(b[i*taskButtonSize+4:], uint64(x.text))
	}
	return b
}

// installQuestion — что спросить у запустившего скачанный файл. old — стоящая версия ("" неизвестна),
// present — программа уже установлена.
func installQuestion(present bool, old, ver, dir string) (head, text, ok string) {
	switch {
	case !present:
		return "Установить PC Widget " + ver + "?",
			"Что произойдёт:\n" +
				"•  программа скопируется в " + dir + "\n" +
				"•  в меню «Пуск» появится ярлык PC Widget\n" +
				"•  виджет запустится и будет включаться вместе с Windows (это можно выключить в настройках)\n\n" +
				"Если Windows спросит разрешение на изменения, ответьте «Да».",
			"Установить"
	case old == ver:
		return "PC Widget " + ver + " уже установлен",
			"Установить его заново? Настройки сохранятся.", "Переустановить"
	default:
		from := ""
		if old != "" {
			from = " с " + old
		}
		return "Обновить PC Widget" + from + " до " + ver + "?",
			"Работающий виджет закроется и запустится уже новым. Настройки сохранятся.", "Обновить"
	}
}

// installDone — итог установки.
func installDone(fresh bool, ver string) (head, text string) {
	where := "Виджет уже на рабочем столе. Если его закрывают окна, сверните их (Win+D).\n" +
		"Настройки: щелчок правой кнопкой по виджету или по его значку возле часов."
	if fresh {
		return "PC Widget " + ver + " установлен", where + "\n\nСкачанный файл больше не нужен, его можно удалить."
	}
	return "PC Widget обновлён до " + ver, where
}

// downloadText — строка под полосой загрузки; total <= 0 — размер неизвестен.
func downloadText(done, total int64) string {
	mb := func(n int64) float64 { return float64(n) / (1 << 20) }
	if total <= 0 {
		return fmt.Sprintf("Скачано %.1f МБ", mb(done))
	}
	return fmt.Sprintf("Скачано %.1f из %.1f МБ", mb(done), mb(total))
}
