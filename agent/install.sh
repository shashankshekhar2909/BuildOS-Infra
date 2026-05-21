#!/usr/bin/env bash
# BuildOS Infra agent bootstrap. Reads --token, --node-id, --master from argv.
set -euo pipefail

INSTALL_DIR="/opt/buildos-agent"
CONFIG_DIR="/etc/buildos-agent"
SERVICE_USER="buildos-agent"

usage() {
  cat <<EOF
Usage: $0 --token <SECURE_AGENT_TOKEN> --node-id <NODE_ID> --master <wss://master/api/ws/agent>
EOF
  exit 1
}

TOKEN=""
NODE_ID=""
MASTER_URL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2;;
    --node-id) NODE_ID="$2"; shift 2;;
    --master) MASTER_URL="$2"; shift 2;;
    *) usage;;
  esac
done

[[ -z "$TOKEN" || -z "$NODE_ID" || -z "$MASTER_URL" ]] && usage

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
usermod -aG docker "$SERVICE_USER"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/main.py" "$INSTALL_DIR/main.py"
cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/requirements.txt"

python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

umask 077
cat > "$CONFIG_DIR/config.env" <<EOF
MASTER_SERVER_URL="$MASTER_URL"
NODE_ID="$NODE_ID"
SECURE_AGENT_TOKEN="$TOKEN"
TELEMETRY_INTERVAL_SECONDS=5
ALLOWED_CONTAINERS=""
LOG_LEVEL=INFO
EOF
chown "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR/config.env"
chmod 600 "$CONFIG_DIR/config.env"

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

cp "$SCRIPT_DIR/buildos-agent.service" /etc/systemd/system/buildos-agent.service
systemctl daemon-reload
systemctl enable --now buildos-agent

echo "BuildOS agent installed. Status:"
systemctl --no-pager status buildos-agent | head -20
