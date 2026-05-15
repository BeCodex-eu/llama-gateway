$Root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$node  = (Get-Command node -ErrorAction Stop).Source
$procs = @()

function Test-Port([int]$Port) {
    try {
        $c  = [Net.Sockets.TcpClient]::new()
        $ok = $c.BeginConnect('127.0.0.1', $Port, $null, $null).AsyncWaitHandle.WaitOne(500)
        $c.Close()
        return $ok
    } catch { return $false }
}

Write-Host '[llama-gateway] starting...'

if (-not (Test-Port 11435)) {
    Write-Host '[llama-gateway] launching proxy on :11435'
    $env:OPEN_BROWSER = 'false'
    $tsNode = "`"$Root\proxy\node_modules\ts-node\dist\bin.js`""
    $procs += Start-Process $node -ArgumentList "$tsNode src/server.ts" `
        -WorkingDirectory "$Root\proxy" -NoNewWindow -PassThru
} else {
    Write-Host '[llama-gateway] proxy already running on :11435'
}

if (-not (Test-Port 5173)) {
    Write-Host '[llama-gateway] launching ui on :5173'
    $vite = "`"$Root\ui\node_modules\vite\bin\vite.js`""
    $procs += Start-Process $node -ArgumentList $vite `
        -WorkingDirectory "$Root\ui" -NoNewWindow -PassThru
} else {
    Write-Host '[llama-gateway] ui already running on :5173'
}

if ($procs.Count -eq 0) {
    Write-Host '[llama-gateway] all services already running.'
    exit 0
}

# Wait for UI, then open browser
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    try { Invoke-WebRequest -UseBasicParsing 'http://localhost:5173' -TimeoutSec 2 | Out-Null; break }
    catch { Start-Sleep -Milliseconds 500 }
}
Start-Process 'http://localhost:5173/quick-start'

Write-Host '[llama-gateway] services running. Press Ctrl+C to stop.'

try {
    while ($true) {
        if ($procs | Where-Object HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
} finally {
    foreach ($p in $procs) {
        if (-not $p.HasExited) { taskkill /PID $p.Id /T /F 2>$null }
    }
}
