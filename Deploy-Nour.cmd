@echo off
title Deploy Nour's services (Search and Directory, API Gateway, website)
cd /d "%~dp0"

rem Find Docker, Node.js and Git even if this window started before they were installed.
set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%ProgramFiles%\Docker\Docker\resources\bin;%ProgramFiles%\nodejs;%ProgramFiles%\Git\bin;%ProgramFiles%\Amazon\AWSCLIV2;%PATH%"
set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" (
  echo Git Bash was not found at "%BASH%". Install Git for Windows, then run this again.
  pause
  exit /b 1
)

echo.
echo === Nour: Search and Directory, API Gateway, website
echo Creates in Floci: API Gateway, IAM role, Lambda empdir-directory-api, API routes, S3 website
echo.
echo --- Checking Docker Desktop (it must say "Engine running")
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Open Docker Desktop, wait for "Engine running", then run this again.
  pause
  exit /b 1
)

echo --- Starting Floci on http://localhost:4566
docker compose -f infra/floci/docker-compose.yml up -d
if errorlevel 1 (
  echo Floci did not start. See the message above.
  pause
  exit /b 1
)
timeout /t 8 /nobreak >nul

echo --- Creating Nour's services
"%BASH%" -c "source infra/_lib.sh && check_floci && rm -f backend/lambda.zip && bash infra/nour-api-gateway.sh && build_zip && bash infra/nour-directory.sh && bash infra/nour-website.sh"
if errorlevel 1 (
  echo.
  echo Something failed. Take a screenshot of this window and send it to Claude.
  pause
  exit /b 1
)

echo.
echo Done. Opening Floci's console: look under API Gateway, Serverless, Identity and Storage.
start "" "http://localhost:4500"
pause
