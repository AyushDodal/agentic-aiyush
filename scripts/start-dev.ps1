param([int]$ApiPort = 8000, [int]$WebPort = 5173)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localDirectory = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $localDirectory -Force | Out-Null

function Find-AvailablePort([int]$start) {
    for ($candidate = $start; $candidate -lt $start + 100; $candidate++) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
        try {
            $listener.Start()
            return $candidate
        } catch [System.Net.Sockets.SocketException] {
            continue
        } finally {
            $listener.Stop()
        }
    }
    throw 'No available development port was found.'
}

$ApiPort = Find-AvailablePort $ApiPort
$WebPort = Find-AvailablePort $WebPort
if ($WebPort -eq $ApiPort) { $WebPort = Find-AvailablePort ($WebPort + 1) }
$pythonPath = Join-Path $projectRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Run python -m venv .venv and install backend/requirements-dev.txt first.' }
$nodePath = (Get-Command node.exe).Source
$vitePath = Join-Path $projectRoot 'node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $vitePath)) { throw 'Run npm install first.' }

$apiProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', $ApiPort) -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localDirectory 'api.log') -RedirectStandardError (Join-Path $localDirectory 'api-error.log')
$previousProxy = $env:API_PROXY_TARGET
try {
    $env:API_PROXY_TARGET = "http://127.0.0.1:$ApiPort"
    $webProcess = Start-Process -FilePath $nodePath -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', $WebPort, '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localDirectory 'web.log') -RedirectStandardError (Join-Path $localDirectory 'web-error.log')
} finally {
    $env:API_PROXY_TARGET = $previousProxy
}
Write-Output "Frontend: http://127.0.0.1:$WebPort (PID $($webProcess.Id))"
Write-Output "Backend:  http://127.0.0.1:$ApiPort (PID $($apiProcess.Id))"
Write-Output "Logs:     $localDirectory"
Write-Output "Stop:     Stop-Process -Id $($webProcess.Id),$($apiProcess.Id)"
