#!/bin/bash

# Keep-Alive Script for Instagram API
# Pings the health endpoint every 13 minutes to keep Render service awake

HEALTH_URL=${HEALTH_URL:-"http://localhost:3000/health"}
INTERVAL_MINUTES=${INTERVAL_MINUTES:-13}
LOG_PREFIX="🔄 [KEEP-ALIVE]"

echo "$LOG_PREFIX Starting keep-alive service..."
echo "$LOG_PREFIX Target URL: $HEALTH_URL"
echo "$LOG_PREFIX Ping interval: $INTERVAL_MINUTES minutes"

# Function to ping health endpoint
ping_health_endpoint() {
    local start_time=$(date +%s%3N)
    
    if curl -s -f --max-time 30 -H "User-Agent: Keep-Alive-Script/1.0" "$HEALTH_URL" > /tmp/health_response.json 2>/dev/null; then
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        echo "$LOG_PREFIX ✅ Ping successful (${response_time}ms)"
        
        # Parse JSON response (requires jq)
        if command -v jq &> /dev/null; then
            local status=$(jq -r '.status' /tmp/health_response.json 2>/dev/null)
            local polling_active=$(jq -r '.polling.active' /tmp/health_response.json 2>/dev/null)
            local target=$(jq -r '.polling.target' /tmp/health_response.json 2>/dev/null)
            local database=$(jq -r '.database' /tmp/health_response.json 2>/dev/null)
            local uptime=$(jq -r '.uptime' /tmp/health_response.json 2>/dev/null)
            
            echo "   📊 Status: $status"
            echo "   🎯 Polling: $([ "$polling_active" = "true" ] && echo "Active" || echo "Inactive")"
            echo "   🎯 Target: @$target"
            echo "   💾 Database: $database"
            echo "   ⏰ Uptime: $((uptime / 60)) minutes"
        else
            echo "   📊 Response received (install jq for detailed parsing)"
        fi
    else
        echo "$LOG_PREFIX ❌ Ping failed"
        echo "   💡 Service might be starting up or unavailable"
    fi
    
    rm -f /tmp/health_response.json
}

# Function to schedule next ping
schedule_next_ping() {
    local next_ping=$(date -d "+$INTERVAL_MINUTES minutes" +"%H:%M:%S")
    echo "$LOG_PREFIX ⏰ Next ping scheduled for: $next_ping"
    
    sleep $((INTERVAL_MINUTES * 60))
    ping_health_endpoint
    schedule_next_ping
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n$LOG_PREFIX 🛑 Shutting down keep-alive service..."; exit 0' INT TERM

# Start the keep-alive service
echo "$LOG_PREFIX 🚀 Initial ping..."
ping_health_endpoint

echo "$LOG_PREFIX 📅 Scheduling regular pings..."
schedule_next_ping
