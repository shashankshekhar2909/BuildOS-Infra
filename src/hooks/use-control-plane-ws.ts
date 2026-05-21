"use client";

import { useEffect, useRef, useState } from "react";
import { useAppAuth } from "@/components/auth/auth-provider";

export type ControlPlaneEvent =
  | { event_type: "WELCOME"; data: { user: string; role: string } }
  | {
      event_type: "TELEMETRY_BROADCAST";
      timestamp: string;
      data: {
        node_id: string;
        cpu_usage: number;
        ram_usage: number;
        disk_usage: number;
        containers_total: number;
        containers_running: number;
      };
    }
  | { event_type: "AGENT_CONNECTED" | "AGENT_DISCONNECTED"; data: { node_id: string } }
  | { event_type: "CMD_RESPONSE"; data: Record<string, unknown> }
  | {
      event_type: "LOG_EVENT";
      data: {
        id: number;
        timestamp: string;
        log_type: string;
        source: string;
        message: string;
      };
    }
  | { event_type: "EMERGENCY_LOCKDOWN" | "EMERGENCY_RELEASED"; data: Record<string, unknown> };

export type NodeLiveState = {
  cpu: number;
  ram: number;
  disk: number;
  containersRunning: number;
  containersTotal: number;
  lastSeen: string;
  online: boolean;
};

type ConnectionStatus = "idle" | "connecting" | "open" | "closed";

export function useControlPlaneWs() {
  const { token, isAuthenticated } = useAppAuth();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [nodes, setNodes] = useState<Record<string, NodeLiveState>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${window.location.host}/api/ws/control-plane`;
      const ws = new WebSocket(url, [`buildos.token.${token}`]);
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        let frame: ControlPlaneEvent;
        try {
          frame = JSON.parse(event.data) as ControlPlaneEvent;
        } catch {
          return;
        }

        if (frame.event_type === "TELEMETRY_BROADCAST") {
          const { node_id, cpu_usage, ram_usage, disk_usage, containers_running, containers_total } =
            frame.data;
          setNodes((prev) => ({
            ...prev,
            [node_id]: {
              cpu: cpu_usage,
              ram: ram_usage,
              disk: disk_usage,
              containersRunning: containers_running,
              containersTotal: containers_total,
              lastSeen: frame.timestamp,
              online: true
            }
          }));
        } else if (frame.event_type === "AGENT_DISCONNECTED") {
          setNodes((prev) => {
            const existing = prev[frame.data.node_id];
            if (!existing) return prev;
            return {
              ...prev,
              [frame.data.node_id]: { ...existing, online: false }
            };
          });
        } else if (frame.event_type === "LOG_EVENT") {
          window.dispatchEvent(new CustomEvent("buildos:log", { detail: frame.data }));
        } else if (frame.event_type === "AGENT_CONNECTED") {
          setNodes((prev) => {
            const existing = prev[frame.data.node_id];
            return {
              ...prev,
              [frame.data.node_id]: {
                cpu: existing?.cpu ?? 0,
                ram: existing?.ram ?? 0,
                disk: existing?.disk ?? 0,
                containersRunning: existing?.containersRunning ?? 0,
                containersTotal: existing?.containersTotal ?? 0,
                lastSeen: new Date().toISOString(),
                online: true
              }
            };
          });
        }
      };

      ws.onclose = () => {
        setStatus("closed");
        if (cancelled) return;
        attempt += 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
        reconnectRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [isAuthenticated, token]);

  return { status, nodes };
}
