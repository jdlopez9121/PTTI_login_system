#!/bin/sh
set -e

echo "Starting PTTI server..."
node dist/scripts/applyCohortYears.js
node dist/scripts/applyStudentVideos.js
node dist/scripts/applyAttendanceMonths.js
exec node dist/index.js
