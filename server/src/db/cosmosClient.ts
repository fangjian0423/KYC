import { CosmosClient, Container } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = process.env.COSMOS_DATABASE_NAME ?? 'KycCaseManagement';
const CONTAINER_NAME = process.env.COSMOS_CONTAINER_NAME ?? 'Cases';
const PARTITION_KEY = '/id';

/** Parse "AccountEndpoint=...;AccountKey=...;" into { endpoint, key } */
function parseConnectionString(cs: string): { endpoint: string; key?: string } {
  const endpoint = cs.match(/AccountEndpoint=([^;]+)/i)?.[1];
  const key = cs.match(/AccountKey=([^;]+)/i)?.[1];
  if (!endpoint) throw new Error('Invalid COSMOS_CONNECTION_STRING format (no AccountEndpoint).');
  return { endpoint, key };
}

let _container: Container | null = null;

export async function getContainer(): Promise<Container> {
  if (_container) return _container;

  // Prefer AAD (Managed Identity) when an explicit endpoint is provided — required
  // when the account has local (key) auth disabled. Fall back to connection-string
  // key auth for the local emulator / dev.
  const explicitEndpoint = process.env.COSMOS_ENDPOINT;
  const connectionString = process.env.COSMOS_CONNECTION_STRING;

  if (!explicitEndpoint && !connectionString) {
    throw new Error('Set COSMOS_ENDPOINT (AAD) or COSMOS_CONNECTION_STRING (key).');
  }

  const parsed = connectionString ? parseConnectionString(connectionString) : undefined;
  const endpoint = explicitEndpoint ?? parsed!.endpoint;
  const key = parsed?.key;

  // Use AAD when an explicit endpoint is set (production) or no key is available.
  const useAad = Boolean(explicitEndpoint) || !key;

  if (useAad) {
    // AAD data-plane auth can read/write items but cannot create databases/containers
    // — those are provisioned by infrastructure (Bicep). Reference them directly.
    const client = new CosmosClient({
      endpoint,
      aadCredentials: new DefaultAzureCredential(),
    });
    _container = client.database(DB_NAME).container(CONTAINER_NAME);
    return _container;
  }

  // Key auth (local emulator / dev): self-signed cert on the emulator.
  const isEmulator = process.env.COSMOS_EMULATOR === 'true';
  const agent = isEmulator ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  const client = new CosmosClient({ endpoint, key: key!, ...(agent ? { agent } : {}) });

  const { database } = await client.databases.createIfNotExists({ id: DB_NAME });
  const { container } = await database.containers.createIfNotExists({
    id: CONTAINER_NAME,
    partitionKey: { paths: [PARTITION_KEY] },
  });

  _container = container;
  return _container;
}

