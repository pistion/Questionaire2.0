@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "scripts\open-viewer.ps1"
