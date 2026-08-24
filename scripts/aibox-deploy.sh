#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/aibox/Dev/open-lovable"
PORT="4320"
CONFIG_DIR="${HOME}/.config/open-lovable"
ENV_FILE="${CONFIG_DIR}/env"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_FILE="${UNIT_DIR}/open-lovable.service"

[[ "$(pwd -P)" == "${APP_ROOT}" ]] || {
  echo "refusing deploy outside ${APP_ROOT}" >&2
  exit 2
}
[[ -f ".next/BUILD_ID" ]] || {
  echo "production Next.js build is missing" >&2
  exit 3
}

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
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_ROOT}
Environment=NODE_ENV=production
Environment=NEXT_PUBLIC_APP_URL=http://127.0.0.1:${PORT}
Environment=SANDBOX_PROVIDER=vercel
EnvironmentFile=-${ENV_FILE}
ExecStart=/usr/bin/bash -lc 'exec npm run start -- --hostname 127.0.0.1 --port ${PORT}'
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
    rm -f /tmp/open-lovable-health.json
    exit 0
  fi
  sleep 1
done

systemctl --user status open-lovable.service --no-pager --full || true
journalctl --user -u open-lovable.service -n 120 --no-pager || true
exit 5
