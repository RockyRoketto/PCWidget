package main

import (
	"errors"
	"fmt"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Минимальный доступ к WinRT без CGO: таблицы методов вызываются напрямую.
// Номера методов: 0–2 IUnknown, 3–5 IInspectable, свои с 6.

var (
	modCombase              = windows.NewLazySystemDLL("combase.dll")
	procRoInitialize        = modCombase.NewProc("RoInitialize")
	procRoGetActivationFact = modCombase.NewProc("RoGetActivationFactory")
	procWindowsCreateString = modCombase.NewProc("WindowsCreateString")
	procWindowsDeleteString = modCombase.NewProc("WindowsDeleteString")
	procWindowsGetStringBuf = modCombase.NewProc("WindowsGetStringRawBuffer")
	modShcore               = windows.NewLazySystemDLL("shcore.dll")
	procCreateStreamOverRAS = modShcore.NewProc("CreateStreamOverRandomAccessStream")
	iidAsyncInfo            = windows.GUID{Data1: 0x00000036, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidIStream              = windows.GUID{Data1: 0x0000000C, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	errAsyncTimeout         = errors.New("winrt: async timeout")
)

// rtObj — указатель на объект COM/WinRT.
type rtObj struct{ vt *[64]uintptr }

func (o *rtObj) call(slot int, args ...uintptr) error {
	a := append([]uintptr{uintptr(unsafe.Pointer(o))}, args...)
	r, _, _ := syscall.SyscallN(o.vt[slot], a...)
	if int32(r) < 0 {
		return fmt.Errorf("winrt: hr 0x%08X", uint32(r))
	}
	return nil
}

func (o *rtObj) release() {
	if o != nil {
		syscall.SyscallN(o.vt[2], uintptr(unsafe.Pointer(o)))
	}
}

func (o *rtObj) qi(iid *windows.GUID) (*rtObj, error) {
	var out *rtObj
	if err := o.call(0, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out))); err != nil {
		return nil, err
	}
	return out, nil
}

// obj вызывает метод без аргументов, который возвращает объект (может быть nil).
func (o *rtObj) obj(slot int, args ...uintptr) (*rtObj, error) {
	var out *rtObj
	err := o.call(slot, append(args, uintptr(unsafe.Pointer(&out)))...)
	return out, err
}

func (o *rtObj) str(slot int) string {
	var h uintptr
	if o.call(slot, uintptr(unsafe.Pointer(&h))) != nil {
		return ""
	}
	return takeHString(h)
}

func (o *rtObj) i64(slot int) int64 {
	var v int64
	o.call(slot, uintptr(unsafe.Pointer(&v)))
	return v
}

func (o *rtObj) u32(slot int) uint32 {
	var v uint32
	o.call(slot, uintptr(unsafe.Pointer(&v)))
	return v
}

func (o *rtObj) flag(slot int) bool {
	var v byte
	o.call(slot, uintptr(unsafe.Pointer(&v)))
	return v != 0
}

func (o *rtObj) f64(slot int) float64 {
	var v float64
	o.call(slot, uintptr(unsafe.Pointer(&v)))
	return v
}

func newHString(s string) (uintptr, error) {
	u, err := windows.UTF16FromString(s)
	if err != nil {
		return 0, err
	}
	var h uintptr
	r, _, _ := procWindowsCreateString.Call(uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(&h)))
	if int32(r) < 0 {
		return 0, fmt.Errorf("WindowsCreateString 0x%08X", uint32(r))
	}
	return h, nil
}

// takeHString читает строку и освобождает её.
func takeHString(h uintptr) string {
	if h == 0 {
		return ""
	}
	var n uint32
	p, _, _ := procWindowsGetStringBuf.Call(h, uintptr(unsafe.Pointer(&n)))
	s := ""
	if p != 0 && n > 0 {
		s = windows.UTF16ToString(unsafe.Slice((*uint16)(unsafe.Pointer(p)), n))
	}
	procWindowsDeleteString.Call(h)
	return s
}

// rtInit готовит поток к WinRT (многопоточная модель). Поток должен быть закреплён.
func rtInit() error {
	if err := modCombase.Load(); err != nil {
		return err
	}
	r, _, _ := procRoInitialize.Call(1)
	if int32(r) < 0 && uint32(r) != 0x80010106 { // RPC_E_CHANGED_MODE: уже есть другая модель
		return fmt.Errorf("RoInitialize 0x%08X", uint32(r))
	}
	return nil
}

func rtFactory(class string, iid *windows.GUID) (*rtObj, error) {
	h, err := newHString(class)
	if err != nil {
		return nil, err
	}
	defer procWindowsDeleteString.Call(h)
	var out *rtObj
	r, _, _ := procRoGetActivationFact.Call(h, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out)))
	if int32(r) < 0 {
		return nil, fmt.Errorf("RoGetActivationFactory 0x%08X", uint32(r))
	}
	return out, nil
}

// await ждёт IAsyncOperation<T> и кладёт результат GetResults в out.
// Вместо обработчика завершения опрашивается состояние: операции короткие.
func await(op *rtObj, out unsafe.Pointer, limit time.Duration) error {
	defer op.release()
	info, err := op.qi(&iidAsyncInfo)
	if err != nil {
		return err
	}
	defer info.release()
	end := time.Now().Add(limit)
	wait := time.Millisecond
	for {
		st := info.u32(7) // 0 идёт, 1 готово, 2 отменено, 3 ошибка
		if st == 1 {
			break
		}
		if st > 1 {
			return fmt.Errorf("winrt: async status %d", st)
		}
		if time.Now().After(end) {
			info.call(9) // Cancel
			return errAsyncTimeout
		}
		time.Sleep(wait)
		if wait < 16*time.Millisecond {
			wait *= 2
		}
	}
	return op.call(8, uintptr(out))
}

func awaitObj(op *rtObj, limit time.Duration) (*rtObj, error) {
	var out *rtObj
	err := await(op, unsafe.Pointer(&out), limit)
	return out, err
}

// readAllRAS читает поток WinRT (IRandomAccessStream) целиком, не больше max байт.
func readAllRAS(ras *rtObj, size uint64, max int) ([]byte, error) {
	if size == 0 || size > uint64(max) {
		return nil, fmt.Errorf("winrt: stream size %d", size)
	}
	var st *rtObj
	r, _, _ := procCreateStreamOverRAS.Call(uintptr(unsafe.Pointer(ras)), uintptr(unsafe.Pointer(&iidIStream)), uintptr(unsafe.Pointer(&st)))
	if int32(r) < 0 || st == nil {
		return nil, fmt.Errorf("CreateStreamOverRandomAccessStream 0x%08X", uint32(r))
	}
	defer st.release()
	buf := make([]byte, size)
	got := 0
	for got < len(buf) {
		var n uint32
		r, _, _ := syscall.SyscallN(st.vt[3], uintptr(unsafe.Pointer(st)), uintptr(unsafe.Pointer(&buf[got])), uintptr(len(buf)-got), uintptr(unsafe.Pointer(&n)))
		if int32(r) < 0 {
			return nil, fmt.Errorf("IStream.Read 0x%08X", uint32(r))
		}
		if n == 0 {
			break
		}
		got += int(n)
	}
	return buf[:got], nil
}
