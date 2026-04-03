#!/usr/bin/env python3
"""Скрипт для запуску бекенду Odesa Wave"""
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import uvicorn

if __name__ == "__main__":
    print("Запуск Odesa Wave Backend...")
    print("API доступний на: http://localhost:8001")
    print("Документація: http://localhost:8001/docs")
    print("\nНатисніть Ctrl+C для зупинки\n")
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )
