#!/bin/sh
set -e

echo "Starting PTTI server..."
node dist/scripts/applyStudentVideos.js
exec node dist/index.js
