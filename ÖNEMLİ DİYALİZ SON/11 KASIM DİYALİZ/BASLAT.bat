@echo off
title Kocaeli Universitesi Hemodiyaliz Unitesi
chcp 65001 >nul

:: FLASH BELLEK UYUMLU GÖRECELİ (RELATIVE) DİZİN GEÇİŞİ
cd /d "%~dp0"

echo ======================================================================
echo   KOCAELI UNIVERSITESI HEMODIYALIZ UNITESI - SISTEM BASLATILIYOR...
echo ======================================================================
echo.
echo [BILGI] Çalisma Dizini: %~dp0
echo.

:: Eger proje alt klasordeyse dinamik olarak o klasore gec
if exist "%~dp011 KASIM DİYALİZ\app.py" (
    cd /d "%~dp011 KASIM DİYALİZ"
)

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
        ) else (
            echo [HATA] Sistemde Python bulunamadi!
            echo Lutfen bu bilgisayarda Python'in yuklu ve PATH ortam degiskenine ekli oldugundan emin olunuz.
            pause
            exit /b 1
        )
    )
)

echo Python bulundu: %PY_CMD%
echo Flask Web & REST API Sunucusu baslatiliyor...

:: Python Flask sunucusunu arka planda / penceresiz baslat
start "Hemodiyaliz_Flask_Server" /b %PY_CMD% app.py

:: Sunucunun ayaga kalkmasi ve portun acilmasi icin bekleme (404 hatasini onler)
echo Sunucu hazirlaniyor, lutfen bekleyiniz...
timeout /t 3 /nobreak >nul

:: Tarayicida Sekreter ve TV Display ekranlarini ac
echo Tarayici ekranlari aciliyor...
start http://localhost:5000/sekreter.html
timeout /t 1 /nobreak >nul
start http://localhost:5000/display.html

echo.
echo ======================================================================
echo   [BASARILI] Hemodiyaliz Sistemi Calisiyor! Port: 5000
echo   Flash bellek surucu harfi degisse bile sistem sorunsuz calisir.
echo ======================================================================
echo.
exit

