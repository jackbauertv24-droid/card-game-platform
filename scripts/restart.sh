#!/bin/bash
#
# Card Game Platform - Restart Script
# Stops then starts all services
#

set -e

# Get absolute path to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "============================================"
log "Card Game Platform - Restarting Services"
log "============================================"
log ""

# Stop services
log "Stopping services..."
"$SCRIPT_DIR/stop.sh"

log ""

# Brief pause to ensure ports are released
sleep 2

# Start services
log "Starting services..."
"$SCRIPT_DIR/start.sh"