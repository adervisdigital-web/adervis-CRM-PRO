import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deployed with --no-verify-jwt: Google redirects the browser here directly,
// no Supabase JWT is sent. CSRF/replay protection comes from the single-use
// `state` row in google_oauth_states (inserted by google-calendar-connect,
// consumed and deleted here).

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.adervis.ru";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirect(`${appUrl}/?google_calendar_error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return redirect(`${appUrl}/?google_calendar_error=missing_params`);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: stateRow, error: stateError } = await admin
      .from("google_oauth_states")
      .delete()
      .eq("state", state)
      .select("user_id, created_at")
      .single();

    if (stateError || !stateRow) {
      return redirect(`${appUrl}/?google_calendar_error=invalid_state`);
    }

    const ageMs = Date.now() - new Date(stateRow.created_at).getTime();
    if (ageMs > 10 * 60 * 1000) {
      return redirect(`${appUrl}/?google_calendar_error=expired_state`);
    }

    const redirectUri = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/google-calendar-callback`;

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      console.error("google-calendar-callback: token exchange failed", await tokenResp.text());
      return redirect(`${appUrl}/?google_calendar_error=token_exchange`);
    }

    const tokenData = await tokenResp.json();
    const refreshToken: string | undefined = tokenData.refresh_token;
    const accessToken: string | undefined = tokenData.access_token;
    const expiresIn: number = Number(tokenData.expires_in) || 3600;

    if (!refreshToken) {
      // Google не возвращает refresh_token, если пользователь уже давал согласие
      // без prompt=consent — но мы всегда шлём prompt=consent, так что это
      // сигнализирует о реальной проблеме, а не штатном повторном логине.
      console.error("google-calendar-callback: no refresh_token in response", tokenData);
      return redirect(`${appUrl}/?google_calendar_error=no_refresh_token`);
    }

    let email = "";
    const idToken: string | undefined = tokenData.id_token;
    if (idToken) {
      try {
        const payloadB64 = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(payloadB64));
        email = payload.email || "";
      } catch {
        // не критично — просто не покажем email в UI
      }
    }

    const { error: upsertError } = await admin
      .from("google_calendar_connections")
      .upsert({
        user_id: stateRow.user_id,
        google_email: email,
        refresh_token: refreshToken,
        access_token: accessToken,
        access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        calendar_id: "primary",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("google-calendar-callback: upsert failed", upsertError);
      return redirect(`${appUrl}/?google_calendar_error=save_failed`);
    }

    return redirect(`${appUrl}/?google_connected=1`);
  } catch (e) {
    console.error("google-calendar-callback:", e);
    return redirect(`${appUrl}/?google_calendar_error=unknown`);
  }
});

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
