export type ApiOptions = {
  method?: string;
  body?: unknown;
  token: string | null;
};

export async function apiFetch<T = unknown>(path: string, options: ApiOptions): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  const json = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);

  if (!res.ok) {
    const errMessage =
      typeof json === "object" && json !== null && "error" in json
        ? (json as { error?: string }).error ?? `Request failed: ${res.status}`
        : `Request failed: ${res.status}`;
    const error = new Error(errMessage);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  return json as T;
}
