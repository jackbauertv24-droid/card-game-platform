#!/bin/bash
#
# Card Game Platform - Stop Script
# Stops backend and frontend servers using saved PIDs
#

set -e

# Get absolute path to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# PID files
BACKEND_PID_FILE="/tmp/cardgame-backend.pid"
FRONTEND_PID_FILE="/tmp/cardgame-web.pid"
LOCK_FILE="/tmp/cardgame-stop.lock"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_success() {
    echo "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo "${YELLOW}[WARN]${NC} $1"
}

# Stop a service by PID file
stop_service() {
    local pid_file="$1"
    local service_name="$2"
    local graceful_timeout=5
    local force_timeout=3
    
    if [ ! -f "$pid_file" ]; then
        log_warn "No PID file found for $service_name ($pid_file)"
        return 0
    fi
    
    local pid=$(cat "$pid_file")
    
    if [ -z "$pid" ]; then
        log_warn "Empty PID file for $service_name"
        rm -f "$pid_file"
        return 0
    fi
    
    if ! kill -0 "$pid" 2>/dev/null; then
        log_warn "$service_name process (PID $pid) not running - cleaning up"
        rm -f "$pid_file"
        return 0
    fi
    
    log "Stopping $service_name (PID $pid)..."
    
    # Send SIGTERM for graceful shutdown
    kill -TERM "$pid" 2>/dev/null || true
    
    # Wait for graceful shutdown
    local waited=0
    while [ $waited -lt $graceful_timeout ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            log_success "$service_name stopped gracefully (PID $pid)"
            rm -f "$pid_file"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    
    # Process still running - send SIGKILL
    log_warn "$service_name did not stop gracefully, sending SIGKILL..."
    kill -KILL "$pid" 2>/dev/null || true
    
    # Wait for force kill
    waited=0
    while [ $waited -lt $force_timeout ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            log_success "$service_name stopped forcefully (PID $pid)"
            rm -f "$pid_file"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    
    # Still running? Something is wrong
    if kill -0 "$pid" 2>/dev/null; then
        log_error "Failed to stop $service_name (PID $pid)"
        log_error "Manual intervention required: kill -9 $pid"
        return 1
    fi
    
    rm -f "$pid_file"
    return 0
}

# Main
main() {
    # Create lock file
    if [ -f "$LOCK_FILE" ]; then
        log_error "Another stop operation in progress"
        log "If stale, remove: $LOCK_FILE"
        exit 1
    fi
    echo "$$" > "$LOCK_FILE"
    
    log "============================================"
    log "Card Game Platform - Stopping Services"
    log "============================================"
    log ""
    
    # Stop frontend first (less critical)
    stop_service "$FRONTEND_PID_FILE" "Frontend"
    
    log ""
    
    # Stop backend
    stop_service "$BACKEND_PID_FILE" "Backend"
    
    # Remove lock file
    rm -f "$LOCK_FILE"
    
    log ""
    log "============================================"
    log_success "All services stopped"
    log "============================================"
    log ""
    log "To restart: $SCRIPT_DIR/start.sh"
    log ""
}

main "$@"