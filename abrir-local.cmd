@echo off
rem Abre o Fiscal Shield na propria maquina, sem depender da rede.
rem
rem Duplo clique neste arquivo. Feche a janela preta para parar o servidor.
rem
rem Existe porque o site publicado fica atras da lista de IPs permitidos do
rem enterprise, que barra a saida de alguns nos do Zscaler. O site e estatico
rem e roda inteiro no navegador, entao local da exatamente o mesmo resultado.

setlocal enabledelayedexpansion
cd /d "%~dp0"
set PORTA=8000

rem --- 1) Node, que e o que o projeto ja usa nos testes
where node >nul 2>&1
if not errorlevel 1 (
  echo.
  echo   Abrindo http://localhost:%PORTA%
  echo.
  start "" "http://localhost:%PORTA%"
  node tools\servidor.js %PORTA%
  goto :fim
)

rem --- 2) Python, se for um de verdade.
rem O Windows traz atalhos "python" e "python3" que apenas abrem a Microsoft
rem Store e ainda assim devolvem sucesso, por isso nao basta testar errorlevel:
rem e preciso confirmar que a saida traz a versao.
for %%P in ("py -3" "python" "python3" "%USERPROFILE%\.lou\python\venv\Scripts\python.exe") do (
  for /f "tokens=1" %%V in ('%%~P --version 2^>^&1') do (
    if "%%V"=="Python" (
      echo.
      echo   Abrindo http://localhost:%PORTA%
      echo.
      start "" "http://localhost:%PORTA%"
      %%~P -m http.server %PORTA%
      goto :fim
    )
  )
)

echo.
echo   Nao encontrei Node nem Python nesta maquina.
echo.
echo   O site precisa de um servidor local: abrir o index.html direto do
echo   disco nao funciona, porque o navegador bloqueia a leitura dos dados.
echo.
echo   Peca ao time de TI a instalacao do Node.js, ou use o site publicado
echo   quando o acesso pela rede estiver liberado.
echo.
pause

:fim
endlocal
