package main

import (
	"context"
	"runtime"
	"sync"
	"sync/atomic"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Окна установки и обновления: системный TaskDialog (нужен манифест с общими элементами v6).
// Окно всегда выходит поверх остальных: виджет не активируется, и обычное сообщение пряталось
// бы под программами. Без TaskDialog остаётся простое сообщение.

var (
	pTaskDialogIndirect = lazyDLL("comctl32.dll").NewProc("TaskDialogIndirect")
	pSendMessage        = user32.NewProc("SendMessageW")
)

const (
	tdfUseIcon      = 0x0002
	tdfCancellable  = 0x0008
	tdfProgress     = 0x0200
	tdfSizeToFit    = 0x01000000
	tdbfOK          = 0x01
	tdbfCancel      = 0x08
	tdnCreated      = 0
	tdnClicked      = 2
	tdmClickButton  = 0x400 + 102
	tdmSetMarquee   = 0x400 + 103
	tdmProgressPos  = 0x400 + 106
	tdmMarqueeRun   = 0x400 + 107
	tdmSetText      = 0x400 + 108
	tdmEnableButton = 0x400 + 111
	tdeContent      = 0
	idOK            = 1
	idCancel        = 2
	idAccept        = 100
	mbFront         = 0x00010000 | 0x00040000 // MB_SETFOREGROUND | MB_TOPMOST
)

// dlgOpen: окно уже на экране (второй щелчок по значку не открывает ещё одно).
var dlgOpen atomic.Int32

var (
	dlgMu    sync.Mutex
	dlgHooks = map[uintptr]func(hwnd, msg, wp uintptr) uintptr{} // по номеру потока окна
	dlgProc  = windows.NewCallback(func(hwnd, msg, wp, lp, ref uintptr) uintptr {
		dlgMu.Lock()
		f := dlgHooks[uintptr(windows.GetCurrentThreadId())]
		dlgMu.Unlock()
		if f == nil {
			return 0
		}
		return f(hwnd, msg, wp)
	})
)

// showTask показывает окно и ждёт его закрытия. Возвращает номер нажатой кнопки.
func showTask(head, text string, flags, common uint32, accept string, hook func(hwnd, msg, wp uintptr) uintptr) (int, bool) {
	if pTaskDialogIndirect.Find() != nil {
		return 0, false
	}
	runtime.LockOSThread() // окно и его обратные вызовы живут в одном потоке
	defer runtime.UnlockOSThread()
	var pin runtime.Pinner
	defer pin.Unpin()
	str := func(s string) uintptr {
		p := utf16(s)
		pin.Pin(p)
		return uintptr(unsafe.Pointer(p))
	}
	c := taskConfig{flags: flags | tdfSizeToFit, common: common, title: str("PC Widget"), head: str(head), content: str(text), callback: dlgProc}
	if ico := appIcon(); ico != 0 {
		c.flags |= tdfUseIcon
		c.icon = ico
	}
	if accept != "" {
		b := packButtons([]dlgButton{{id: idAccept, text: str(accept)}})
		pin.Pin(&b[0])
		c.buttons, c.count, c.def = uintptr(unsafe.Pointer(&b[0])), 1, idAccept
	}
	tid := uintptr(windows.GetCurrentThreadId())
	dlgMu.Lock()
	prev := dlgHooks[tid]
	dlgHooks[tid] = func(hwnd, msg, wp uintptr) uintptr {
		if msg == tdnCreated {
			pSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize)
			forceForeground(hwnd)
		}
		if hook != nil {
			return hook(hwnd, msg, wp)
		}
		return 0
	}
	dlgMu.Unlock()
	defer func() {
		dlgMu.Lock()
		dlgHooks[tid] = prev
		dlgMu.Unlock()
	}()
	dlgOpen.Add(1)
	defer dlgOpen.Add(-1)
	cfg := c.pack()
	pin.Pin(&cfg[0])
	var pressed int32
	pin.Pin(&pressed)
	hr, _, _ := pTaskDialogIndirect.Call(uintptr(unsafe.Pointer(&cfg[0])), uintptr(unsafe.Pointer(&pressed)), 0, 0)
	if hr != 0 {
		logf("TaskDialog: %#x", hr)
		return 0, false
	}
	return int(pressed), true
}

// askDialog спрашивает согласие: кнопка действия и «Отмена».
func askDialog(head, text, accept string) bool {
	if id, ok := showTask(head, text, tdfCancellable, tdbfCancel, accept, nil); ok {
		return id == idAccept
	}
	return msgBox(head+"\n\n"+text, windows.MB_YESNO|windows.MB_ICONQUESTION|mbFront) == idYes
}

// infoDialog сообщает итог.
func infoDialog(head, text string) {
	if _, ok := showTask(head, text, tdfCancellable, tdbfOK, "", nil); !ok {
		msgBox(head+"\n\n"+text, windows.MB_OK|windows.MB_ICONINFORMATION|mbFront)
	}
}

// progress — как работа сообщает окну о ходе дела.
type progress struct {
	hwnd    uintptr // 0 — окна нет
	running bool    // полоса показывает проценты, а не «бегущую» отметку
}

// say меняет строку над полосой.
func (p *progress) say(text string) {
	if p.hwnd == 0 {
		return
	}
	s := utf16(text)
	pSendMessage.Call(p.hwnd, tdmSetText, tdeContent, uintptr(unsafe.Pointer(s)))
	runtime.KeepAlive(s)
}

// percent переводит полосу в режим процентов.
func (p *progress) percent(v int) {
	if p.hwnd == 0 {
		return
	}
	if !p.running {
		p.running = true
		pSendMessage.Call(p.hwnd, tdmSetMarquee, 0, 0)
	}
	pSendMessage.Call(p.hwnd, tdmProgressPos, uintptr(v), 0)
}

// progressDialog показывает окно с полосой, пока идёт work, и закрывает его сам.
// cancellable: «Отмена» закрывает окно и отменяет ctx; иначе кнопка выключена.
func progressDialog(head, text string, cancellable bool, work func(ctx context.Context, p *progress) error) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	var finished atomic.Bool
	started := false
	var flags uint32 = tdfProgress
	if cancellable {
		flags |= tdfCancellable
	}
	showTask(head, text, flags, tdbfCancel, "", func(hwnd, msg, wp uintptr) uintptr {
		switch msg {
		case tdnCreated:
			started = true
			pSendMessage.Call(hwnd, tdmSetMarquee, 1, 0)
			pSendMessage.Call(hwnd, tdmMarqueeRun, 1, 0)
			if !cancellable {
				pSendMessage.Call(hwnd, tdmEnableButton, idCancel, 0)
			}
			go func() {
				err := work(ctx, &progress{hwnd: hwnd})
				finished.Store(true)
				result <- err
				pSendMessage.Call(hwnd, tdmEnableButton, idCancel, 1)
				pPostMessage.Call(hwnd, tdmClickButton, idCancel, 0)
			}()
		case tdnClicked:
			if finished.Load() {
				return 0
			}
			if !cancellable {
				return 1 // не закрывать
			}
			cancel()
		}
		return 0
	})
	if !started { // окна нет: работаем молча
		return work(ctx, &progress{})
	}
	return <-result
}
