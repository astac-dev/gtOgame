@echo off
cd /d "%~dp0\.."
echo =====================================================
echo       Starting Galaxytool Development Server         
echo =====================================================
echo Host: http://localhost:8080
echo Document Root: %CD%
echo Press Ctrl+C to terminate the server.
echo.
php -S localhost:8080
pause

