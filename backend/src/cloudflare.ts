import { config } from "./config.js";
import { findCloudflareZone, listCloudflareZones as listCloudflareZoneRows } from "./database.js";

export type CloudflareError = {
  status: number;
  message: string;
};

export type CloudflareZone = {
  id: string;
  name: string;
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

function isCloudflareConfigured(zoneId?: string): boolean {
  if (!config.cloudflareApiToken) return false;
  if (!listCloudflareZoneRows().length) return false;
  if (zoneId) {
    return Boolean(findCloudflareZone(zoneId));
  }
  return true;
}

async function callCloudflare<T>(
  method: string,
  path: string,
  zoneId: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!isCloudflareConfigured(zoneId)) {
    const err: CloudflareError = {
      status: 503,
      message: "Cloudflare integration not configured (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONES)."
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

export function cloudflareConfigured(zoneId?: string): boolean {
  return isCloudflareConfigured(zoneId);
}

export function listCloudflareZones(): CloudflareZone[] {
  return listCloudflareZoneRows();
}

export function resolveCloudflareZone(zoneId?: string): CloudflareZone | undefined {
  const zones = listCloudflareZoneRows();
  if (!zones.length) return undefined;
  if (zoneId) {
    return zones.find((zone) => zone.id === zoneId);
  }
  return zones[0];
}

export async function listDnsRecords(zoneId?: string): Promise<CloudflareDnsRecord[]> {
  const zone = resolveCloudflareZone(zoneId);
  if (!zone) {
    const err: CloudflareError = {
      status: 503,
      message: "Cloudflare integration not configured (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONES)."
    };
    throw err;
  }
  return callCloudflare<CloudflareDnsRecord[]>(
    "GET",
    `/zones/${zone.id}/dns_records?per_page=100`,
    zone.id
  );
}

export async function getCloudflareZone(zoneId: string): Promise<CloudflareZone> {
  const zone = resolveCloudflareZone(zoneId);
  if (!zone) {
    const err: CloudflareError = {
      status: 503,
      message: "Cloudflare integration not configured (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONES)."
    };
    throw err;
  }
  // Probe via DNS list (works w/ account-level `DNS View` tokens that lack `Zone:Read`).
  // If listing succeeds, the token can do everything our app needs on this zone.
  try {
    await callCloudflare<CloudflareDnsRecord[]>(
      "GET",
      `/zones/${zone.id}/dns_records?per_page=1`,
      zone.id
    );
    return { id: zone.id, name: zone.name, status: "active" } as CloudflareZone;
  } catch (e) {
    // Fall back to /zones/:id (requires Zone:Read). If that also fails, surface the error.
    try {
      return await callCloudflare<CloudflareZone>("GET", `/zones/${zone.id}`, zone.id);
    } catch {
      throw e;
    }
  }
}

export async function createDnsRecord(input: {
  zoneId: string;
  name: string;
  type: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
}): Promise<CloudflareDnsRecord> {
  const zone = resolveCloudflareZone(input.zoneId);
  if (!zone) {
    const err: CloudflareError = {
      status: 503,
      message: "Cloudflare integration not configured (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONES)."
    };
    throw err;
  }
  return callCloudflare<CloudflareDnsRecord>(
    "POST",
    `/zones/${zone.id}/dns_records`,
    zone.id,
    {
      name: input.name,
      type: input.type,
      content: input.content,
      proxied: input.proxied ?? true,
      ttl: input.ttl ?? 1
    }
  );
}

export async function deleteDnsRecord(zoneId: string, id: string): Promise<{ id: string }> {
  const zone = resolveCloudflareZone(zoneId);
  if (!zone) {
    const err: CloudflareError = {
      status: 503,
      message: "Cloudflare integration not configured (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONES)."
    };
    throw err;
  }
  return callCloudflare<{ id: string }>(
    "DELETE",
    `/zones/${zone.id}/dns_records/${id}`,
    zone.id
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
