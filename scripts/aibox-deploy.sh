#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/aibox/Dev/open-lovable"
PORT="4320"
LAN_IP="$(hostname -I 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i ~ /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/) {print $i; exit}}')"
[[ -n "${LAN_IP}" ]] || LAN_IP="127.0.0.1"
CONFIG_DIR="${HOME}/.config/open-lovable"
ENV_FILE="${CONFIG_DIR}/env"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_FILE="${UNIT_DIR}/open-lovable.service"
LOCAL_SANDBOX_IMAGE="node:22.23.2-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a"

[[ "$(pwd -P)" == "${APP_ROOT}" ]] || {
  echo "refusing deploy outside ${APP_ROOT}" >&2
  exit 2
}
[[ -f ".next/BUILD_ID" ]] || {
  echo "production Next.js build is missing" >&2
  exit 3
}
[[ -x /usr/bin/docker ]] || {
  echo "docker is required for the Open Lovable local sandbox provider" >&2
  exit 6
}
/usr/bin/docker version --format '{{.Server.Version}}' >/dev/null

mkdir -p "${CONFIG_DIR}" "${UNIT_DIR}"
if [[ ! -e "${ENV_FILE}" ]]; then
  install -m 600 /dev/null "${ENV_FILE}"
else
  chmod 600 "${ENV_FILE}"
fi

if ! systemctl --user is-active --quiet open-lovable.service 2>/dev/null; then
  if ss -ltn 2>/dev/null | grep -Eq "[:.]${PORT}[[:space:]]"; then
    echo "port ${PORT} is already in use by another process" >&2
    exit 4
  fi
fi

tmp_unit="$(mktemp "${UNIT_DIR}/.open-lovable.service.XXXXXX")"
trap 'rm -f "${tmp_unit}"' EXIT

cat > "${tmp_unit}" <<EOF
[Unit]
Description=Open Lovable website builder
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_ROOT}
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=NEXT_PUBLIC_APP_URL=http://${LAN_IP}:${PORT}
Environment=SANDBOX_PROVIDER=local-docker
Environment=LOCAL_SANDBOX_IMAGE=${LOCAL_SANDBOX_IMAGE}
Environment=LOCAL_SANDBOX_HOST=${LAN_IP}
Environment=LOCAL_SANDBOX_MEMORY=1536m
Environment=LOCAL_SANDBOX_CPUS=2
Environment=LOCAL_SANDBOX_PIDS=512
EnvironmentFile=-${ENV_FILE}
ExecStart=/usr/bin/bash -lc 'exec npm run start -- --hostname 0.0.0.0 --port ${PORT}'
Restart=on-failure
RestartSec=3
TimeoutStopSec=20

[Install]
WantedBy=default.target
EOF

chmod 600 "${tmp_unit}"
mv -f "${tmp_unit}" "${UNIT_FILE}"
trap - EXIT

systemctl --user daemon-reload
systemctl --user enable open-lovable.service >/dev/null
systemctl --user restart open-lovable.service

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/tmp/open-lovable-health.json 2>/dev/null; then
    cat /tmp/open-lovable-health.json
    echo
    echo "LAN_URL=http://${LAN_IP}:${PORT}"
    rm -f /tmp/open-lovable-health.json
    exit 0
  fi
  sleep 1
done

systemctl --user status open-lovable.service --no-pager --full || true
journalctl --user -u open-lovable.service -n 120 --no-pager || true
exit 5
