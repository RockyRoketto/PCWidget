# Сборка и тесты. Печатает только ошибки и итог.
param([switch]$SkipTests)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:GOOS = 'windows'; $env:GOARCH = 'amd64'; $env:CGO_ENABLED = '0'

if (-not $SkipTests) {
    $t = go test ./... 2>&1
    if ($LASTEXITCODE -ne 0) { $t | Select-Object -First 40; Write-Host 'TESTS FAILED'; exit 1 }
}
# Иконка и манифест: go install github.com/tc-hib/go-winres@latest. Без go-winres exe соберётся без них.
if (Get-Command go-winres -ErrorAction SilentlyContinue) {
    go-winres make --in winres/winres.json --out rsrc --arch amd64 2>&1 | Out-Null
} else { Write-Host 'go-winres not found: icon and manifest skipped' }
New-Item -ItemType Directory -Force dist | Out-Null
$out = go build -trimpath -buildvcs=false -ldflags '-H=windowsgui -s -w' -o dist/widget.exe . 2>&1
if ($LASTEXITCODE -ne 0) { $out | Select-Object -First 40; Write-Host 'BUILD FAILED'; exit 1 }
Write-Host 'OK dist/widget.exe'
