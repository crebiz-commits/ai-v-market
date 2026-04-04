@echo off
cd /d "E:\ai_market"
echo [AI Market] 개발 서버를 시작하는 중입니다...
echo.
echo 이미 서버가 실행 중이라면 새 브라우저 창만 열립니다.

:: Check if port 5173 is already in use
netstat -ano | findstr :5173 > nul
if %errorlevel% equ 0 (
    echo 서버가 이미 실행 중인 것 같습니다. 브라우저를 엽니다...
) else (
    echo 서버를 새로 시작합니다...
    start cmd /k "title AI-Market-Server && npm run dev"
    timeout /t 5 > nul
)

start "" "http://localhost:5173"
exit
