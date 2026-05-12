#!/bin/bash
#
# Card Game Platform - Startup Script
# Starts backend and frontend servers in background
# PIDs are saved to /tmp/cardgame-*.pid for reliable shutdown
#

set -e

# Get absolute path to script directory (independent of starting folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# PID and log files
BACKEND_PID_FILE="/tmp/cardgame-backend.pid"
FRONTEND_PID_FILE="/tmp/cardgame-web.pid"
BACKEND_LOG="/tmp/cardgame-backend.log"
FRONTEND_LOG="/tmp/cardgame-web.log"

# Lock file to prevent multiple starts
LOCK_FILE="/tmp/cardgame-start.lock"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_ok() {
    echo "[OK] $1"
}

log_error() {
    echo "[ERROR] $1"
}

log_warn() {
    echo "[WARN] $1"
}

# Check if a process is running by PID file
is_running() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Clean up stale PID files
cleanup_stale_pid() {
    local pid_file="$1"
    local service_name="$2"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
            log_warn "Removing stale PID file for $service_name (PID $pid no longer exists)"
            rm -f "$pid_file"
        fi
    fi
}

# Start backend
start_backend() {
    log "Starting backend..."
    
    cleanup_stale_pid "$BACKEND_PID_FILE" "backend"
    
    if is_running "$BACKEND_PID_FILE"; then
        log_warn "Backend already running (PID $(cat $BACKEND_PID_FILE))"
        return 0
    fi
    
    cd "$PROJECT_ROOT/packages/api"
    
    # Clear previous log
    rm -f "$BACKEND_LOG"
    
    # Start backend with nohup (survives logoff)
    nohup node_modules/.bin/tsx src/index.ts > "$BACKEND_LOG" 2>&1 &
    local pid=$!
    
    # Disown to fully detach from shell
    disown $pid
    
    # Save PID
    echo "$pid" > "$BACKEND_PID_FILE"
    
    # Wait for backend to be ready
    log "Waiting for backend to start..."
    local max_wait=15
    local waited=0
    while [ $waited -lt $max_wait ]; do
        if curl -s --connect-timeout 1 http://localhost:4000/health > /dev/null 2>&1; then
            log_ok "Backend started (PID $pid)"
            log_ok "Backend health check passed"
            log_ok "Backend log: $BACKEND_LOG"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    
    # Check if process died during startup
    if ! kill -0 "$pid" 2>/dev/null; then
        log_error "Backend process died during startup"
        log_error "Check logs: $BACKEND_LOG"
        rm -f "$BACKEND_PID_FILE"
        return 1
    fi
    
    log_warn "Backend health check timeout (but process running)"
    log "Backend PID: $pid"
    log "Backend log: $BACKEND_LOG"
    return 0
}

# Start frontend
start_frontend() {
    log "Starting frontend..."
    
    cleanup_stale_pid "$FRONTEND_PID_FILE" "frontend"
    
    if is_running "$FRONTEND_PID_FILE"; then
        log_warn "Frontend already running (PID $(cat $FRONTEND_PID_FILE))"
        return 0
    fi
    
    cd "$PROJECT_ROOT/packages/web"
    
    # Clear previous log
    rm -f "$FRONTEND_LOG"
    
    # Start frontend with nohup (survives logoff)
    nohup node_modules/.bin/vite --host 0.0.0.0 --port 5173 > "$FRONTEND_LOG" 2>&1 &
    local pid=$!
    
    # Disown to fully detach from shell
    disown $pid
    
    # Save PID
    echo "$pid" > "$FRONTEND_PID_FILE"
    
    # Wait for frontend to be ready
    log "Waiting for frontend to start..."
    local max_wait=10
    local waited=0
    while [ $waited -lt $max_wait ]; do
        if curl -s --connect-timeout 1 http://localhost:5173 > /dev/null 2>&1; then
            log_ok "Frontend started (PID $pid)"
            log_ok "Frontend log: $FRONTEND_LOG"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    
    # Check if process died during startup
    if ! kill -0 "$pid" 2>/dev/null; then
        log_error "Frontend process died during startup"
        log_error "Check logs: $FRONTEND_LOG"
        rm -f "$FRONTEND_PID_FILE"
        return 1
    fi
    
    log_warn "Frontend health check timeout (but process running)"
    log "Frontend PID: $pid"
    log "Frontend log: $FRONTEND_LOG"
    return 0
}

# Main
main() {
    # Create lock file
    if [ -f "$LOCK_FILE" ]; then
        log_error "Another start operation in progress (lock file exists)"
        log "If this is stale, remove: $LOCK_FILE"
        exit 1
    fi
    echo "$$" > "$LOCK_FILE"
    
    log "============================================"
    log "Card Game Platform - Starting Services"
    log "============================================"
    log "Project root: $PROJECT_ROOT"
    log "Backend PID file: $BACKEND_PID_FILE"
    log "Frontend PID file: $FRONTEND_PID_FILE"
    log ""
    
    # Start backend
    if ! start_backend; then
        rm -f "$LOCK_FILE"
        log_error "Failed to start backend"
        exit 1
    fi
    
    log ""
    
    # Start frontend
    if ! start_frontend; then
        rm -f "$LOCK_FILE"
        log_error "Failed to start frontend"
        exit 1
    fi
    
    # Remove lock file
    rm -f "$LOCK_FILE"
    
    log ""
    log "============================================"
    log_ok "All services started successfully!"
    log "============================================"
    log ""
    log "Backend:  http://localhost:4000 (Network: http://10.4.0.9:4000)"
    log "Frontend: http://localhost:5173 (Network: http://10.4.0.9:5173)"
    log ""
    log "To stop:   $SCRIPT_DIR/stop.sh"
    log "To status: $SCRIPT_DIR/status.sh"
    log "To logs:   tail -f $BACKEND_LOG or $FRONTEND_LOG"
    log ""
}

main "$@"