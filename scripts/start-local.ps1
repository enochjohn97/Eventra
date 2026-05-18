# Start Eventra locally (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Test-Path "vendor\autoload.php")) {
    Write-Host "Installing PHP dependencies (composer)..." -ForegroundColor Yellow
    composer install --no-interaction
}

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example — update DB credentials before testing." -ForegroundColor Yellow
    } else {
        Write-Host "Warning: no .env file. Copy .env.example to .env and configure the database." -ForegroundColor Yellow
    }
}

@("logs", "sessions", "public\assets\event_assets\qrcodes", "public\assets\event_assets\tickets") | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

Write-Host ""
Write-Host "Eventra local server: http://localhost:8000" -ForegroundColor Green
Write-Host "  Public site:  http://localhost:8000/public/pages/index.html"
Write-Host "  Client login: http://localhost:8000/client/pages/clientLogin.html"
Write-Host "  Admin login:  http://localhost:8000/admin/pages/adminLogin.html"
Write-Host ""
php -S localhost:8000 index.php
