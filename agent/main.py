"""BuildOS Infra remote agent.

Egress-only WSS client. Heartbeats telemetry + container state every 5s.
Executes Docker control commands dispatched by master.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import sys
from datetime import datetime, timezone
from typing import Any

import psutil
import websockets
from websockets.exceptions import ConnectionClosed

try:
    import docker
    from docker.errors import DockerException
except ImportError:  # pragma: no cover
    docker = None  # type: ignore[assignment]
    DockerException = Exception  # type: ignore[misc,assignment]

try:
    from proxmoxer import ProxmoxAPI  # type: ignore
except ImportError:  # pragma: no cover
    ProxmoxAPI = None  # type: ignore[assignment,misc]

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("buildos-agent")

MASTER_URL = os.environ.get("MASTER_SERVER_URL", "ws://localhost:8015/api/ws/agent")
NODE_ID = os.environ.get("NODE_ID", "")
TOKEN = os.environ.get("SECURE_AGENT_TOKEN", "")
HEARTBEAT_INTERVAL = int(os.environ.get("TELEMETRY_INTERVAL_SECONDS", "5"))
ALLOWED_CONTAINERS = {
    name.strip()
    for name in os.environ.get("ALLOWED_CONTAINERS", "").split(",")
    if name.strip()
}
EMERGENCY_STOP_ON_BLOCK = os.environ.get("EMERGENCY_STOP_ON_BLOCK", "true").lower() in {"1", "true", "yes"}
AGENT_MODE = os.environ.get("AGENT_MODE", "docker").lower()  # docker | proxmox | hybrid
PVE_HOST = os.environ.get("PVE_HOST", "https://localhost:8006")
PVE_USER = os.environ.get("PVE_USER", "root@pam")
PVE_TOKEN_ID = os.environ.get("PVE_TOKEN_ID", "")
PVE_TOKEN_SECRET = os.environ.get("PVE_TOKEN_SECRET", "")
PVE_VERIFY_SSL = os.environ.get("PVE_VERIFY_SSL", "false").lower() in {"1", "true", "yes"}

# Set by EMERGENCY_BLOCK frame from master; cleared by EMERGENCY_RELEASE.
emergency_locked = False

# Active log-tail tasks keyed by container_id.
log_tail_tasks: dict[str, asyncio.Task] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def docker_client():
    if docker is None or AGENT_MODE == "proxmox":
        return None
    try:
        return docker.from_env()
    except DockerException as exc:
        log.warning("Docker SDK unavailable: %s", exc)
        return None


def proxmox_client():
    if AGENT_MODE not in {"proxmox", "hybrid"}:
        return None
    if ProxmoxAPI is None:
        log.error("proxmoxer not installed; install agent/requirements.txt.")
        return None
    if not PVE_TOKEN_ID or not PVE_TOKEN_SECRET:
        log.error("PVE_TOKEN_ID and PVE_TOKEN_SECRET required for proxmox mode.")
        return None
    parsed_host = PVE_HOST.replace("https://", "").replace("http://", "").rstrip("/")
    host_only, _, port = parsed_host.partition(":")
    try:
        return ProxmoxAPI(
            host_only,
            user=PVE_USER,
            token_name=PVE_TOKEN_ID,
            token_value=PVE_TOKEN_SECRET,
            verify_ssl=PVE_VERIFY_SSL,
            port=int(port) if port else 8006
        )
    except Exception as exc:  # pragma: no cover
        log.warning("Proxmox client init failed: %s", exc)
        return None


def collect_pve_guests(prox: Any) -> list[dict[str, Any]]:
    if prox is None:
        return []
    out: list[dict[str, Any]] = []
    try:
        for n in prox.nodes.get():
            node_name = n["node"]
            for guest in prox.nodes(node_name).lxc.get():
                vmid = int(guest["vmid"])
                mem = float(guest.get("mem", 0) or 0)
                maxmem = float(guest.get("maxmem", 1) or 1)
                disk = float(guest.get("disk", 0) or 0)
                maxdisk = float(guest.get("maxdisk", 1) or 1)
                out.append({
                    "vmid": vmid,
                    "kind": "lxc",
                    "name": guest.get("name", f"ct-{vmid}"),
                    "state": guest.get("status", "unknown"),
                    "cpu_pct": round(float(guest.get("cpu", 0) or 0) * 100, 2),
                    "mem_pct": round((mem / maxmem) * 100, 2) if maxmem > 0 else 0.0,
                    "disk_pct": round((disk / maxdisk) * 100, 2) if maxdisk > 0 else 0.0,
                    "uptime_seconds": int(guest.get("uptime", 0) or 0)
                })
            for guest in prox.nodes(node_name).qemu.get():
                vmid = int(guest["vmid"])
                mem = float(guest.get("mem", 0) or 0)
                maxmem = float(guest.get("maxmem", 1) or 1)
                out.append({
                    "vmid": vmid,
                    "kind": "qemu",
                    "name": guest.get("name", f"vm-{vmid}"),
                    "state": guest.get("status", "unknown"),
                    "cpu_pct": round(float(guest.get("cpu", 0) or 0) * 100, 2),
                    "mem_pct": round((mem / maxmem) * 100, 2) if maxmem > 0 else 0.0,
                    "disk_pct": 0.0,
                    "uptime_seconds": int(guest.get("uptime", 0) or 0)
                })
    except Exception as exc:  # pragma: no cover
        log.warning("PVE list failed: %s", exc)
    return out


def execute_pve_control(prox: Any, vmid: int, kind: str, signal: str) -> tuple[str, str]:
    if emergency_locked:
        return "failed", "Emergency lockdown active — PVE control rejected."
    if prox is None:
        return "failed", "Proxmox client unavailable."
    try:
        for n in prox.nodes.get():
            node_name = n["node"]
            collection = prox.nodes(node_name).lxc if kind == "lxc" else prox.nodes(node_name).qemu
            guests = collection.get()
            if any(int(g["vmid"]) == vmid for g in guests):
                status = collection(vmid).status
                if signal == "start":
                    status.start.post()
                elif signal == "stop":
                    status.stop.post()
                elif signal == "reboot":
                    status.reboot.post()
                elif signal == "shutdown":
                    status.shutdown.post()
                else:
                    return "failed", f"Unknown signal '{signal}'."
                return "success", f"PVE {kind} {vmid} signal '{signal}' issued."
        return "failed", f"vmid {vmid} not found on this PVE host."
    except Exception as exc:  # pragma: no cover
        return "failed", str(exc)


def collect_containers(client: Any) -> list[dict[str, Any]]:
    if client is None:
        return []
    out: list[dict[str, Any]] = []
    try:
        for c in client.containers.list(all=True):
            attrs = c.attrs
            ports = attrs.get("NetworkSettings", {}).get("Ports") or {}
            ports_str = ", ".join(sorted(ports.keys())) if ports else ""
            out.append(
                {
                    "id": c.id[:24],
                    "name": c.name,
                    "image": attrs.get("Config", {}).get("Image", "unknown"),
                    "state": c.status,
                    "status": attrs.get("State", {}).get("Status", c.status),
                    "ports": ports_str,
                }
            )
    except DockerException as exc:
        log.warning("Container list failed: %s", exc)
    return out


def collect_telemetry() -> dict[str, float]:
    disk = psutil.disk_usage("/")
    return {
        "cpu_pct": round(psutil.cpu_percent(interval=None), 2),
        "ram_pct": round(psutil.virtual_memory().percent, 2),
        "disk_pct": round(disk.percent, 2),
    }


def execute_docker_control(client: Any, target: str, signal: str) -> tuple[str, str]:
    if emergency_locked:
        return "failed", "Emergency lockdown active — agent rejects control commands."
    if ALLOWED_CONTAINERS and target not in ALLOWED_CONTAINERS:
        return "failed", f"Container '{target}' not in allowlist."
    if client is None:
        return "failed", "Docker client unavailable."
    try:
        container = client.containers.get(target)
        if signal == "start":
            container.start()
        elif signal == "stop":
            container.stop(timeout=30)
        elif signal == "restart":
            container.restart(timeout=30)
        else:
            return "failed", f"Unknown signal '{signal}'."
        return "success", f"Signal '{signal}' applied to '{target}'."
    except DockerException as exc:
        return "failed", str(exc)


async def heartbeat_loop(ws: Any, client: Any, prox: Any) -> None:
    while True:
        frame = {
            "action": "HEARTBEAT",
            "client_time": now_iso(),
            "payload": {
                "telemetry": collect_telemetry(),
                "containers": collect_containers(client),
            },
        }
        await ws.send(json.dumps(frame))
        if prox is not None:
            guests = collect_pve_guests(prox)
            await ws.send(
                json.dumps({
                    "action": "PVE_GUESTS",
                    "client_time": now_iso(),
                    "guests": guests,
                })
            )
        await asyncio.sleep(HEARTBEAT_INTERVAL)


async def tail_container_logs(ws: Any, client: Any, container_id: str, container_name: str) -> None:
    if client is None:
        return
    loop = asyncio.get_running_loop()
    try:
        container = await loop.run_in_executor(
            None, lambda: client.containers.get(container_name or container_id)
        )
    except DockerException as exc:
        log.warning("tail: get container '%s' failed: %s", container_name, exc)
        return

    def stream_iter():
        return container.logs(stream=True, follow=True, tail=20, stdout=True, stderr=True, timestamps=True)

    try:
        stream = await loop.run_in_executor(None, stream_iter)
        while True:
            chunk = await loop.run_in_executor(None, next, stream, None)
            if chunk is None:
                break
            line = chunk.decode("utf-8", errors="replace").rstrip("\n")
            if not line:
                continue
            ts, _, payload = line.partition(" ")
            await ws.send(
                json.dumps(
                    {
                        "action": "CONTAINER_LOG",
                        "container_id": container_id,
                        "container_name": container_name,
                        "timestamp": ts,
                        "stream": "stdout",
                        "line": payload or line,
                    }
                )
            )
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # pragma: no cover
        log.warning("tail: stream '%s' ended: %s", container_name, exc)


def stop_tail(container_id: str) -> None:
    task = log_tail_tasks.pop(container_id, None)
    if task and not task.done():
        task.cancel()


async def receive_loop(ws: Any, client: Any, prox: Any) -> None:
    async for raw in ws:
        try:
            frame = json.loads(raw)
        except json.JSONDecodeError:
            continue

        action = frame.get("action")
        if action == "PVE_CONTROL":
            tx = frame.get("transaction_id")
            status, message = execute_pve_control(
                prox,
                int(frame.get("vmid", 0)),
                str(frame.get("kind", "lxc")),
                str(frame.get("signal", ""))
            )
            await ws.send(
                json.dumps({
                    "action": "CMD_RESPONSE",
                    "transaction_id": tx,
                    "status": status,
                    "message": message
                })
            )
        elif action == "DOCKER_CONTROL":
            tx = frame.get("transaction_id")
            status, message = execute_docker_control(
                client,
                str(frame.get("target_container", "")),
                str(frame.get("signal", "")),
            )
            await ws.send(
                json.dumps(
                    {
                        "action": "CMD_RESPONSE",
                        "transaction_id": tx,
                        "status": status,
                        "message": message,
                    }
                )
            )
        elif action == "EMERGENCY_BLOCK":
            global emergency_locked
            emergency_locked = True
            log.warning("EMERGENCY_BLOCK received — locking agent.")
            if EMERGENCY_STOP_ON_BLOCK and client is not None and ALLOWED_CONTAINERS:
                for name in ALLOWED_CONTAINERS:
                    try:
                        c = client.containers.get(name)
                        c.stop(timeout=30)
                        log.warning("Stopped %s due to emergency block.", name)
                    except DockerException as exc:
                        log.warning("Failed to stop %s: %s", name, exc)
        elif action == "EMERGENCY_RELEASE":
            globals()["emergency_locked"] = False
            log.info("EMERGENCY_RELEASE received — agent unlocked.")
        elif action == "SUBSCRIBE_LOGS":
            cid = str(frame.get("container_id", ""))
            cname = str(frame.get("container_name") or cid)
            if not cid:
                continue
            if ALLOWED_CONTAINERS and cname not in ALLOWED_CONTAINERS:
                log.warning("Log subscribe denied; '%s' not in allowlist.", cname)
                continue
            if cid in log_tail_tasks and not log_tail_tasks[cid].done():
                continue
            log_tail_tasks[cid] = asyncio.create_task(
                tail_container_logs(ws, client, cid, cname)
            )
        elif action == "UNSUBSCRIBE_LOGS":
            cid = str(frame.get("container_id", ""))
            if cid:
                stop_tail(cid)
        else:
            log.debug("Unknown action: %s", action)


async def connect_once(client: Any, prox: Any) -> None:
    url = f"{MASTER_URL.rstrip('/')}/{NODE_ID}"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    log.info("Connecting to %s (mode=%s)", url, AGENT_MODE)
    async with websockets.connect(url, additional_headers=headers, max_size=2**20) as ws:
        log.info("Connected as node=%s", NODE_ID)
        psutil.cpu_percent(interval=None)
        try:
            await asyncio.gather(heartbeat_loop(ws, client, prox), receive_loop(ws, client, prox))
        finally:
            for cid in list(log_tail_tasks.keys()):
                stop_tail(cid)


async def main() -> None:
    if not NODE_ID or not TOKEN:
        log.error("NODE_ID and SECURE_AGENT_TOKEN required.")
        sys.exit(1)

    client = docker_client()
    prox = proxmox_client()
    backoff = 1
    while True:
        try:
            await connect_once(client, prox)
        except (ConnectionClosed, OSError) as exc:
            log.warning("Connection lost: %s — reconnecting in %ds", exc, backoff)
        except Exception as exc:  # pragma: no cover
            log.exception("Unexpected error: %s — reconnecting in %ds", exc, backoff)
        jitter = random.uniform(0, backoff / 2)
        await asyncio.sleep(backoff + jitter)
        backoff = min(backoff * 2, 30)


if __name__ == "__main__":
    asyncio.run(main())
