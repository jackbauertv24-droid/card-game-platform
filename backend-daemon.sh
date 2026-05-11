#!/bin/bash
# Start backend daemon
cd /root/opencode-workspace/mud/packages/api
exec node_modules/.bin/tsx src/index.ts