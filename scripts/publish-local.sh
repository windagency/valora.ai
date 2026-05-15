#!/bin/bash
set -e

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERDACCIO_CONFIG="$WORKSPACE_ROOT/.devcontainer/verdaccio/config.yaml"

# Load .env so VALORA_NPM_REGISTRY_URL and related vars are available
if [ -f "$WORKSPACE_ROOT/.env" ]; then
    set -a
    # shellcheck source=../.env
    source "$WORKSPACE_ROOT/.env"
    set +a
fi

REGISTRY="${VALORA_NPM_REGISTRY_URL:?VALORA_NPM_REGISTRY_URL must be set in .env}"

# Strip the scheme to get host:port, then extract just the port number.
# host:port is used for the npm auth token key; port alone is used when
# rewriting the URL for the demo container (127.0.0.1 → host.docker.internal).
REGISTRY_HOST_PORT="${REGISTRY#http://}"
REGISTRY_HOST_PORT="${REGISTRY_HOST_PORT#https://}"
REGISTRY_PORT="${REGISTRY_HOST_PORT##*:}"

# Set a dummy auth token so the npm client doesn't reject the publish request
# client-side (Verdaccio accepts $all with no auth plugin configured)
npm config set "//${REGISTRY_HOST_PORT}/:_authToken" "local-dev"

VERDACCIO_STORAGE=$(grep '^storage:' "$VERDACCIO_CONFIG" | awk '{print $2}')

# Kill any running Verdaccio and wipe storage so re-publishes always succeed
pkill -f verdaccio 2>/dev/null || true
rm -rf "$VERDACCIO_STORAGE"

echo "Starting Verdaccio..."
verdaccio --config "$VERDACCIO_CONFIG" &
until curl -sf "$REGISTRY" > /dev/null 2>&1; do
    sleep 1
done
echo "Verdaccio ready at $REGISTRY"

for pkg_json in "$WORKSPACE_ROOT"/packages/*/package.json; do
    pkg_dir="$(dirname "$pkg_json")"
    name=$(node -p "require('$pkg_json').name")
    echo "Publishing $name..."
    (cd "$pkg_dir" && pnpm publish --no-git-checks --force --registry "$REGISTRY")
done

echo "Publishing @windagency/valora..."
(cd "$WORKSPACE_ROOT" && pnpm publish --no-git-checks --force --registry "$REGISTRY")

# Recompute registry.json hashes by downloading each package from Verdaccio.
# This must run AFTER publish so npm pack fetches the exact bytes that the
# installer will download — pnpm publish rewrites JSON field order, making
# local pnpm pack produce a different tarball (and therefore a different SHA).
(cd "$WORKSPACE_ROOT" && pnpm run build:registry)

REGISTRY_SERVER_PORT=4874
REGISTRY_JSON="$WORKSPACE_ROOT/data/plugins/registry.json"

# Release port 4874. Kill by port rather than by process name because Node.js
# rewrites process.title, making the process invisible to pkill -f patterns.
# Poll until the OS confirms the port is free before binding the new server.
fuser -k -9 "${REGISTRY_SERVER_PORT}/tcp" 2>/dev/null || true
while fuser "${REGISTRY_SERVER_PORT}/tcp" > /dev/null 2>&1; do
    sleep 0.1
done
node --title valora-registry-server -e "
const http = require('http');
const fs = require('fs');
const file = '$REGISTRY_JSON';
http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(fs.readFileSync(file));
}).listen($REGISTRY_SERVER_PORT, '0.0.0.0');
" &

echo ""
echo "All packages published. In the demo container run:"
echo "  export VALORA_PLUGIN_REGISTRY_URL=http://host.docker.internal:$REGISTRY_SERVER_PORT/registry.json"
echo "  pnpm add -g @windagency/valora --registry http://host.docker.internal:${REGISTRY_PORT}"
