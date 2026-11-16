@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 --version >nul 2>nul
  if not errorlevel 1 goto use_py
)
where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; assert sys.version_info.major == 3" >nul 2>nul
  if not errorlevel 1 goto use_python
)
echo Python 3 is required. Install it from https://www.python.org/downloads/
echo Then double-click RUN_TEST_WINDOWS.bat again.
pause
exit /b 1
:use_py
start "" http://127.0.0.1:8765/
echo Keep this window open. Press Ctrl+C to stop.
py -3 -m http.server 8765 --bind 127.0.0.1
pause
exit /b
:use_python
start "" http://127.0.0.1:8765/
echo Keep this window open. Press Ctrl+C to stop.
python -m http.server 8765 --bind 127.0.0.1
pause
