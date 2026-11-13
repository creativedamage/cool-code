// COOL Code — management API for the desktop app.
// Sign-in: Google (Workspace domain only). Every request after sign-in carries the
// Google ID token in `x-google-id-token`; this function verifies it on every call.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-cool-key, x-google-id-token",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ---------------------------------------------------------------- config
type Config = { clientId: string; clientSecret: string; domain: string; admins: string[] };
let configCache: { at: number; value: Config } | null = null;
async function config(): Promise<Config> {
  if (configCache && Date.now() - configCache.at < 60_000) return configCache.value;
  const { data, error } = await db.from("app_config").select("key, value");
  if (error) throw error;
  const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const value = {
    clientId: m.google_client_id ?? "",
    clientSecret: m.google_client_secret ?? "",
    domain: (m.allowed_domain ?? "").toLowerCase(),
    admins: (m.admin_emails ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean),
  };
  configCache = { at: Date.now(), value };
  return value;
}

// ---------------------------------------------------------------- identity
type User = { email: string; name: string; picture: string | null; isAdmin: boolean };

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyGoogleToken(idToken: string): Promise<User> {
  const cfg = await config();
  if (!cfg.clientId || !cfg.domain) throw new HttpError(503, "Google sign-in isn’t set up on the server yet.");
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: cfg.clientId,
    }));
  } catch {
    throw new HttpError(401, "Your sign-in expired. Please sign in again.");
  }
  const email = String(payload.email ?? "").toLowerCase();
  const hd = String(payload.hd ?? "").toLowerCase();
  if (!payload.email_verified || !email) throw new HttpError(403, "Your Google account email isn’t verified.");
  if (hd !== cfg.domain || !email.endsWith("@" + cfg.domain)) {
    throw new HttpError(403, `COOL Code is only for @${cfg.domain} accounts. You signed in as ${email}.`);
  }
  return {
    email,
    name: String(payload.name ?? email.split("@")[0]),
    picture: payload.picture ? String(payload.picture) : null,
    isAdmin: cfg.admins.includes(email),
  };
}

async function identify(req: Request): Promise<User> {
  const idToken = req.headers.get("x-google-id-token");
  if (idToken) return verifyGoogleToken(idToken);
  // Personal access key (interim sign-in before Google is set up, or maintenance scripts)
  const key = req.headers.get("x-cool-key") ?? "";
  if (key.length >= 20) {
    const { data } = await db.from("app_keys").select("label, email, name, is_admin").eq("key_hash", await sha256(key)).maybeSingle();
    if (data) {
      const cfg = await config();
      const email = (data.email ?? "").toLowerCase();
      return {
        email: email || "service@local",
        name: data.name ?? data.label ?? "Service",
        picture: null,
        isAdmin: !!data.is_admin || cfg.admins.includes(email),
      };
    }
  }
  throw new HttpError(401, "Please sign in with Google.");
}

async function touchUser(u: User) {
  if (u.email === "service@local") return;
  await db.from("app_users").upsert(
    { email: u.email, name: u.name, picture: u.picture, last_seen: new Date().toISOString() },
    { onConflict: "email" },
  );
}

// ---------------------------------------------------------------- Google token exchange
async function googleToken(params: Record<string, string>) {
  const cfg = await config();
  if (!cfg.clientId || !cfg.clientSecret) throw new HttpError(503, "Google sign-in isn’t set up on the server yet.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
  });
  const body = await res.json();
  if (!res.ok || !body.id_token) {
    const expired = body.error === "invalid_grant";
    throw new HttpError(401, expired ? "Your sign-in expired. Please sign in again." : "Google sign-in failed. Please try again.");
  }
  const user = await verifyGoogleToken(body.id_token);
  await touchUser(user);
  return { id_token: body.id_token, refresh_token: body.refresh_token ?? null, expires_in: body.expires_in ?? 3600, user };
}

// ---------------------------------------------------------------- helpers
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomSlug(n = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}
function validUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
const shortUrl = (slug: string) => `${SUPABASE_URL}/functions/v1/s/${slug}`;
const canEdit = (u: User, link: { created_by_email: string | null }) =>
  u.isAdmin || (!!link.created_by_email && link.created_by_email === u.email);
// deno-lint-ignore no-explicit-any
const shape = (u: User, l: any) => ({ ...l, short_url: shortUrl(l.slug), can_edit: canEdit(u, l) });

