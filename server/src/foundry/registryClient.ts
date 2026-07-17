/**
 * Corporate-registry client with automatic OAuth token management.
 *
 * openapi.it uses a two-tier credential model:
 *   • a long-lived **API key** (never expires) — stored in REGISTRY_API_KEY
 *   • short-lived **access tokens** exchanged from the API key on demand
 *
 * This module exchanges the API key (via HTTP Basic `email:apiKey`) for a scoped
 * access token, caches it, transparently refreshes it before expiry, and retries
 * once on a 401. The caller never sees or manages a token — set the API key once
 * and forget it.
 */
import { getRegistryConfiguration } from '../platform/registryConfiguration';
import type { RegistryConfiguration } from '../platform/types';

interface RegistryConfig {
  apiKey: string;
  email: string;
  tokenEndpoint: string;
  baseUrl: string;
  scope: string;
}

async function registryConfig(override?: RegistryConfiguration): Promise<RegistryConfig> {
  const saved = override ?? await getRegistryConfiguration();
  return {
    apiKey: process.env.REGISTRY_API_KEY ?? '',
    email: process.env.REGISTRY_EMAIL ?? '',
    tokenEndpoint: saved.tokenEndpoint,
    baseUrl: saved.baseUrl,
    scope: saved.scope,
  };
}

/** True when an API key + email are configured to reach the live registry. */
export async function isRegistryConfigured(): Promise<boolean> {
  const c = await registryConfig();
  return Boolean(c.apiKey && c.email);
}

interface CachedToken {
  token: string;
  /** Unix epoch seconds when the token expires. */
  expiresAt: number;
}

let cached: CachedToken | undefined;
let cachedConfigurationKey = '';

/** Refresh if we have no token or it expires within this many seconds. */
const EXPIRY_MARGIN_SECONDS = 60;

async function fetchToken(cfg: RegistryConfig): Promise<CachedToken> {
  const basic = Buffer.from(`${cfg.email}:${cfg.apiKey}`).toString('base64');
  const res = await fetch(cfg.tokenEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scopes: [cfg.scope], ttl: 3600 }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Registry token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text) as { token?: string; expire?: number; success?: boolean };
  if (!data.token) {
    throw new Error(`Registry token exchange returned no token: ${text.slice(0, 200)}`);
  }

  const expiresAt = data.expire ?? Math.floor(Date.now() / 1000) + 3600;
  console.log(
    `[registry] exchanged API key for access token (expires in ~${
      expiresAt - Math.floor(Date.now() / 1000)
    }s)`,
  );

  return {
    token: data.token,
    // Fall back to a 1h horizon if the API omits `expire`.
    expiresAt,
  };
}

/** Return a valid access token, exchanging/refreshing from the API key as needed. */
async function getToken(cfg: RegistryConfig, forceRefresh = false): Promise<string> {
  const configurationKey = `${cfg.email}|${cfg.tokenEndpoint}|${cfg.scope}`;
  if (configurationKey !== cachedConfigurationKey) {
    cached = undefined;
    cachedConfigurationKey = configurationKey;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && cached && cached.expiresAt - EXPIRY_MARGIN_SECONDS > now) {
    return cached.token;
  }
  cached = await fetchToken(cfg);
  return cached.token;
}

export interface RegistryLookup {
  countryCode: string;
  registrationNumber: string;
}

/**
 * Look up a corporate entity in the registry. Handles token acquisition and a
 * single automatic refresh-and-retry if the token was rejected (401/403).
 * Returns the parsed registry JSON. Throws on non-auth errors or repeated auth failure.
 */
export async function queryRegistry(
  lookup: RegistryLookup,
  configurationOverride?: RegistryConfiguration,
): Promise<unknown> {
  const configuration = configurationOverride ?? await getRegistryConfiguration();
  if (!configuration.enabled) throw new Error('The registry connector is disabled.');
  const cfg = await registryConfig(configuration);
  if (!cfg.apiKey || !cfg.email) {
    throw new Error('Registry not configured (REGISTRY_API_KEY / REGISTRY_EMAIL missing).');
  }

  const url = `${cfg.baseUrl}/WW-start/${encodeURIComponent(
    lookup.countryCode,
  )}/${encodeURIComponent(lookup.registrationNumber)}`;

  const call = async (token: string): Promise<Response> =>
    fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
    });

  let token = await getToken(cfg);
  let res = await call(token);

  // Auto-refresh once on auth failure (expired/rotated token).
  if (res.status === 401 || res.status === 403) {
    token = await getToken(cfg, /* forceRefresh */ true);
    res = await call(token);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Registry lookup failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return {
    provider: configuration.displayName,
    fieldMappings: configuration.fieldMappings,
    data: JSON.parse(text),
  };
}
