#!/bin/bash
#
# Card Game Platform - Status Script
# Checks status of backend and frontend servers
#

# Get absolute path to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# PID files
BACKEND_PID_FILE="/tmp/cardgame-backend.pid"
FRONTEND_PID_FILE="/tmp/cardgame-web.pid"
BACKEND_LOG="/tmp/cardgame-backend.log"
FRONTEND_LOG="/tmp/cardgame-web.log"

# Check service status
check_service() {
    local pid_file="$1"
    local service_name="$2"
    local port="$3"
    local log_file="$4"
    
    echo "$service_name:"
    
    if [ ! -f "$pid_file" ]; then
        echo "  Status: STOPPED (no PID file)"
        echo "  PID:    N/A"
        return 1
    fi
    
    local pid=$(cat "$pid_file")
    
    if [ -z "$pid" ]; then
        echo "  Status: STOPPED (empty PID file)"
        echo "  PID:    N/A"
        return 1
    fi
    
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "  Status: STOPPED (process died)"
        echo "  PID:    $pid (stale)"
        return 1
    fi
    
    # Process running, check health endpoint
    local health_url="http://localhost:$port"
    if [ "$service_name" = "Backend" ]; then
        health_url="http://localhost:$port/health"
    fi
    
    if curl -s --connect-timeout 2 "$health_url" > /dev/null 2>&1; then
        echo "  Status: RUNNING (healthy)"
        echo "  PID:    $pid"
        echo "  URL:    http://localhost:$port"
        echo "  Net:    http://10.4.0.9:$port"
        echo "  Log:    $log_file"
        
        # Show last log line
        if [ -f "$log_file" ]; then
            local last_line=$(tail -1 "$log_file" 2>/dev/null)
            if [ -n "$last_line" ]; then
                echo "  Last:   $last_line"
            fi
        fi
        return 0
    else
        echo "  Status: RUNNING (unhealthy/not responding)"
        echo "  PID:    $pid"
        echo "  URL:    http://localhost:$port (not responding)"
        echo "  Log:    $log_file"
        return 2
    fi
}

# Main
echo "============================================"
echo "Card Game Platform - Service Status"
echo "============================================"
echo ""
echo "PID files:"
echo "  Backend:  $BACKEND_PID_FILE"
echo "  Frontend: $FRONTEND_PID_FILE"
echo ""
echo "Log files:"
echo "  Backend:  $BACKEND_LOG"
echo "  Frontend: $FRONTEND_LOG"
echo ""
echo "============================================"
echo ""

check_service "$BACKEND_PID_FILE" "Backend" "4000" "$BACKEND_LOG"
backend_status=$?

echo ""

check_service "$FRONTEND_PID_FILE" "Frontend" "5173" "$FRONTEND_LOG"
frontend_status=$?

echo ""
echo "============================================"

if [ $backend_status -eq 0 ] && [ $frontend_status -eq 0 ]; then
    echo "All services healthy"
    exit 0
elif [ $backend_status -eq 1 ] && [ $frontend_status -eq 1 ]; then
    echo "All services stopped"
    echo "Start with: $SCRIPT_DIR/start.sh"
    exit 1
else
    echo "Some services unhealthy"
    echo "Restart with: $SCRIPT_DIR/restart.sh"
    exit 2
fi