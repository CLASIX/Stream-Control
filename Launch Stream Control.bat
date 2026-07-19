@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ------------------------------------------------------------------
REM  Headless launcher.
REM
REM  Double-clicking this file relaunches itself completely hidden
REM  (no console window flashing on screen) and exits immediately.
REM  The real work happens in the hidden pass below, with all output
REM  going to launch-log.txt instead of a visible window.
REM
REM  If something actually fails (Node missing, build error, etc.),
REM  a small popup message box appears so you're not left guessing
REM  why the app didn't open.
REM ------------------------------------------------------------------

if "%~1"=="__hidden__" goto :run

powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%~f0' -ArgumentList '__hidden__' -WindowStyle Hidden" >nul 2>nul
exit /b 0

:run
set "LOG=%~dp0launch-log.txt"
if exist "%LOG%" del "%LOG%" >nul 2>nul
echo Launch started: %DATE% %TIME% > "%LOG%"

where node >nul 2>nul
if errorlevel 1 (
  call :showerror "Node.js is not installed. Install it from https://nodejs.org/ then try again."
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies for the first time... >> "%LOG%"
  REM --no-audit / --no-fund keep the log free of noisy security summaries.
  call npm install --no-audit --no-fund >> "%LOG%" 2>&1
  if errorlevel 1 (
    call :showerror "Dependency install failed. Check launch-log.txt in this folder for details."
    exit /b 1
  )
)

echo Building app... >> "%LOG%"
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 (
  call :showerror "Build failed. Check launch-log.txt in this folder for details."
  exit /b 1
)

echo Launching desktop app... >> "%LOG%"
call npx --yes electron . >> "%LOG%" 2>&1

exit /b 0

:showerror
powershell -NoProfile -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('%~1', 'Stream Control', 'OK', 'Error') | Out-Null" >nul 2>nul
goto :eof
