#!/bin/bash
# Helper script to run ASTRAM Traffic Intelligence Platform locally outside the IDE sandbox container.

# Exit immediately if any command fails
set -e

echo "=========================================================="
echo "🚀 Starting ASTRAM Traffic Intelligence Platform..."
echo "=========================================================="

# Cleanup handler to stop all background processes on exit
cleanup() {
  echo ""
  echo "🛑 Stopping backend and frontend servers..."
  if [ -n "${BACKEND_PID}" ]; then
    kill ${BACKEND_PID} 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID}" ]; then
    kill ${FRONTEND_PID} 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Start Python Backend
echo "📡 [1/2] Starting Python backend API server..."
python3 -m uvicorn serve.main:app --host localhost --port 8000 &
BACKEND_PID=$!

# Wait a brief moment for the backend to start
sleep 2

# 2. Start Frontend Dev Server
echo "💻 [2/2] Starting Vite frontend server..."
cd frontend
npm run dev -- --host localhost &
FRONTEND_PID=$!

echo "=========================================================="
echo "🎯 Platform is starting up!"
echo "👉 Frontend URL: http://localhost:5173"
echo "👉 Backend API:  http://localhost:8000"
echo "=========================================================="
echo "Press Ctrl+C to terminate both servers."

# Wait for background jobs to finish
wait
