$pid = 10264
Write-Host "=== process $pid ==="
$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "Name      : $($proc.ProcessName)"
    Write-Host "Path      : $($proc.Path)"
    Write-Host "StartTime : $($proc.StartTime)"
    $cmd = Get-CimInstance Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.CommandLine) {
        Write-Host "CommandLine : $($cmd.CommandLine)"
    }
} else {
    Write-Host "cannot open process $pid (access denied or exited)"
}

Write-Host ""
Write-Host "=== HTTP probes on localhost:8000 ==="
function Probe($u) {
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Host "GET $u => $($r.StatusCode) content-type=$($r.ContentType)"
    } catch {
        $raw = $_.Exception.Message
        if ($_.Exception -is [System.Net.WebException] -and $_.Exception.Response) {
            $s = [int]($_.Exception.Response).StatusCode
            Write-Host "GET $u => HTTP $s"
        } else {
            Write-Host "GET $u => ERROR: $raw"
        }
    }
}
Probe "http://localhost:8000/"
Probe "http://localhost:8000/public/"
Probe "http://localhost:8000/public/assets/event_assets/event_6acf8d40d666d.jpg"
Probe "http://localhost:8000/public/assets/brand/logo-mark.png"
