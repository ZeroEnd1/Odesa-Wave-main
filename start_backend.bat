@echo off
echo ========================================
echo    Odesa Wave - Запуск Backend
echo ========================================
echo.

cd /d "%~dp0backend"

REM Перевірка .env файлу
if not exist .env (
    echo [!] Файл .env не знайдено!
    echo [*] Копіюю .env.example в .env...
    copy .env.example .env
    echo [!] Відредагуйте backend\.env та додайте MONGO_URL
    echo.
)

REM Перевірка віртуального середовища
if exist venv\Scripts\activate.bat (
    echo [*] Активую віртуальне середовище...
    call venv\Scripts\activate.bat
) else (
    echo [!] Віртуальне середовище не знайдено
    echo [*] Використовую глобальний Python
)

echo [*] Запускаю сервер на http://localhost:8001
echo [*] Документація API: http://localhost:8001/docs
echo.
python run.py

pause