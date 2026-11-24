# Downloads the official LibreHardwareMonitor release and packs the needed DLLs into assets/lhm.zip
# (embedded into the exe at build time, never committed). Run once; build.ps1 calls it when the file is missing.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$ver = 'v0.9.6'
$url = "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/$ver/LibreHardwareMonitor.zip"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('lhm-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $zip = Join-Path $tmp 'lhm-release.zip'
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Write-Host ("sha256 " + (Get-FileHash $zip -Algorithm SHA256).Hash)
    $src = Join-Path $tmp 'src'
    Expand-Archive -Path $zip -DestinationPath $src
    $skip = 'Aga.Controls*', 'OxyPlot*', 'Microsoft.Win32.TaskScheduler*'
    $dlls = Get-ChildItem $src -Filter *.dll | Where-Object { $n = $_.Name; -not ($skip | Where-Object { $n -like $_ }) }
    if (-not ($dlls | Where-Object Name -eq 'LibreHardwareMonitorLib.dll')) { throw 'LibreHardwareMonitorLib.dll not found in release' }
    $out = Join-Path (Get-Location) 'assets\lhm.zip'
    if (Test-Path $out) { Remove-Item $out }
    Compress-Archive -Path $dlls.FullName -DestinationPath $out
    Write-Host ("OK assets/lhm.zip, " + $dlls.Count + " dlls")
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
