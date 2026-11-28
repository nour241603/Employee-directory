@echo off
title Employee Directory - public link
cd /d "%~dp0"
rem Gives the deployed app a public https address through a free Cloudflare quick tunnel.
rem Floci and Docker must already be running with the app deployed (Start-Floci.cmd).
rem The link goes through infra/public-proxy.js, which only lets the website and the API through.

set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%ProgramFiles%\Docker\Docker\resources\bin;%ProgramFiles%\nodejs;%ProgramFiles%\Git\bin;%PATH%"
set "BASH=%ProgramFiles%\Git\bin\bash.exe"

rem Find cloudflared: Downloads, Desktop, or installed.
set "CF="
for %%F in ("%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe" "%USERPROFILE%\Desktop\cloudflared-windows-amd64.exe" "%USERPROFILE%\Downloads\cloudflared.exe" "%USERPROFILE%\Desktop\cloudflared.exe") do (
  if exist %%F set "CF=%%~F"
)
if not defined CF (
  where cloudflared >nul 2>&1 && set "CF=cloudflared"
)
if not defined CF (
  echo cloudflared was not found in Downloads or on the Desktop.
  echo Download it from:
  echo   https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  echo and save it to Downloads, then run this again.
  pause
  exit /b 1
)

echo.
echo === 1/3  Checking that Floci is running
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Open Docker Desktop, wait for "Engine running", then run this again.
  pause
  exit /b 1
)

echo.
echo === 2/3  Uploading the website (relative API address, works through the link)
"%BASH%" infra/website.sh
if errorlevel 1 (
  echo The website upload failed. Is the app deployed? Run Start-Floci.cmd first.
  pause
  exit /b 1
)

echo.
echo === 3/3  Starting the safety filter and the public link
rem Stop any old link or old filter that may still be running (the old link exposed all of Floci).
taskkill /f /im cloudflared-windows-amd64.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Employee Directory - safety filter*" >nul 2>&1
docker rm -f empdir-public-filter >nul 2>&1

where node >nul 2>&1
if not errorlevel 1 (
  start "Employee Directory - safety filter" /min node infra/public-proxy.js
) else (
  echo Node.js not found on Windows - running the filter in Docker instead.
  docker run -d --rm --name empdir-public-filter -p 127.0.0.1:8088:8088 -v "%CD%\infra:/app:ro" -e PUBLIC_PROXY_BIND=0.0.0.0 -e FLOCI_HOST=host.docker.internal -e FLOCI_HOST_HEADER=localhost:4566 node:20-alpine node /app/public-proxy.js >nul
)

rem Wait until the filter answers, and refuse to start the link without it.
set "OK="
for /l %%i in (1,1,30) do (
  if not defined OK (
    curl -s -o nul http://127.0.0.1:8088/empdir-web/index.html && set "OK=1"
    if not defined OK timeout /t 1 /nobreak >nul
  )
)
if not defined OK (
  echo The safety filter did not start, so the public link was NOT opened.
  echo Take a screenshot of this window and send it to Claude.
  pause
  exit /b 1
)
echo Safety filter is running.
echo.
echo  In a few seconds a box appears with an address like
echo      https://some-random-words.trycloudflare.com
echo  Share that address as it is. It opens the website directly.
echo  Only the website and the API work through it; the Floci console and AWS are blocked.
echo.
echo  KEEP THIS WINDOW OPEN while people use the link. Closing it stops the link.
echo  If Windows asks about the firewall, click Allow.
echo.
"%CF%" tunnel --url http://127.0.0.1:8088
pause
