#!/bin/bash
echo "========================================"
echo "   Odesa Wave - Запуск Frontend"
echo "========================================"
echo ""

cd "$(dirname "$0")/frontend"

# Перевірка .env файлу
if [ ! -f .env ]; then
    echo "[!] Файл .env не знайдено!"
    echo "[*] Копіюю .env.example в .env..."
    cp .env.example .env
fi

# Перевірка node_modules
if [ ! -d node_modules ]; then
    echo "[*] Встановлюю залежності..."
    yarn install
fi

echo ""
echo "[*] Запускаю Expo..."
echo "[*] Веб: http://localhost:8081"
echo "[*] Або скануйте QR-код в Expo Go"
echo ""
yarn web