@echo off
title Kocaeli Universitesi Hemodiyaliz Unitesi - Flask Sunucusu
chcp 65001 >nul

:: FLASH BELLEK UYUMLU GÖRECELİ (RELATIVE) DİZİN GEÇİŞİ
cd /d "%~dp0"

echo ======================================================================
echo   HEMODIYALIZ UNITESI - OTOMATIK IP FLASK SUNUCUSU BASLATILIYOR...
echo ======================================================================
echo.

:: Python komutunu dinamik tespit et
set "PY_CMD=python"
where python >nul 2>nul
if %errorlevel% neq 0 (
    where py >nul 2>nul
    if %errorlevel% equ 0 (
        set "PY_CMD=py"
    ) else (
        where python3 >nul 2>nul
        if %errorlevel% equ 0 (
            set "PY_CMD=python3"
        )
    )
)

:: Python Flask sunucusunu arka planda / penceresiz baslat
start "Hemodiyaliz_Flask_Server" /b %PY_CMD% app.py

:: Sunucunun ayaga kalkmasi icin bekleme (404 hatasini onler)
timeout /t 3 /nobreak >nul

:: Tarayicida ekranlari ac
start http://localhost:5000/sekreter.html
timeout /t 1 /nobreak >nul
start http://localhost:5000/display.html

echo.
echo [BILGI] Flask Sunucusu Calisiyor! Port: 5000
echo Cihaz veya modem IP'si degisse bile otomatik baglanir.
echo.
exit
