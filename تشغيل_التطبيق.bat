@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo تشغيل دليل أسعار المجمع الكهربائي...
echo.
echo افتح من نفس الكمبيوتر:
echo http://127.0.0.1:5180/
echo.
echo وللهاتف استخدم IP الكمبيوتر مع نفس المنفذ 5180.
echo مثال:
echo http://192.168.1.10:5180/
echo.
python server.py
pause
