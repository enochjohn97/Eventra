function Probe($u) {
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        return "HTTP $($r.StatusCode)"
    } catch {
        if ($_.Exception -is [System.Net.WebException] -and $_.Exception.Response) {
            return "HTTP ([int]$_.Exception.Response.StatusCode)"
        }
        return "ERR"
    }
}

Write-Host "=== candidates for the served public/ folder ==="
$candidates = @(
    (Join-Path $PWD "public"),
    "C:\xampp\htdocs\eventra\public",
    "C:\xampp\htdocs\public",
    "C:\wamp64\www\public",
    "C:\Users\9ine\Documents\Eventra\public",
    "$env:LOCALAPPDATA\eventra\public",
    "${env:USERPROFILE}\Documents\Eventra\public",
    "${env:USERPROFILE}\eventra\public"
)
foreach ($c in $candidates) {
    $exists = Test-Path $c
    $asset  = (Join-Path $c "assets\brand\logo-mark.png")
    $missing = (Join-Path $c "assets\event_assets\event_6acf8d40d666d.jpg")
    Write-Host "candidate: $c"
    Write-Host "  exists? $exists"
    Write-Host "  logo-mark.png on disk? $(Test-Path $asset)"
    Write-Host "  event_6acf8d40d666d.jpg on disk? $(Test-Path $missing)"
}

Write-Host ""
Write-Host "=== server response for known-good vs missing assets ==="
Write-Host "logo-mark.png   -> $(Probe 'http://localhost:8000/public/assets/brand/logo-mark.png')"
Write-Host "event jpg       -> $(Probe 'http://localhost:8000/public/assets/event_assets/event_6acf8d40d666d.jpg')"
