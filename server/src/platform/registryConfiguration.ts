import type { RegistryConfiguration, RegistryFieldMappings } from './types';
import { getPlatformDocument, savePlatformDocument } from './store';

const DEFAULT_MAPPINGS: RegistryFieldMappings = {
  legalName: 'company.legalName',
  registrationNumber: 'company.vatCode',
  shareholders: 'ownership.shareholders[]',
  equityPercentage: 'ownership.equityPercentage',
};

function credentialsConfigured(): boolean {
  return Boolean(process.env.REGISTRY_API_KEY && process.env.REGISTRY_EMAIL);
}

function defaultConfiguration(): RegistryConfiguration {
  return {
    id: 'registry-configuration',
    kind: 'registry-configuration',
    provider: 'custom-openapi',
    displayName: 'Custom OpenAPI',
    baseUrl: process.env.REGISTRY_BASE_URL ?? 'https://test.company.openapi.com',
    tokenEndpoint: process.env.REGISTRY_TOKEN_ENDPOINT ?? 'https://test.oauth.openapi.it/token',
    scope: process.env.REGISTRY_SCOPE ?? 'GET:test.company.openapi.com/WW-start',
    region: 'EU',
    authMethod: 'oauth2_exchange',
    fieldMappings: DEFAULT_MAPPINGS,
    enabled: true,
    credentialConfigured: credentialsConfigured(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getRegistryConfiguration(): Promise<RegistryConfiguration> {
  const saved = await getPlatformDocument<RegistryConfiguration>('registry-configuration');
  return saved
    ? { ...saved, credentialConfigured: credentialsConfigured() }
    : defaultConfiguration();
}

function validateUrl(value: unknown, label: string): URL {
  if (typeof value !== 'string') throw Object.assign(new Error(`${label} is required.`), { statusCode: 400 });
  let url: URL;
  try { url = new URL(value); }
  catch { throw Object.assign(new Error(`${label} must be a valid URL.`), { statusCode: 400 }); }
  if (url.protocol !== 'https:') {
    throw Object.assign(new Error(`${label} must use HTTPS.`), { statusCode: 400 });
  }
  return url;
}

function assertAllowedRegistryHost(url: URL): void {
  const allowed = (process.env.REGISTRY_ALLOWED_HOSTS ?? 'test.company.openapi.com,company.openapi.com')
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(url.hostname.toLowerCase())) {
    throw Object.assign(new Error(`Registry host ${url.hostname} is not in REGISTRY_ALLOWED_HOSTS.`), { statusCode: 400 });
  }
}

export async function validateRegistryConfiguration(input: unknown): Promise<RegistryConfiguration> {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('Registry configuration is required.'), { statusCode: 400 });
  }
  const body = input as Partial<RegistryConfiguration>;
  const current = await getRegistryConfiguration();
  const baseUrl = validateUrl(body.baseUrl, 'Base URL');
  assertAllowedRegistryHost(baseUrl);

  const region = body.region;
  if (region !== 'EU' && region !== 'UK' && region !== 'US') {
    throw Object.assign(new Error('Region must be EU, UK, or US.'), { statusCode: 400 });
  }
  const mappingKeys: Array<keyof RegistryFieldMappings> = [
    'legalName', 'registrationNumber', 'shareholders', 'equityPercentage',
  ];
  if (!body.fieldMappings || mappingKeys.some((key) => {
    const value = body.fieldMappings?.[key];
    return typeof value !== 'string' || !/^[A-Za-z0-9_.\[\]-]{1,160}$/.test(value);
  })) {
    throw Object.assign(new Error('Every registry field mapping is required.'), { statusCode: 400 });
  }

  return {
    ...current,
    baseUrl: baseUrl.toString().replace(/\/$/, ''),
    region,
    fieldMappings: body.fieldMappings,
    enabled: body.enabled !== false,
    credentialConfigured: credentialsConfigured(),
    updatedAt: new Date().toISOString(),
  };
}

export async function saveRegistryConfiguration(configuration: RegistryConfiguration): Promise<RegistryConfiguration> {
  return savePlatformDocument(configuration);
}