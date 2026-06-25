#!/bin/sh
set -e

echo "Starting PTTI server..."
npx prisma migrate deploy
exec node dist/index.js
