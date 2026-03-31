@echo off
echo ========================================
echo    Odesa Wave - Запуск Frontend
echo ========================================
echo.

cd /d "%~dp0frontend"

REM Перевірка .env файлу
if not exist .env (
    echo [!] Файл .env не знайдено!
    echo [*] Копіюю .env.example в .env...
    copy .env.example .env
)

REM Перевірка node_modules
if not exist node_modules (
    echo [*] Встановлюю залежності...
    call yarn install
)

echo.
echo [*] Запускаю Expo...
echo [*] Веб: http://localhost:8081
echo [*] Або скануйте QR-код в Expo Go
echo.
call yarn web

pause