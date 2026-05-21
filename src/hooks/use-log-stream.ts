"use client";

import { useEffect, useState } from "react";
import { useControlPlaneWs } from "@/hooks/use-control-plane-ws";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

export type LogRow = {
  id: number;
  timestamp: string;
  log_type: string;
  source: string;
  message: string;
};

const MAX_ROWS = 200;

export function useLogStream() {
  const { token } = useAppAuth();
  useControlPlaneWs(); // ensure socket is open; ignore returned state
  const [rows, setRows] = useState<LogRow[]>([]);

  // Initial seed via REST.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<LogRow[]>("/api/infra/logs?limit=100", { token })
      .then((data) => {
        if (!cancelled) setRows(data.slice().reverse());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Live updates: piggyback on existing control-plane WS via a global event channel.
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<LogRow>).detail;
      setRows((prev) => {
        const next = [...prev, detail];
        return next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next;
      });
    }
    window.addEventListener("buildos:log", handler as EventListener);
    return () => window.removeEventListener("buildos:log", handler as EventListener);
  }, []);

  return rows;
}
