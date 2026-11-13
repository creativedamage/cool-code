// COOL Code — scan redirect.
// GET /functions/v1/s/<slug>  ->  logs the scan, then 302-redirects to the link's destination.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora|pinterest|slack|discord|telegram|whatsapp|skype|vkshare|w3c_validator|curl|wget|python-requests|httpclient|headless|lighthouse|monitor|uptime/i;

function parseUA(ua: string) {
  let os = "Other";
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  let device = "Desktop";
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = "Tablet";
  else if (/Mobi|iPhone|iPod|Android/i.test(ua)) device = "Phone";
  return { os, device };
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const page = (title: string, msg: string, status: number) =>
  new Response(`${title}\n\n${msg}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return page("Method not allowed", "", 405);

  const slug = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(slug)) return page("COOL Code", "This QR link is not valid.", 404);

  const { data: link, error } = await db
    .from("links")
    .select("id, target_url, archived")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return page("COOL Code", "Something went wrong. Please try again.", 500);
  if (!link || link.archived) return page("COOL Code", "This QR link is no longer active.", 404);

  // Record the scan without delaying the redirect
  if (req.method === "GET") {
    const ua = req.headers.get("user-agent") ?? "";
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") || "";
    const country = req.headers.get("cf-ipcountry") || req.headers.get("x-country") || null;
    const day = new Date().toISOString().slice(0, 10);
    const record = (async () => {
      const { os, device } = parseUA(ua);
      await db.from("scans").insert({
        link_id: link.id,
        os,
        device,
        country: country && country !== "XX" ? country : null,
        visitor_hash: await sha256(`${ip}|${ua}|${day}`), // anonymous, rotates daily
        is_bot: !ua || BOT_RE.test(ua),
      });
    })().catch((e) => console.error("scan log failed", e));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(record);
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: link.target_url,
      "cache-control": "no-store, max-age=0",
      "referrer-policy": "no-referrer",
    },
  });
});
