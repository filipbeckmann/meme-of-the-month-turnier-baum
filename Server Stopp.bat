@echo off
setlocal enabledelayedexpansion
title Meme of the Month – Server Stopp
color 0C
cls

echo.
echo  ==============================================
echo   Meme of the Month  -  Server Stopp
echo  ==============================================
echo.

:: PID auf Port 3000 suchen (PowerShell - zuverlaessiger als netstat-Parsing)
for /f %%a in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess"') do (
    set "PID=%%a"
)

if not defined PID (
    :: Fallback: netstat direkt parsen
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /R "[:.]3000 " ^| findstr "LISTENING"') do (
        set "PID=%%a"
    )
)

if not defined PID (
    echo  Server laeuft nicht ^(Port 3000 ist frei^).
    echo.
    timeout /t 3 /nobreak >nul
    exit /b 0
)

echo  Server gefunden ^(PID: !PID!^) - wird gestoppt...
taskkill /F /PID !PID! >nul 2>&1

if !errorlevel! equ 0 (
    echo  Server erfolgreich gestoppt.
) else (
    echo  [FEHLER] Konnte Prozess nicht stoppen. Versuche ueber Node-Name...
    taskkill /F /IM node.exe >nul 2>&1
    if !errorlevel! equ 0 (
        echo  Server gestoppt.
    ) else (
        echo  Kein Node.js Prozess gefunden.
    )
)

echo.
timeout /t 3 /nobreak >nul
