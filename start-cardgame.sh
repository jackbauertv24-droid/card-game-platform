#!/bin/bash
# Startup script for card game platform
# Run this script to start both backend and frontend

cd /root/opencode-workspace/mud

# Start backend
cd packages/api
nohup node_modules/.bin/tsx src/index.ts > /tmp/cardgame-api.log 2>&1 &
API_PID=$!
echo "Backend PID: $API_PID"

# Wait for backend to start
sleep 3

# Start frontend
cd ../web
nohup node_modules/.bin/vite --host 0.0.0.0 --port 5173 > /tmp/cardgame-web.log 2>&1 &
WEB_PID=$!
echo "Frontend PID: $WEB_PID"

# Wait for frontend
sleep 2

echo ""
echo "=== Card Game Platform Started ==="
echo "Backend: http://localhost:4000 (Network: http://10.4.0.9:4000)"
echo "Frontend: http://localhost:5173 (Network: http://10.4.0.9:5173)"
echo ""
echo "Logs:"
echo "  Backend: /tmp/cardgame-api.log"
echo "  Frontend: /tmp/cardgame-web.log"
echo ""
echo "To stop: kill $API_PID $WEB_PID"