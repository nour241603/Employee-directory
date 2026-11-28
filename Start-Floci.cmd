@echo off
title Employee Directory - start Floci and deploy
cd /d "%~dp0"

rem Make sure Docker, Node.js and Git are found even if this window started before they were installed.
set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%ProgramFiles%\Docker\Docker\resources\bin;%ProgramFiles%\nodejs;%ProgramFiles%\Git\bin;%ProgramFiles%\Amazon\AWSCLIV2;%PATH%"

set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" (
  echo Git Bash was not found at "%BASH%". Install Git for Windows, then run this again.
  pause
  exit /b 1
)

echo.
echo === 1/3  Checking Docker Desktop (it must say "Engine running")
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Open Docker Desktop, wait for "Engine running", then run this again.
  pause
  exit /b 1
)

echo.
echo === 2/3  Starting Floci on http://localhost:4566
docker compose -f infra/floci/docker-compose.yml up -d
if errorlevel 1 (
  echo Floci did not start. See the message above.
  pause
  exit /b 1
)
timeout /t 8 /nobreak >nul

echo.
echo === 3/3  Deploying the Employee Directory (takes a few minutes the first time)
"%BASH%" infra/deploy.sh

echo.
echo Opening Floci Dash and the website...
start "" "http://localhost:4566/_floci/ui"
start "" "http://localhost:4566/empdir-web/index.html"
echo.
echo Demo login: salma.nabil@example.com / password123
pause
