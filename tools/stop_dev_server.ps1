# Stop Galaxytool Dev Server and MySQL
Write-Host "Stopping Galaxytool development processes..." -ForegroundColor Cyan

Get-Process -Name php, mysqld -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "localhost:8080" -or $_.Path -match "xampp\\mysql"
} | ForEach-Object {
    Write-Host "Stopping process: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Yellow
    Stop-Process -Id $_.Id -Force
}

Write-Host "Done. Development server stopped." -ForegroundColor Green

