import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Web Push (RFC 8030 + RFC 8291 + RFC 8292)
// — VAPID JWT signing (ES256)
// — AES-128-GCM payload encryption

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTACT = "mailto:adervis.digital@gmail.com";

// ── Base64url helpers ──────────────────────────────────────────────────────────
function b64uDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), c => c.charCodeAt(0));
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

// ── VAPID JWT (RFC 8292) ───────────────────────────────────────────────────────
async function vapidJWT(endpoint: string, pubKey: Uint8Array, privKeyRaw: Uint8Array): Promise<string> {
  const header  = b64uEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64uEncode(new TextEncoder().encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: CONTACT,
  })));
  const sigInput = `${header}.${payload}`;

  // Import private key as JWK (need x,y from public + d from private)
  const x = b64uEncode(pubKey.slice(1, 33));
  const y = b64uEncode(pubKey.slice(33, 65));
  const d = b64uEncode(privKeyRaw);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(sigInput),
  );
  return `${sigInput}.${b64uEncode(sig)}`;
}

// ── AES-128-GCM payload encryption (RFC 8291) ─────────────────────────────────
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k   = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const out = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8);
  return new Uint8Array(out);
}

async function encryptPayload(
  p256dh: string,
  authStr: string,
  payload: string,
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  const clientPub  = b64uDecode(p256dh);
  const authSecret = b64uDecode(authStr);
  const plaintext  = new TextEncoder().encode(payload);

  // Server ephemeral ECDH key pair
  const serverPair  = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverPair.publicKey));

  // ECDH shared secret
  const clientKey   = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret  = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverPair.privateKey, 256));

  // IKM = HKDF(salt=authSecret, IKM=ecdhSecret, info="WebPush: info\0" + clientPub + serverPub)
  const ikmInfo = concat(new TextEncoder().encode("WebPush: info\0"), clientPub, serverPubRaw);
  const ikm     = await hkdf(authSecret, ecdhSecret, ikmInfo, 32);

  const salt    = crypto.getRandomValues(new Uint8Array(16));

  // CEK and Nonce via HKDF
  const cek   = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  // Encrypt: plaintext + 0x02 delimiter
  const padded  = concat(plaintext, new Uint8Array([2]));
  const cekKey  = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher  = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, padded));

  // aes128gcm record: salt(16) + rs(4) + idlen(1) + serverPub(65) + ciphertext
  const rs     = padded.length + 16; // content + GCM tag
  const rsBytes = new Uint8Array([(rs >>> 24) & 0xff, (rs >>> 16) & 0xff, (rs >>> 8) & 0xff, rs & 0xff]);
  const body   = concat(salt, rsBytes, new Uint8Array([65]), serverPubRaw, cipher);

  return {
    body,
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type":     "application/octet-stream",
      "Content-Length":   String(body.length),
    },
  };
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors, status: 204 });
  if (req.method !== "POST")    return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader)              return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user)         return json({ error: "Unauthorized" }, 401);

  const { agencyId, title = "Adervis CRM", body = "Новое уведомление", url = "/" } = await req.json();
  if (!agencyId)                return json({ error: "agencyId required" }, 400);

  const VAPID_PUB  = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY")!;
  if (!VAPID_PUB || !VAPID_PRIV) return json({ error: "VAPID keys not configured" }, 500);

  const pubRaw  = b64uDecode(VAPID_PUB);
  const privRaw = b64uDecode(VAPID_PRIV);

  // Load all subscriptions for this agency
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("agency_id", agencyId);

  if (!subs || subs.length === 0) return json({ sent: 0, failed: 0 });

  const payload = JSON.stringify({ title, body, url });
  let sent = 0, failed = 0;

  await Promise.all(subs.map(async (sub) => {
    try {
      const jwt = await vapidJWT(sub.endpoint, pubRaw, privRaw);
      const { body: encBody, headers: encHeaders } = await encryptPayload(sub.p256dh, sub.auth_key, payload);

      const resp = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          ...encHeaders,
          "Authorization": `vapid t=${jwt},k=${VAPID_PUB}`,
          "TTL": "86400",
        },
        body: encBody,
      });

      if (resp.ok || resp.status === 201) {
        sent++;
      } else {
        failed++;
        // 410 Gone / 404 Not Found — подписка устарела, удаляем
        if (resp.status === 410 || resp.status === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    } catch (e) {
      console.error("push send error:", e);
      failed++;
    }
  }));

  return json({ sent, failed });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
