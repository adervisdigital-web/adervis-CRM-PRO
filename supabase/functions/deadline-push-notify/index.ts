import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called daily by pg_cron — no user JWT, verifies x-cron-secret header.
// Sends Web Push notifications for deals with deadlines today or tomorrow.

const CONTACT = "mailto:adervis.digital@gmail.com";

// ── Base64url helpers ──────────────────────────────────────────────────────────
function b64uDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
}
function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// ── VAPID JWT ──────────────────────────────────────────────────────────────────
async function vapidJWT(endpoint: string, pubKey: Uint8Array, privKeyRaw: Uint8Array): Promise<string> {
  const header  = b64uEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64uEncode(new TextEncoder().encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: CONTACT,
  })));
  const sigInput = `${header}.${payload}`;
  const x = b64uEncode(pubKey.slice(1, 33));
  const y = b64uEncode(pubKey.slice(33, 65));
  const d = b64uEncode(privKeyRaw);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(sigInput));
  return `${sigInput}.${b64uEncode(sig)}`;
}

// ── AES-128-GCM payload encryption (RFC 8291) ─────────────────────────────────
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k   = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const out = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8);
  return new Uint8Array(out);
}

async function encryptPayload(
  p256dh: string, authStr: string, payload: string,
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  const clientPub   = b64uDecode(p256dh);
  const authSecret  = b64uDecode(authStr);
  const plaintext   = new TextEncoder().encode(payload);
  const serverPair  = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverPair.publicKey));
  const clientKey   = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret  = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverPair.privateKey, 256));
  const ikmInfo     = concat(new TextEncoder().encode("WebPush: info\0"), clientPub, serverPubRaw);
  const ikm         = await hkdf(authSecret, ecdhSecret, ikmInfo, 32);
  const salt        = crypto.getRandomValues(new Uint8Array(16));
  const cek         = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce       = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const padded      = concat(plaintext, new Uint8Array([2]));
  const cekKey      = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher      = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, padded));
  const rs          = padded.length + 16;
  const rsBytes     = new Uint8Array([(rs >>> 24) & 0xff, (rs >>> 16) & 0xff, (rs >>> 8) & 0xff, rs & 0xff]);
  const body        = concat(salt, rsBytes, new Uint8Array([65]), serverPubRaw, cipher);
  return {
    body,
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type":     "application/octet-stream",
      "Content-Length":   String(body.length),
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const VAPID_PUB  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!VAPID_PUB || !VAPID_PRIV) {
    return new Response("VAPID keys not configured", { status: 500 });
  }

  const supabase  = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const pubRaw    = b64uDecode(VAPID_PUB);
  const privRaw   = b64uDecode(VAPID_PRIV);
  // Telegram — опционально: если токен не задан, эта часть просто пропускается,
  // веб-пуш продолжает работать как раньше (не завязываем одно на другое).
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

  const today    = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
  // Терминальные статусы вне активной воронки — синхронизировано с CRM_ARCHIVED в
  // app.js и isDealInactive() в telegram-webhook (см. finding-telegram-stats-archived-deals).
  const isInactive = (status: string) => status === "Завершённые" || status === "Архив";

  function esc(s: any) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function money(n: number) {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(n || 0);
  }
  function daysUntil(d: string) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((new Date(d).getTime() - now.getTime()) / 86_400_000);
  }
  async function sendTelegram(chatId: string, text: string) {
    if (!botToken) return;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
    } catch (e) { console.error("telegram send error:", e); }
  }

  // All agencies
  const { data: agencies } = await supabase.from("agency_state").select("id, state_json");
  if (!agencies?.length) return new Response(JSON.stringify({ notified: 0, telegramSent: 0, agencies: 0 }));

  let notified = 0;
  let telegramSent = 0;

  for (const agency of agencies) {
    const projects: any[] = agency.state_json?.savedProjects || [];
    const activeProjects = projects.filter((p) => !isInactive(p.crmStatus || ""));

    // Find active deals with deadline today or tomorrow (веб-пуш — без изменений)
    const upcoming = activeProjects.filter((p) => {
      if (!p.deadline || p.crmStatus === "Сдано") return false;
      return p.deadline === today || p.deadline === tomorrow;
    });

    if (upcoming.length) {
      // Get push subscriptions for this agency
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth_key")
        .eq("agency_id", agency.id);

      if (subs?.length) {
        // Build notification
        const todayDeals    = upcoming.filter((p) => p.deadline === today);
        const tomorrowDeals = upcoming.filter((p) => p.deadline === tomorrow);
        let bodyParts: string[] = [];
        if (todayDeals.length)    bodyParts.push(`Сегодня: ${todayDeals.map((p) => p.name).join(", ")}`);
        if (tomorrowDeals.length) bodyParts.push(`Завтра: ${tomorrowDeals.map((p) => p.name).join(", ")}`);
        const title   = `📅 Дедлайны — ${upcoming.length} ${upcoming.length === 1 ? "сделка" : "сделок"}`;
        const body    = bodyParts.join(". ");
        const payload = JSON.stringify({ title, body, url: "/" });

        // Send to all subscriptions for this agency
        for (const sub of subs) {
          try {
            const jwt = await vapidJWT(sub.endpoint, pubRaw, privRaw);
            const { body: encBody, headers: encHeaders } = await encryptPayload(sub.p256dh, sub.auth_key, payload);
            const resp = await fetch(sub.endpoint, {
              method: "POST",
              headers: { ...encHeaders, "Authorization": `vapid t=${jwt},k=${VAPID_PUB}`, "TTL": "3600" },
              body: encBody,
            });
            if (resp.ok || resp.status === 201) {
              notified++;
            } else if (resp.status === 410 || resp.status === 404) {
              // Subscription expired — clean up
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            } else {
              console.error(`push failed: ${resp.status} for agency ${agency.id}`);
            }
          } catch (e) {
            console.error("push send error:", e);
          }
        }
      }
    }

    // ── Telegram-дайджест: дедлайны (просрочено/скоро, шире окна пуша) + долг ──
    const recipients: any[] = (agency.state_json?.telegramChatIds || []).filter((r: any) => r.chatId);
    if (!botToken || !recipients.length) continue;

    const urgentDeals = activeProjects
      .filter((p) => p.deadline && p.crmStatus !== "Сдано")
      .map((p) => ({ p, days: daysUntil(p.deadline) }))
      .filter(({ days }) => days <= 7)
      .sort((a, b) => a.days - b.days);
    const debt = activeProjects.reduce((s, p) => s + Math.max(0, (p.total || 0) - (p.paid || 0)), 0);
    if (!urgentDeals.length && debt <= 0) continue;

    const lines: string[] = [];
    urgentDeals.forEach(({ p, days }) => {
      const icon = days < 0 ? "🔴" : days === 0 ? "🔥" : "⚡";
      const when = days < 0 ? `просрочено ${Math.abs(days)} дн.` : days === 0 ? "сегодня!" : `через ${days} дн.`;
      lines.push(`${icon} <b>${esc(p.name || "Проект")}</b> — ${when}${p.client ? ` · ${esc(p.client)}` : ""}`);
    });
    if (debt > 0) lines.push(`\n💰 Долг клиентов: <b>${money(debt)}</b>`);

    const text = `⏰ <b>Ежедневная сводка Adervis CRM</b>\n\n${lines.join("\n")}`;
    for (const r of recipients) {
      await sendTelegram(r.chatId, text);
      telegramSent++;
    }
  }

  return new Response(
    JSON.stringify({ notified, telegramSent, agencies: agencies.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
