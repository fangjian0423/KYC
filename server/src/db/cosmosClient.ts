import { CosmosClient, Container } from '@azure/cosmos';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = 'KycCaseManagement';
const CONTAINER_NAME = 'Cases';
const PARTITION_KEY = '/id';

/** Parse "AccountEndpoint=...;AccountKey=...;" into { endpoint, key } */
function parseConnectionString(cs: string): { endpoint: string; key: string } {
  const endpoint = cs.match(/AccountEndpoint=([^;]+)/i)?.[1];
  const key = cs.match(/AccountKey=([^;]+)/i)?.[1];
  if (!endpoint || !key) throw new Error('Invalid COSMOS_CONNECTION_STRING format.');
  return { endpoint, key };
}

let _container: Container | null = null;

export async function getContainer(): Promise<Container> {
  if (_container) return _container;

  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('COSMOS_CONNECTION_STRING environment variable is not set.');
  }

  const { endpoint, key } = parseConnectionString(connectionString);

  // For the local emulator the cert is self-signed — bypass TLS verification.
  const isEmulator = process.env.COSMOS_EMULATOR === 'true';
  const agent = isEmulator
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  const client = new CosmosClient({ endpoint, key, ...(agent ? { agent } : {}) });

  const { database } = await client.databases.createIfNotExists({ id: DB_NAME });

  const { container } = await database.containers.createIfNotExists({
    id: CONTAINER_NAME,
    partitionKey: { paths: [PARTITION_KEY] },
  });

  _container = container;
  return _container;
}
