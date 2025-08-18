@echo off
cd server
call venv\Scripts\activate.bat
uvicorn main:app --reload --host 127.0.0.1 --port 8000 