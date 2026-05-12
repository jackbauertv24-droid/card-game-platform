#!/bin/bash
#
# Card Game Platform - Logs Script
# View backend or frontend logs
#

# Get absolute path to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_LOG="/tmp/cardgame-backend.log"
FRONTEND_LOG="/tmp/cardgame-web.log"

usage() {
    echo "Usage: $SCRIPT_DIR/logs.sh [backend|frontend|all] [lines]"
    echo ""
    echo "Arguments:"
    echo "  backend   - Show backend logs"
    echo "  frontend  - Show frontend logs"
    echo "  all       - Show both logs (default)"
    echo "  lines     - Number of lines to show (default: 50)"
    echo ""
    echo "Examples:"
    echo "  $SCRIPT_DIR/logs.sh backend 100"
    echo "  $SCRIPT_DIR/logs.sh frontend"
    echo "  $SCRIPT_DIR/logs.sh all 20"
    exit 1
}

# Parse arguments
service="${1:-all}"
lines="${2:-50}"

if [ "$service" != "backend" ] && [ "$service" != "frontend" ] && [ "$service" != "all" ]; then
    usage
fi

show_logs() {
    local log_file="$1"
    local service_name="$2"
    
    echo "=== $service_name (last $lines lines) ==="
    
    if [ ! -f "$log_file" ]; then
        echo "No log file found: $log_file"
        return
    fi
    
    tail -n "$lines" "$log_file"
    echo ""
}

case "$service" in
    backend)
        show_logs "$BACKEND_LOG" "Backend"
        ;;
    frontend)
        show_logs "$FRONTEND_LOG" "Frontend"
        ;;
    all)
        show_logs "$BACKEND_LOG" "Backend"
        show_logs "$FRONTEND_LOG" "Frontend"
        ;;
esac