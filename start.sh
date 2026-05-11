#!/bin/bash
cd "$(dirname "$0")"

echo "Starting Card Game Platform..."

# Kill existing processes
pkill -f "tsx watch" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# Start backend
cd packages/api
echo "Starting backend on port 4000..."
setsid node_modules/.bin/tsx src/index.ts > /tmp/api.log 2>&1 &
API_PID=$!
cd ..

# Start frontend
cd packages/web
echo "Starting frontend on port 5173..."
setsid node_modules/.bin/vite --host 0.0.0.0 --port 5173 > /tmp/web.log 2>&1 &
WEB_PID=$!
cd ..

sleep 2

echo ""
echo "Server started!"
echo "  Backend: http://localhost:4000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Logs:"
echo "  Backend: /tmp/api.log"
echo "  Frontend: /tmp/web.log"
echo ""
echo "Press Ctrl+C to stop"

wait $API_PID $WEB_PID