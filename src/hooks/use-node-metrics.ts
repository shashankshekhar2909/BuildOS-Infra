"use client";

import { useEffect, useState } from "react";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

export type MetricPoint = {
  timestamp: string;
  cpu_pct: number;
  ram_pct: number;
  disk_pct: number;
};

type MetricsResponse = {
  node_id: string;
  range: string;
  points: MetricPoint[];
};

export function useNodeMetrics(nodeId: string, range = "1h", intervalMs = 15_000) {
  const { token } = useAppAuth();
  const [points, setPoints] = useState<MetricPoint[]>([]);

  useEffect(() => {
    if (!token || !nodeId) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch<MetricsResponse>(
          `/api/infra/nodes/${nodeId}/metrics?range=${encodeURIComponent(range)}`,
          { token }
        );
        if (!cancelled) setPoints(res.points);
      } catch {
        // ignore
      }
    }

    void load();
    const i = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [token, nodeId, range, intervalMs]);

  return points;
}
