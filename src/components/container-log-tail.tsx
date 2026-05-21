"use client";

import { useEffect, useRef, useState } from "react";
import { useAppAuth } from "@/components/auth/auth-provider";

type LogLine = {
  node_id: string;
  container_id: string;
  container_name: string;
  line: string;
  stream: string;
  timestamp: string;
};

const MAX_LINES = 500;

export function ContainerLogTail({
  containerId,
  nodeId,
  containerName
}: {
  containerId: string;
  nodeId: string;
  containerName: string;
}) {
  const { token } = useAppAuth();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/ws/control-plane`, [
      `buildos.token.${token}`
    ]);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      ws.send(
        JSON.stringify({
          action: "SUBSCRIBE_LOGS",
          node_id: nodeId,
          container_id: containerId,
          container_name: containerName
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.event_type !== "CONTAINER_LOG") return;
        if (frame.data.container_id !== containerId) return;
        setLines((prev) => {
          const next = [...prev, frame.data as LogLine];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      } catch {
        // ignore
      }
    };

    ws.onclose = () => setStatus("closed");
    ws.onerror = () => ws.close();

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            action: "UNSUBSCRIBE_LOGS",
            node_id: nodeId,
            container_id: containerId
          })
        );
      }
      ws.close();
      wsRef.current = null;
    };
  }, [token, containerId, nodeId, containerName]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-[#040810] p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-cyan-200/70 uppercase tracking-[0.24em]">tail · {containerName}</span>
        <span
          className={`${
            status === "open" ? "text-emerald-400" : status === "closed" ? "text-red-300" : "text-amber-300"
          }`}
        >
          {status}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto font-[family-name:var(--font-mono)] text-[11px] leading-5 text-slate-200"
      >
        {lines.length === 0 ? (
          <div className="text-[var(--muted-foreground)]">
            {status === "open" ? "Waiting for output…" : "Not connected."}
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap">
              <span className="text-[var(--muted-foreground)]">
                {l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : ""}
              </span>{" "}
              {l.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
