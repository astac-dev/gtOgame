# Galaxytool Local Development Server Launcher
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "      Starting Galaxytool Development Server         " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Host: http://localhost:8080" -ForegroundColor Green
Write-Host "Document Root: $projectRoot" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to terminate the server." -ForegroundColor Gray
Write-Host ""

Set-Location $projectRoot
php -S localhost:8080

