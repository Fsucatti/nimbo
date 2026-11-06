/**
 * The site is static. This Worker only answers /api/where, which tells a first-time visitor
 * roughly where they are (from Cloudflare's view of their connection), so the app can open
 * on their city without asking for location access. Nothing is stored.
 */

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** The subset of Cloudflare's request.cf object this Worker reads. */
interface CfProperties {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
}

export interface WhereResponse {
  name: string;
  region?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // The answer depends on the visitor, so no shared cache may keep it.
  "cache-control": "private, no-store",
};

function where(request: Request): Response {
  const cf = (request as Request & { cf?: CfProperties }).cf;
  const latitude = Number(cf?.latitude);
  const longitude = Number(cf?.longitude);
  if (!cf || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return new Response(JSON.stringify(null), { headers: JSON_HEADERS });
  }
  const body: WhereResponse = {
    name: cf.city || cf.region || "Your area",
    region: cf.city ? cf.region : undefined,
    countryCode: cf.country,
    latitude,
    longitude,
    timezone: cf.timezone,
  };
  return new Response(JSON.stringify(body), { headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/where") {
      if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
      return where(request);
    }
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
    }
    return env.ASSETS.fetch(request);
  },
};
