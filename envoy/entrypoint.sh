#!/bin/sh
set -e

envoy --mode validate -c /etc/envoy/envoy.yaml

envoy -c /etc/envoy/envoy.yaml --log-level "${ENVOY_LOG_LEVEL:-warning}" &
ENVOY_PID=$!

sleep 2

if ! kill -0 "$ENVOY_PID" 2>/dev/null; then
  echo "Envoy failed to start" >&2
  exit 1
fi

for i in 1 2 3 4 5; do
  bunx drizzle-kit push --force && break
  sleep 3
done

exec bun run src/server.ts
