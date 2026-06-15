@echo off
cd /d "%~dp0"
if not exist .venv (
  python -m venv .venv
  call .venv\Scripts\activate.bat
  pip install -r requirements.txt -q
) else (
  call .venv\Scripts\activate.bat
  pip install -r requirements.txt -q
)
python agent.py
