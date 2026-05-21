#!/usr/bin/env bash
# BuildOS Infra agent bootstrap. Reads --token, --node-id, --master, --mode from argv.
set -euo pipefail

INSTALL_DIR="/opt/buildos-agent"
CONFIG_DIR="/etc/buildos-agent"
SERVICE_USER="buildos-agent"

usage() {
  cat <<EOF
Usage: $0 --token <SECURE_AGENT_TOKEN> --node-id <NODE_ID> --master <ws[s]://host:port/api/ws/agent> [--mode docker|proxmox|hybrid] [--allow <names>]

  --token     Plaintext agent token from the master registration response.
  --node-id   Node id returned by the master.
  --master    WebSocket URL of the master, including /api/ws/agent path.
  --mode      docker (default), proxmox, or hybrid.
  --allow     Comma-separated container names allowed (production safety). Empty = no filter.
EOF
  exit 1
}

TOKEN=""
NODE_ID=""
MASTER_URL=""
MODE="docker"
ALLOWLIST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2;;
    --node-id) NODE_ID="$2"; shift 2;;
    --master) MASTER_URL="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --allow) ALLOWLIST="$2"; shift 2;;
    -h|--help) usage;;
    *) echo "Unknown arg: $1" >&2; usage;;
  esac
done

[[ -z "$TOKEN" || -z "$NODE_ID" || -z "$MASTER_URL" ]] && usage

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

# --- Ensure dependencies (Debian/Ubuntu); skip gracefully on other distros. ---
if command -v apt-get >/dev/null 2>&1; then
  if ! command -v python3 >/dev/null 2>&1 || ! python3 -m venv --help >/dev/null 2>&1; then
    echo "[buildos] installing python3-venv..."
    apt-get update -qq
    apt-get install -y --no-install-recommends python3 python3-venv ca-certificates >/dev/null
  fi
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found and apt-get unavailable. Install Python 3.10+ first." >&2
  exit 1
fi

# --- Service user ---
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

# Add to docker group only if it exists (avoid hard failure on PROXMOX-only hosts).
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "$SERVICE_USER" || true
fi

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

# --- Copy agent files (prefer files next to install.sh; otherwise allow remote curl) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/main.py" && -f "$SCRIPT_DIR/requirements.txt" ]]; then
  cp "$SCRIPT_DIR/main.py" "$INSTALL_DIR/main.py"
  cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/requirements.txt"
  [[ -f "$SCRIPT_DIR/buildos-agent.service" ]] && cp "$SCRIPT_DIR/buildos-agent.service" "$INSTALL_DIR/buildos-agent.service"
else
  echo "main.py / requirements.txt not found next to install.sh." >&2
  exit 1
fi

# --- Python venv + deps ---
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/requirements.txt"

# --- Config (mode-aware) ---
umask 077
{
  echo "MASTER_SERVER_URL=\"$MASTER_URL\""
  echo "NODE_ID=\"$NODE_ID\""
  echo "SECURE_AGENT_TOKEN=\"$TOKEN\""
  echo "TELEMETRY_INTERVAL_SECONDS=5"
  echo "ALLOWED_CONTAINERS=\"$ALLOWLIST\""
  echo "LOG_LEVEL=INFO"
  echo "EMERGENCY_STOP_ON_BLOCK=false"
  echo "AGENT_MODE=\"$MODE\""
  if [[ "$MODE" == "proxmox" || "$MODE" == "hybrid" ]]; then
    echo "# Fill in Proxmox API token (do not use root@pam!root password):"
    echo "PVE_HOST=\"https://localhost:8006\""
    echo "PVE_USER=\"root@pam\""
    echo "PVE_TOKEN_ID=\"buildos\""
    echo "PVE_TOKEN_SECRET=\"\""
    echo "PVE_VERIFY_SSL=\"false\""
  fi
} > "$CONFIG_DIR/config.env"

chown "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR/config.env"
chmod 600 "$CONFIG_DIR/config.env"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# --- systemd unit ---
if [[ -f "$INSTALL_DIR/buildos-agent.service" ]]; then
  cp "$INSTALL_DIR/buildos-agent.service" /etc/systemd/system/buildos-agent.service
else
  cat > /etc/systemd/system/buildos-agent.service <<UNIT
[Unit]
Description=BuildOS Infra Remote Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$(getent group docker >/dev/null 2>&1 && echo docker || echo $SERVICE_USER)
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$CONFIG_DIR/config.env
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/main.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
fi

systemctl daemon-reload
systemctl enable --now buildos-agent

echo
echo "BuildOS agent installed."
echo "  Mode:     $MODE"
echo "  Node:     $NODE_ID"
echo "  Master:   $MASTER_URL"
echo "  Config:   $CONFIG_DIR/config.env (0600, owner $SERVICE_USER)"
echo
echo "Status:"
systemctl --no-pager status buildos-agent | head -15
echo
echo "Live logs:  journalctl -u buildos-agent -f"
