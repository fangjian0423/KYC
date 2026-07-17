import { promises as fs } from 'fs';
import path from 'path';
import { getContainer } from '../db/cosmosClient';
import type { DeploymentJob, RegistryConfiguration } from './types';

type PlatformDocument = RegistryConfiguration | DeploymentJob;

const PLATFORM_CONTAINER = process.env.COSMOS_PLATFORM_CONTAINER_NAME ?? 'PlatformConfig';
const localPath = process.env.PLATFORM_STORE_PATH ?? path.join(process.cwd(), 'kyc-platform.json');
let writeQueue: Promise<void> = Promise.resolve();

function usesCosmos(): boolean {
  return Boolean(process.env.COSMOS_ENDPOINT || process.env.COSMOS_CONNECTION_STRING);
}

async function readLocal(): Promise<Record<string, PlatformDocument>> {
  try {
    return JSON.parse(await fs.readFile(localPath, 'utf8')) as Record<string, PlatformDocument>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function writeLocal(documents: Record<string, PlatformDocument>): Promise<void> {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  const temporaryPath = `${localPath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(documents, null, 2), 'utf8');
  await fs.rename(temporaryPath, localPath);
}

export async function getPlatformDocument<T extends PlatformDocument>(id: string): Promise<T | undefined> {
  if (usesCosmos()) {
    try {
      const container = await getContainer(PLATFORM_CONTAINER);
      const { resource } = await container.item(id, id).read<T>();
      return resource;
    } catch (error) {
      if ((error as { code?: number }).code === 404) return undefined;
      throw error;
    }
  }

  const documents = await readLocal();
  return documents[id] as T | undefined;
}

export async function savePlatformDocument<T extends PlatformDocument>(document: T): Promise<T> {
  if (usesCosmos()) {
    const container = await getContainer(PLATFORM_CONTAINER);
    const { resource } = await container.items.upsert<T>(document);
    if (!resource) throw new Error('Platform configuration could not be persisted.');
    return resource;
  }

  writeQueue = writeQueue.then(async () => {
    const documents = await readLocal();
    documents[document.id] = document;
    await writeLocal(documents);
  });
  await writeQueue;
  return document;
}

export async function listDeploymentJobs(limit = 20): Promise<DeploymentJob[]> {
  if (usesCosmos()) {
    const container = await getContainer(PLATFORM_CONTAINER);
    const { resources } = await container.items
      .query<DeploymentJob>({
        query: 'SELECT TOP @limit * FROM c WHERE c.kind = @kind ORDER BY c.createdAt DESC',
        parameters: [
          { name: '@limit', value: limit },
          { name: '@kind', value: 'deployment-job' },
        ],
      })
      .fetchAll();
    return resources;
  }

  return Object.values(await readLocal())
    .filter((document): document is DeploymentJob => document.kind === 'deployment-job')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}