#!/bin/sh
set -e

echo "Starting PTTI server..."
echo "Running database migrations..."
npx prisma migrate deploy
exec node dist/index.js