async function requireEditable(u: User, id: unknown) {
  const { data, error } = await db.from("links").select("id, created_by_email, created_by_name").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "That code no longer exists.");
  if (!canEdit(u, data)) {
    throw new HttpError(403, `Only ${data.created_by_name || data.created_by_email || "its creator"} or an admin can change this code.`);
  }
  return data;
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    // ---- Public: sign-in plumbing
    if (body.action === "auth_config") {
      const cfg = await config();
      return json({ client_id: cfg.clientId, domain: cfg.domain, ready: !!(cfg.clientId && cfg.clientSecret && cfg.domain) });
    }
    if (body.action === "auth_exchange") {
      const { code, code_verifier, redirect_uri } = body as Record<string, string>;
      if (!code || !code_verifier || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?/.test(redirect_uri ?? "")) {
        return json({ error: "Invalid sign-in request" }, 400);
      }
      return json(await googleToken({ grant_type: "authorization_code", code, code_verifier, redirect_uri }));
    }
    if (body.action === "auth_refresh") {
      if (typeof body.refresh_token !== "string") return json({ error: "Missing refresh token" }, 400);
      return json(await googleToken({ grant_type: "refresh_token", refresh_token: body.refresh_token }));
    }

    // ---- Everything else needs a signed-in @domain user
    const user = await identify(req);

    switch (body.action) {
      case "ping":
      case "me":
        await touchUser(user);
        return json({ ok: true, user, base: `${SUPABASE_URL}/functions/v1/s/` });

      case "list": {
        const { data, error } = await db.rpc("link_summaries");
        if (error) throw error;
        // deno-lint-ignore no-explicit-any
        return json({ links: data.map((l: any) => shape(user, l)), me: user });
      }

      case "team": {
        const [{ data: links, error: e1 }, { data: people, error: e2 }] = await Promise.all([
          db.rpc("link_summaries"),
          db.from("app_users").select("email, name, picture, last_seen"),
        ]);
        if (e1 || e2) throw e1 ?? e2;
        const by: Record<string, { email: string; name: string; picture: string | null; codes: number; scans: number; last7: number; last_seen: string | null }> = {};
        for (const p of people ?? []) by[p.email] = { ...p, codes: 0, scans: 0, last7: 0 };
        // deno-lint-ignore no-explicit-any
        for (const l of (links ?? []) as any[]) {
          const k = l.created_by_email ?? "—";
          by[k] ??= { email: k, name: l.created_by_name ?? "Unassigned", picture: null, codes: 0, scans: 0, last7: 0, last_seen: null };
          by[k].codes++;
          by[k].scans += Number(l.total);
          by[k].last7 += Number(l.last7);
        }
        return json({ people: Object.values(by).sort((a, b) => b.scans - a.scans || b.codes - a.codes) });
      }

      case "create": {
        const target = validUrl(body.target_url);
        if (!target) return json({ error: "Destination must be a full http(s) link" }, 400);
        const name = typeof body.name === "string" ? body.name.slice(0, 120) : null;
        for (let i = 0; i < 6; i++) {
          const slug = randomSlug(i < 3 ? 6 : 8);
          const { data, error } = await db.from("links").insert({
            slug, name, target_url: target,
            created_by_email: user.email === "service@local" ? null : user.email,
            created_by_name: user.email === "service@local" ? null : user.name,
          }).select().single();
          if (!error) return json({ link: shape(user, data) });
          if (error.code !== "23505") throw error;
        }
        return json({ error: "Could not allocate a short code" }, 500);
      }

      case "update": {
        await requireEditable(user, body.id);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.target_url !== undefined) {
          const t = validUrl(body.target_url);
          if (!t) return json({ error: "Destination must be a full http(s) link" }, 400);
          patch.target_url = t;
        }
        if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
        if (typeof body.archived === "boolean") patch.archived = body.archived;
        if (body.claim === true && user.isAdmin) { patch.created_by_email = user.email; patch.created_by_name = user.name; }
        const { data, error } = await db.from("links").update(patch).eq("id", body.id).select().single();
        if (error) throw error;
        return json({ link: shape(user, data) });
      }

      case "delete": {
        await requireEditable(user, body.id);
        const { error } = await db.from("links").delete().eq("id", body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "stats": {
        const id = body.id as string;
        const days = Math.min(365, Math.max(7, Number(body.days) || 30));
        const tz = typeof body.tz === "string" ? body.tz : "UTC";
        const since = new Date(Date.now() - days * 864e5).toISOString();
        const [daily, recent, breakdown] = await Promise.all([
          db.rpc("link_daily", { p_link: id, p_days: days, p_tz: tz }),
          db.from("scans").select("scanned_at, device, os, country")
            .eq("link_id", id).eq("is_bot", false).order("scanned_at", { ascending: false }).limit(25),
          db.from("scans").select("device, os, country")
            .eq("link_id", id).eq("is_bot", false).gte("scanned_at", since).limit(50000),
        ]);
        for (const r of [daily, recent, breakdown]) if (r.error) throw r.error;
        const tally = (k: "device" | "os" | "country") => {
          const m: Record<string, number> = {};
          for (const row of breakdown.data!) {
            const v = (row as Record<string, string | null>)[k] || "Unknown";
            m[v] = (m[v] ?? 0) + 1;
          }
          return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
        };
        return json({ daily: daily.data, recent: recent.data, devices: tally("device"), os: tally("os"), countries: tally("country") });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: (e as Error).message ?? "Server error" }, 500);
  }
});
