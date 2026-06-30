@echo off
cd /d "%~dp0android"
echo Compilando APK de release, esto puede tardar varios minutos...
call gradlew.bat assembleRelease --no-daemon
echo.
echo ============================================
echo Listo. Si no hay errores arriba, el APK esta en:
echo android\app\build\outputs\apk\release\app-release.apk
echo ============================================
pause
