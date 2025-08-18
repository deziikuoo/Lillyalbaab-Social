# Keep-Alive Script for Instagram API
# Pings the health endpoint every 13 minutes to keep Render service awake

param(
    [string]$HealthUrl = "http://localhost:3000/health",
    [int]$IntervalMinutes = 13
)

$LogPrefix = "🔄 [KEEP-ALIVE]"

Write-Host "$LogPrefix Starting keep-alive service..." -ForegroundColor Green
Write-Host "$LogPrefix Target URL: $HealthUrl" -ForegroundColor Cyan
Write-Host "$LogPrefix Ping interval: $IntervalMinutes minutes" -ForegroundColor Cyan

function Ping-HealthEndpoint {
    try {
        $startTime = Get-Date
        $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 30 -Headers @{
            "User-Agent" = "Keep-Alive-Script/1.0"
        }
        $endTime = Get-Date
        $responseTime = ($endTime - $startTime).TotalMilliseconds
        
        Write-Host "$LogPrefix ✅ Ping successful ($([math]::Round($responseTime))ms)" -ForegroundColor Green
        Write-Host "   📊 Status: $($response.status)" -ForegroundColor White
        Write-Host "   🎯 Polling: $($response.polling.active ? 'Active' : 'Inactive')" -ForegroundColor White
        Write-Host "   🎯 Target: @$($response.polling.target)" -ForegroundColor White
        Write-Host "   💾 Database: $($response.database)" -ForegroundColor White
        Write-Host "   ⏰ Uptime: $([math]::Floor($response.uptime / 60)) minutes" -ForegroundColor White
        
    } catch {
        Write-Host "$LogPrefix ❌ Ping failed: $($_.Exception.Message)" -ForegroundColor Red
        
        if ($_.Exception.Message -like "*connection refused*") {
            Write-Host "   💡 Service might be starting up..." -ForegroundColor Yellow
        } elseif ($_.Exception.Message -like "*timeout*") {
            Write-Host "   💡 Request timed out, service might be slow..." -ForegroundColor Yellow
        }
    }
}

function Schedule-NextPing {
    $now = Get-Date
    $nextPing = $now.AddMinutes($IntervalMinutes)
    
    Write-Host "$LogPrefix ⏰ Next ping scheduled for: $($nextPing.ToString('HH:mm:ss'))" -ForegroundColor Cyan
    
    Start-Sleep -Seconds ($IntervalMinutes * 60)
    Ping-HealthEndpoint
    Schedule-NextPing
}

# Handle Ctrl+C gracefully
Register-EngineEvent PowerShell.Exiting -Action {
    Write-Host "`n$LogPrefix 🛑 Shutting down keep-alive service..." -ForegroundColor Yellow
}

# Start the keep-alive service
Write-Host "$LogPrefix 🚀 Initial ping..." -ForegroundColor Green
Ping-HealthEndpoint

Write-Host "$LogPrefix 📅 Scheduling regular pings..." -ForegroundColor Green
Schedule-NextPing
