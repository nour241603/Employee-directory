@echo off
title Deploy (Organization Structure)
cd /d "%~dp0"

rem Owner: Nouran. Creates the Organization Structure service in Floci.
rem Find Docker, Node.js and Git even if this window started before they were installed.
set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%ProgramFiles%\Docker\Docker\resources\bin;%ProgramFiles%\nodejs;%ProgramFiles%\Git\bin;%ProgramFiles%\Amazon\AWSCLIV2;%PATH%"
set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" (
  echo Git Bash was not found at "%BASH%". Install Git for Windows, then run this again.
  pause
  exit /b 1
)

echo.
echo === Deploying: Organization Structure
echo Creates in Floci: DynamoDB Departments and Roles, IAM role, Lambda empdir-organization-api, CloudWatch Logs, API routes
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

echo --- Creating the Organization Structure service
"%BASH%" -c "source infra/_lib.sh && check_floci && rm -f backend/lambda.zip && build_zip && bash infra/organization-service.sh"
if errorlevel 1 (
  echo.
  echo Something failed. Take a screenshot of this window and send it to Claude.
  pause
  exit /b 1
)

echo.
echo Done. Opening Floci's console: look under Serverless, DynamoDB, Identity and CloudWatch Logs.
start "" "http://localhost:4500"
pause
