@echo off
echo Stopping Galaxytool development server and MySQL...
powershell -ExecutionPolicy Bypass -File "%~dp0stop_dev_server.ps1"
pause

