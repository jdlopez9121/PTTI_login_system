#!/bin/sh
set -e

echo "Pushing database schema..."
npx prisma db push --accept-data-loss

echo "Seeding curriculum data..."
npx tsx prisma/seed.ts

echo "Starting PTTI server..."
exec node dist/index.js
