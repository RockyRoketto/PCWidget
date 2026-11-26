# Third-party components / Сторонние компоненты

PC Widget itself is MIT-licensed (see [LICENSE](LICENSE)). The components below keep their own licenses.
Сам виджет распространяется по MIT, у компонентов ниже свои лицензии.

## Compiled into widget.exe / Входят в exe

| Component | Copyright | License |
|---|---|---|
| [go-webview2](https://github.com/wailsapp/go-webview2) | © 2020 John Chadwick, portions © 2017 Serge Zaitsev | [MIT](https://github.com/wailsapp/go-webview2/blob/main/LICENSE) |
| [go-winloader](https://github.com/jchv/go-winloader) | © 2021 John Chadwick | [ISC](https://github.com/jchv/go-winloader/blob/master/LICENSE.md) |
| [golang.org/x/sys](https://pkg.go.dev/golang.org/x/sys), Go runtime | © The Go Authors | [BSD-3-Clause](https://go.dev/LICENSE) |

## Sensor libraries embedded as an archive / Библиотеки датчиков (вшиты архивом)

Unmodified binaries from the official LibreHardwareMonitor v0.9.6 release, downloaded by `scripts/fetch-lhm.ps1`.
Их исходный код доступен по ссылкам.

| Component | License |
|---|---|
| [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/tree/v0.9.6) | [MPL-2.0](https://www.mozilla.org/MPL/2.0/) |
| [DiskInfoToolkit](https://github.com/Blacktempel/DiskInfoToolkit), © Florian K. | MPL-2.0 |
| [RAMSPDToolkit](https://github.com/Blacktempel/RAMSPDToolkit), © Florian K. | MPL-2.0 |
| [BlackSharp.Core](https://github.com/Blacktempel/BlackSharp), © Florian K. | MPL-2.0 |
| [HidSharp](https://github.com/IntergatedCircuits/HidSharp), © 2010-2025 James F. Bellinger | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| `System.*`, `Microsoft.Bcl.*` ([.NET](https://github.com/dotnet/runtime)), © .NET Foundation and Contributors | [MIT](https://github.com/dotnet/runtime/blob/main/LICENSE.TXT) |

## Not distributed / Не распространяется вместе с виджетом

[PawnIO](https://github.com/namazso/PawnIO) driver (GPL-2.0): installed separately through `winget`, only with the user's consent.
Драйвер ставится отдельно через `winget` и только с согласия пользователя.
