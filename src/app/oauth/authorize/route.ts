import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail, isSameOriginPost } from "@/lib/auth";
import { getOAuthClient, isRegisteredRedirectUri, createAuthorizationCode } from "@/lib/oauth";
import { API_SCOPES, type GrantedScope } from "@/lib/apiScopes";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_NAME } from "@/config/brand";

function htmlPage(body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(SITE_NAME)} -- Connect</title>
      <style>
        body { font-family: -apple-system, system-ui, sans-serif; background: #f7f4f0; color: #0a0a0a; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
        .card { max-width: 420px; padding: 32px; background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
        h1 { font-size: 20px; margin: 0 0 12px; }
        p { font-size: 14px; color: #555; line-height: 1.5; }
        ul { font-size: 13px; color: #555; padding-left: 18px; }
        .row { display: flex; gap: 12px; margin-top: 20px; }
        button, a.btn { flex: 1; text-align: center; padding: 10px 16px; border-radius: 999px; font-size: 14px; font-weight: 500; border: none; cursor: pointer; text-decoration: none; }
        .approve { background: #0a0a0a; color: #fff; }
        .deny { background: #eee; color: #0a0a0a; }
      </style>
    </head><body><div class="card">${body}</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

type Validated = { clientId: string; redirectUri: string; codeChallenge: string; scopes: GrantedScope[]; state: string | null };

/** Re-validated identically by GET (to render the consent screen) and
 * POST (to actually act on it) -- never trust the hidden form fields
 * without redoing every check, since they round-trip through the
 * browser. Returns an error Response if anything doesn't check out, or
 * the validated grant if it does. */
async function validate(params: URLSearchParams): Promise<Validated | NextResponse> {
  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const responseType = params.get("response_type");
  const codeChallenge = params.get("code_challenge") || "";
  const codeChallengeMethod = params.get("code_challenge_method");
  const state = params.get("state");

  const client = clientId ? await getOAuthClient(clientId) : null;
  if (!client) return htmlPage(`<h1>Unknown client</h1><p>This connection request isn't from a registered client.</p>`);
  if (!redirectUri || !isRegisteredRedirectUri(client, redirectUri)) {
    return htmlPage(`<h1>Redirect mismatch</h1><p>This request's redirect address doesn't match what the client registered. Refusing to continue.</p>`);
  }

  // From here on redirectUri is confirmed registered, so errors can be
  // reported back to the client via redirect per the OAuth spec.
  const fail = (error: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url, 302);
  };
  if (responseType !== "code") return fail("unsupported_response_type");
  if (codeChallengeMethod !== "S256" || !codeChallenge) return fail("invalid_request");

  const requestedScopes = (params.get("scope") || "").split(/\s+/).filter(Boolean);
  const validScopes: readonly string[] = API_SCOPES;
  const scopes: GrantedScope[] | null =
    requestedScopes.length === 0
      ? ["*"]
      : requestedScopes.every((s) => s === "*" || validScopes.includes(s))
        ? (requestedScopes as GrantedScope[])
        : null;
  if (!scopes) return fail("invalid_scope");

  return { clientId, redirectUri, codeChallenge, scopes, state };
}

export async function GET(req: NextRequest) {
  const result = await validate(req.nextUrl.searchParams);
  if (result instanceof NextResponse) return result;

  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) {
    return htmlPage(
      `<h1>Log in first</h1>
       <p>You need an active console session before approving this connection.</p>
       <a class="btn approve" href="/console/login">Log into the console</a>
       <p style="margin-top:16px">Once you're logged in, go back to the app you were connecting and try again.</p>`
    );
  }

  const scopeLabel = result.scopes.includes("*") ? "Full access -- everything this API can do" : result.scopes.join(", ");
  const redirectHost = new URL(result.redirectUri).host;
  const hidden = [
    ["client_id", result.clientId],
    ["redirect_uri", result.redirectUri],
    ["code_challenge", result.codeChallenge],
    ["scope", result.scopes.join(" ")],
    ["state", result.state || ""],
  ]
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join("");

  return htmlPage(
    `<h1>Connect to ${escapeHtml(SITE_NAME)}</h1>
     <p><strong>${escapeHtml(redirectHost)}</strong> wants to connect as <strong>${escapeHtml(adminEmail)}</strong> with:</p>
     <ul><li>${escapeHtml(scopeLabel)}</li></ul>
     <form method="POST" action="/oauth/authorize">
       ${hidden}
       <div class="row">
         <button class="deny" name="decision" value="deny" type="submit">Deny</button>
         <button class="approve" name="decision" value="approve" type="submit">Approve</button>
       </div>
     </form>`
  );
}

export async function POST(req: NextRequest) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const params = new URLSearchParams();
  for (const key of ["client_id", "redirect_uri", "code_challenge", "scope", "state"]) {
    const value = form.get(key);
    if (typeof value === "string") params.set(key, value);
  }
  params.set("response_type", "code");
  params.set("code_challenge_method", "S256");

  const result = await validate(params);
  if (result instanceof NextResponse) return result;

  const url = new URL(result.redirectUri);
  if (form.get("decision") !== "approve") {
    url.searchParams.set("error", "access_denied");
    if (result.state) url.searchParams.set("state", result.state);
    return NextResponse.redirect(url, 302);
  }

  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "access_denied", error_description: "Session expired." }, { status: 401 });

  const code = await createAuthorizationCode({
    clientId: result.clientId,
    redirectUri: result.redirectUri,
    codeChallenge: result.codeChallenge,
    scopes: result.scopes,
    adminEmail,
  });
  url.searchParams.set("code", code);
  if (result.state) url.searchParams.set("state", result.state);
  return NextResponse.redirect(url, 302);
}
