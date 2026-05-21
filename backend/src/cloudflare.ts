import { config } from "./config.js";

export type CloudflareError = {
  status: number;
  message: string;
};

export type CloudflareDnsRecord = {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
};

function isCloudflareConfigured(): boolean {
  return Boolean(config.cloudflareApiToken && config.cloudflareZoneId);
}

async function callCloudflare<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!isCloudflareConfigured()) {
    const err: CloudflareError = {
      status: 503,
      message: "Cloudflare integration not configured (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID)."
    };
    throw err;
  }

  const res = await fetch(`${config.cloudflareApiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.cloudflareApiToken}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = (await res.json()) as {
    success: boolean;
    result: T;
    errors?: Array<{ code: number; message: string }>;
  };

  if (!res.ok || !json.success) {
    const message = json.errors?.[0]?.message ?? `Cloudflare API ${res.status}`;
    const err: CloudflareError = { status: res.status, message };
    throw err;
  }

  return json.result;
}

export function cloudflareConfigured(): boolean {
  return isCloudflareConfigured();
}

export async function listDnsRecords(): Promise<CloudflareDnsRecord[]> {
  return callCloudflare<CloudflareDnsRecord[]>(
    "GET",
    `/zones/${config.cloudflareZoneId}/dns_records?per_page=100`
  );
}

export async function createDnsRecord(input: {
  name: string;
  type: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
}): Promise<CloudflareDnsRecord> {
  return callCloudflare<CloudflareDnsRecord>(
    "POST",
    `/zones/${config.cloudflareZoneId}/dns_records`,
    {
      name: input.name,
      type: input.type,
      content: input.content,
      proxied: input.proxied ?? true,
      ttl: input.ttl ?? 1
    }
  );
}

export async function deleteDnsRecord(id: string): Promise<{ id: string }> {
  return callCloudflare<{ id: string }>(
    "DELETE",
    `/zones/${config.cloudflareZoneId}/dns_records/${id}`
  );
}

export function isCloudflareError(e: unknown): e is CloudflareError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as CloudflareError).status === "number" &&
    typeof (e as CloudflareError).message === "string"
  );
}
