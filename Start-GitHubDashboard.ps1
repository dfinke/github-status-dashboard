# Start-GithubDashboard.ps1
param (
    [string]$Repository = "",
    [switch]$NoDefaultBrowser = $false
)

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Join-Path $scriptPath "index.html"

if (-not (Test-Path $indexPath)) {
    Write-Error "Dashboard files not found. Make sure you're running this script from the correct directory."
    exit 1
}

$indexFullPath = (Resolve-Path $indexPath).Path
$dashboardUrl = "file:///$($indexFullPath.Replace('\', '/'))"

Write-Host "Starting GitHub Dashboard..." -ForegroundColor Cyan
Write-Host "Dashboard URL: $dashboardUrl" -ForegroundColor Yellow

if (-not $NoDefaultBrowser) {
    Write-Host "Opening in default browser..."
    Start-Process $dashboardUrl
}

Write-Host "Dashboard is ready to use!" -ForegroundColor Green
Write-Host "To access it manually, open this file in your browser: $indexPath" -ForegroundColor Gray
