@echo off
chcp 65001 >nul
title GitHub'a Proje Gonderici (sezenatmiss00)
color 0b

echo ============================================================
echo   KOCAELI UNIVERSITESI HEMODIYALIZ SISTEMI - GIT PUSH
echo ============================================================
echo.
echo Kullanici: sezenatmiss00
echo E-posta  : sezenatmiss@gmail.com
echo Hedef    : https://github.com/sezenatmiss00/sezen-diyaliz.git
echo.
echo [1/2] Degisiklikler kontrol ediliyor...
git add .
git commit -m "update: sezen diyaliz seans yonetim sistemi guncellemeleri" 2>nul

echo.
echo [2/2] GitHub'a gonderiliyor (main dali)...
echo (Tarayicinizda GitHub yetkilendirme penceresi acilirsa 'Sign in with your browser' butonuna basiniz)
echo.
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo [BASARILI] Proje GitHub hesabiniza basariyla yuklendi!
    echo Adres: https://github.com/sezenatmiss00/sezen-diyaliz
    echo ============================================================
) else (
    echo.
    echo ============================================================
    echo [BILGI / COZUM]:
    echo 1. https://github.com/new adresine gidip 'sezen-diyaliz' adinda
    echo    yeni bir bos repository actiginizdan emin olunuz.
    echo 2. Eger token ile gondermek isterseniz asagidaki komutu calistirabilirsiniz:
    echo    git push https://TOKEN@github.com/sezenatmiss00/sezen-diyaliz.git main
    echo ============================================================
)

echo.
pause

