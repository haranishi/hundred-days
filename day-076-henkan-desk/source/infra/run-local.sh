#!/usr/bin/env bash
set -Eeuo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$project_root"
docker_context="${HENKAN_DOCKER_CONTEXT:-colima}"
engine_name=henkan-desk-engine
gateway_name=henkan-desk-gateway
network_name=henkan-desk-private
public_network=henkan-desk-public
engine_image=henkan-desk-engine:local
gateway_image=henkan-desk-gateway:local
docker_cmd() { docker --context "$docker_context" "$@"; }
remove_owned() {
  local container_name="$1"
  if docker_cmd container inspect "$container_name" >/dev/null 2>&1; then
    local owner
    owner="$(docker_cmd container inspect --format '{{index .Config.Labels "app.henkan-desk"}}' "$container_name")"
    if [[ "$owner" != local ]]; then
      echo "Refusing to change an unrelated container: $container_name" >&2
      exit 1
    fi
    docker_cmd container rm -f "$container_name" >/dev/null
  fi
}
case "${1:-start}" in
  start)
    docker_cmd info >/dev/null
    DOCKER_BUILDKIT=0 docker_cmd build -t "$engine_image" -f infra/engine.Dockerfile .
    DOCKER_BUILDKIT=0 docker_cmd build -t "$gateway_image" -f infra/gateway.Dockerfile .
    if docker_cmd network inspect "$network_name" >/dev/null 2>&1; then
      if [[ "$(docker_cmd network inspect --format '{{.Internal}}' "$network_name")" != true ]]; then
        echo "Expected an internal network: $network_name" >&2
        exit 1
      fi
    else
      docker_cmd network create --internal --label app.henkan-desk=local "$network_name" >/dev/null
    fi
    if ! docker_cmd network inspect "$public_network" >/dev/null 2>&1; then
      docker_cmd network create --label app.henkan-desk=local "$public_network" >/dev/null
    fi
    remove_owned "$gateway_name"
    remove_owned "$engine_name"
    docker_cmd run -d --name "$engine_name" --label app.henkan-desk=local --network "$network_name" --network-alias engine \
      --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 256 \
      --memory 2g --memory-swap 2g --ulimit core=0 --tmpfs /tmp:rw,nosuid,nodev,size=512m,mode=1777 \
      --restart on-failure --health-cmd "node -e \"fetch('http://127.0.0.1:3001/internal/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" \
      --health-interval 10s --health-timeout 3s --health-retries 3 "$engine_image" >/dev/null
    docker_cmd run -d --name "$gateway_name" --label app.henkan-desk=local --network "$public_network" \
      -p 127.0.0.1:4173:4173 -e PUBLIC_ORIGIN=http://localhost:4173 -e ENGINE_URL=http://engine:3001 \
      --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 128 \
      --memory 512m --memory-swap 512m --ulimit core=0 --tmpfs /tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777 \
      --restart on-failure "$gateway_image" >/dev/null
    docker_cmd network connect "$network_name" "$gateway_name"
    echo "へんかんデスク: http://localhost:4173"
    ;;
  stop)
    remove_owned "$gateway_name"
    remove_owned "$engine_name"
    ;;
  status)
    docker_cmd ps -a --filter label=app.henkan-desk=local --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *) echo "Usage: infra/run-local.sh [start|stop|status]" >&2; exit 2 ;;
esac
