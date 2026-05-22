# TestPad start script
# Run: .\start.ps1

Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "   TestPad" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "[ERROR] Node.js ne ustanovlen!" -ForegroundColor Red
    Write-Host "Skachayte s: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
$nodeVer = & node --version
Write-Host "[OK] Node.js: $nodeVer" -ForegroundColor Green

# Check .env
$envFile = Join-Path $PSScriptRoot "backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item "$PSScriptRoot\backend\.env.example" $envFile
    Write-Host "[OK] Sozdan fayl .env" -ForegroundColor Green
}

$envContent = Get-Content $envFile -Raw
if ($envContent -match "your-openai-api-key-here") {
    Write-Host ""
    Write-Host "[!] Dobavte OPENAI_API_KEY v backend\.env" -ForegroundColor Yellow
    Write-Host "    https://platform.openai.com/api-keys" -ForegroundColor Yellow
    Write-Host ""
}

# Install backend
Write-Host "Ustanovka zavisimostey backend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend"
npm install --silent
Write-Host "[OK] Backend gotov" -ForegroundColor Green

# Install frontend
Write-Host "Ustanovka zavisimostey frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\frontend"
npm install --silent
Write-Host "[OK] Frontend gotov" -ForegroundColor Green

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==============================" -ForegroundColor Green
Write-Host "  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Admin: admin@testpad.com / admin123" -ForegroundColor Cyan
Write-Host "  Ctrl+C - ostanovit" -ForegroundColor Gray
Write-Host "==============================" -ForegroundColor Green
Write-Host ""

# Start backend
$backend = Start-Process -FilePath "node" `
    -ArgumentList "src/index.js" `
    -WorkingDirectory "$PSScriptRoot\backend" `
    -PassThru -NoNewWindow

Start-Sleep -Seconds 2

# Start frontend
$frontend = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory "$PSScriptRoot\frontend" `
    -PassThru -NoNewWindow

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host "Servery zapushcheny. Zhdu..." -ForegroundColor Green

try {
    Wait-Process -Id $backend.Id -ErrorAction SilentlyContinue
} finally {
    if ($backend -and -not $backend.HasExited) { $backend.Kill() }
    if ($frontend -and -not $frontend.HasExited) { $frontend.Kill() }
    Write-Host "Ostanovleno." -ForegroundColor Gray
}
