#!/bin/bash
echo "========================================"
echo "   Odesa Wave - Запуск Backend"
echo "========================================"
echo ""

cd "$(dirname "$0")/backend"

# Перевірка .env файлу
if [ ! -f .env ]; then
    echo "[!] Файл .env не знайдено!"
    echo "[*] Копіюю .env.example в .env..."
    cp .env.example .env
    echo "[!] Відредагуйте backend/.env та додайте MONGO_URL"
    echo ""
fi

# Активація віртуального середовища якщо є
if [ -f venv/bin/activate ]; then
    echo "[*] Активую віртуальне середовище..."
    source venv/bin/activate
fi

echo "[*] Запускаю сервер на http://localhost:8001"
echo "[*] Документація API: http://localhost:8001/docs"
echo ""
python run.py