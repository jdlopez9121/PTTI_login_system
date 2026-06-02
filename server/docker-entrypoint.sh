#!/bin/sh
set -e

echo "Starting PTTI server..."
exec node dist/index.js
