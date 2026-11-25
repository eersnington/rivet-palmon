#!/bin/sh
# Runs the real engine binary with a smaller log shard cap. See server/local-engine.ts.
RIVET__STORAGE__LOG_SHARD__MAX_DISK_BYTES="$LOCAL_ENGINE_LOG_MAX_DISK_BYTES" exec "$LOCAL_ENGINE_BINARY" "$@"
