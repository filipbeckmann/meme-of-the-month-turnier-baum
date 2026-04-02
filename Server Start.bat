@echo off
title Meme of the Month – Server
color 0D
cls

echo.
echo  ==============================================
echo   Meme of the Month  –  Server Start
echo  ==============================================
echo.

cd /d "%~dp0"

:: Node.js pruefen
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [FEHLER] Node.js wurde nicht gefunden!
    echo  Bitte installiere Node.js von https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Abhaengigkeiten installieren falls noetig
if not exist "node_modules" (
    echo  Installiere Abhaengigkeiten ^(einmalig^)...
    npm install
    echo.
)

:: Pruefen ob Server bereits laeuft
netstat -aon 2>nul | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo  [HINWEIS] Port 3000 ist bereits belegt.
    echo  Der Server lauft moeglicherweise schon.
    echo.
    start http://localhost:3000
    pause
    exit /b 0
)

:: Browser nach kurzem Delay oeffnen
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

echo  Server laeuft auf:
echo    http://localhost:3000          ^(Abstimmung^)
echo    http://localhost:3000/admin.html  ^(Admin^)
echo.
echo  Admin-Passwort: filip47574
echo.
echo  Zum Beenden dieses Fenster schliessen
echo  oder "Server Stopp.bat" ausfuehren.
echo  ------------------------------------------------
echo.

node server.js

echo.
echo  Server wurde beendet.
pause >nul
