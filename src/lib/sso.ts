import { decodeJwt } from "jose";

export type SsoProvider = "google" | "github" | "linkedin";

export const SSO_PROVIDERS: SsoProvider[] = ["google", "github", "linkedin"];

export function isSsoProvider(value: string): value is SsoProvider {
  return (SSO_PROVIDERS as string[]).includes(value);
}

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
};

const CONFIG: Record<SsoProvider, ProviderConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  linkedin: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile email",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
};

function clientId(provider: SsoProvider): string {
  const value = process.env[CONFIG[provider].clientIdEnv];
  if (!value) throw new Error(`${CONFIG[provider].clientIdEnv} is not set`);
  return value;
}

function clientSecret(provider: SsoProvider): string {
  const value = process.env[CONFIG[provider].clientSecretEnv];
  if (!value) throw new Error(`${CONFIG[provider].clientSecretEnv} is not set`);
  return value;
}

export function buildAuthorizeUrl(provider: SsoProvider, redirectUri: string, state: string): string {
  const url = new URL(CONFIG[provider].authorizeUrl);
  url.searchParams.set("client_id", clientId(provider));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CONFIG[provider].scope);
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = { accessToken: string; idToken?: string };

export async function exchangeCodeForToken(
  provider: SsoProvider,
  code: string,
  redirectUri: string,
): Promise<TokenResponse | null> {
  const body = new URLSearchParams({
    client_id: clientId(provider),
    client_secret: clientSecret(provider),
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(CONFIG[provider].tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || typeof data.access_token !== "string") return null;
  return { accessToken: data.access_token, idToken: typeof data.id_token === "string" ? data.id_token : undefined };
}

export type SsoProfile = {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

/** Decodes an OIDC id_token without re-verifying its signature -- safe here
 * because it arrives over a direct server-to-server TLS call to the
 * provider's own token endpoint, never passed through the browser. */
function profileFromIdToken(idToken: string): SsoProfile | null {
  try {
    const claims = decodeJwt(idToken);
    if (typeof claims.sub !== "string" || typeof claims.email !== "string") return null;
    return {
      providerUserId: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      name: typeof claims.name === "string" ? claims.name : null,
    };
  } catch {
    return null;
  }
}

async function fetchGithubProfile(accessToken: string): Promise<SsoProfile | null> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "indishmarketer.com" };
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) return null;
  const user = await userRes.json().catch(() => null);
  if (!user || typeof user.id === "undefined") return null;

  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
  const emails = emailsRes.ok ? await emailsRes.json().catch(() => []) : [];
  const primary = Array.isArray(emails)
    ? emails.find((e: { primary?: boolean; verified?: boolean }) => e.primary && e.verified)
    : null;
  if (!primary) return null;

  return {
    providerUserId: String(user.id),
    email: primary.email,
    emailVerified: true,
    name: typeof user.name === "string" && user.name.trim() ? user.name : (typeof user.login === "string" ? user.login : null),
  };
}

export async function fetchSsoProfile(provider: SsoProvider, tokens: TokenResponse): Promise<SsoProfile | null> {
  if (provider === "github") return fetchGithubProfile(tokens.accessToken);
  if (!tokens.idToken) return null;
  return profileFromIdToken(tokens.idToken);
}
