import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import type { CaseDocument } from '../types';

const accountName = process.env.STORAGE_ACCOUNT_NAME;
const containerName = process.env.STORAGE_CONTAINER_NAME ?? 'kyc-documents';

let containerClientPromise: Promise<ContainerClient> | undefined;

/** True when an Azure Blob Storage account is configured for document persistence. */
export function isBlobConfigured(): boolean {
  return Boolean(accountName);
}

function getContainerClient(): Promise<ContainerClient> {
  if (!accountName) {
    throw new Error('STORAGE_ACCOUNT_NAME is not set — blob storage is not configured.');
  }
  if (!containerClientPromise) {
    // Auth via Managed Identity (ACA) / az login (local) — no keys in code.
    const service = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      new DefaultAzureCredential(),
    );
    const client = service.getContainerClient(containerName);
    containerClientPromise = client.createIfNotExists().then(() => client);
  }
  return containerClientPromise;
}

/** Upload a document image to blob storage and return its blob URL. */
export async function uploadDocumentImage(
  docId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const container = await getContainerClient();
  const blob = container.getBlockBlobClient(docId);
  await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
  return blob.url;
}

/** Download a blob and return it as a base64 data URL, or undefined if not resolvable. */
export async function downloadAsDataUrl(blobUrl: string): Promise<string | undefined> {
  if (!isBlobConfigured() || !blobUrl.startsWith('https://')) return undefined;
  const container = await getContainerClient();
  const blobName = decodeURIComponent(new URL(blobUrl).pathname.split('/').pop() ?? '');
  if (!blobName) return undefined;
  const blob = container.getBlockBlobClient(blobName);
  const buffer = await blob.downloadToBuffer();
  const props = await blob.getProperties();
  const mime = props.contentType ?? 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * Resolve a document's image as a base64 data URL for the vision step.
 * Prefers an inline `imageDataUrl` (mock / local), otherwise downloads from blob.
 */
export async function resolveImageDataUrl(
  doc?: CaseDocument,
): Promise<string | undefined> {
  if (!doc) return undefined;
  if (doc.imageDataUrl) return doc.imageDataUrl;
  if (isBlobConfigured() && doc.blobUrl?.startsWith('https://')) {
    return downloadAsDataUrl(doc.blobUrl);
  }
  return undefined;
}
