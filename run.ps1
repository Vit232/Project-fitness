# Starts RepLog. First run creates the virtual environment and installs dependencies.
# Usage:  .\run.ps1            (http://localhost:8000, also reachable from your phone on the same Wi-Fi)
#         .\run.ps1 -Port 9000
param([int]$Port = 8000)

Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) {
    $py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    if (-not (Test-Path $py)) { $py = "python" }
    & $py -m venv .venv
    .\.venv\Scripts\python.exe -m pip install --disable-pip-version-check -r requirements.txt
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "  RepLog is starting"
Write-Host "  On this PC:     http://localhost:$Port"
if ($ip) { Write-Host "  On your phone:  http://${ip}:$Port   (same Wi-Fi)" }
Write-Host "  Demo login:     demo@replog.app / demo1234"
Write-Host ""

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port $Port
