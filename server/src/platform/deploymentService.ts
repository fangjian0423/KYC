import { DefaultAzureCredential } from '@azure/identity';
import { ResourceManagementClient } from '@azure/arm-resources';
import { v4 as uuidv4 } from 'uuid';
import template from './deploymentTemplate.json';
import type { DeploymentJob, DeploymentPreflightCheck, DeploymentProfile } from './types';
import { getPlatformDocument, listDeploymentJobs, savePlatformDocument } from './store';
import { getRegistryConfiguration } from './registryConfiguration';

const credential = new DefaultAzureCredential();

interface DeploymentSettings {
  enabled: boolean;
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  location: string;
  namePrefix: string;
  acrName: string;
  backendImage: string;
  frontendImage: string;
  foundryProjectEndpoint: string;
  foundryModelName: string;
}

function settings(): DeploymentSettings {
  return {
    enabled: process.env.DEPLOYMENT_ENABLED === 'true',
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID ?? '',
    subscriptionName: process.env.AZURE_SUBSCRIPTION_NAME ?? 'Azure subscription',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP ?? '',
    location: process.env.DEPLOYMENT_LOCATION ?? 'westus3',
    namePrefix: process.env.DEPLOYMENT_NAME_PREFIX ?? 'kyc',
    acrName: process.env.AZURE_ACR_NAME ?? '',
    backendImage: process.env.DEPLOYMENT_BACKEND_IMAGE ?? '',
    frontendImage: process.env.DEPLOYMENT_FRONTEND_IMAGE ?? '',
    foundryProjectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT ?? '',
    foundryModelName: process.env.FOUNDRY_MODEL_NAME ?? 'gpt-5.4',
  };
}

function clientFor(subscriptionId: string): ResourceManagementClient {
  return new ResourceManagementClient(credential, subscriptionId);
}

async function lockCheck(config: DeploymentSettings): Promise<DeploymentPreflightCheck> {
  if (!config.subscriptionId || !config.resourceGroup) {
    return { key: 'resource-lock', label: 'Resource lock', status: 'UNKNOWN', detail: 'Azure target is not configured.' };
  }
  try {
    const token = await credential.getToken('https://management.azure.com/.default');
    const url = `https://management.azure.com/subscriptions/${encodeURIComponent(config.subscriptionId)}` +
      `/resourceGroups/${encodeURIComponent(config.resourceGroup)}/providers/Microsoft.Authorization/locks?api-version=2016-09-01`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json() as { value?: Array<{ properties?: { level?: string } }> };
    const readOnly = result.value?.some((item) => item.properties?.level?.toLowerCase() === 'readonly');
    return readOnly
      ? { key: 'resource-lock', label: 'Resource lock', status: 'BLOCKED', detail: 'ReadOnly lock must be removed by an Azure operator before deployment.' }
      : { key: 'resource-lock', label: 'Resource lock', status: 'PASS', detail: 'No ReadOnly lock blocks this deployment.' };
  } catch {
    return { key: 'resource-lock', label: 'Resource lock', status: 'UNKNOWN', detail: 'Lock state could not be verified.' };
  }
}

export async function getDeploymentProfile(): Promise<DeploymentProfile> {
  const config = settings();
  const registry = await getRegistryConfiguration();
  const requiredConfigured = Boolean(
    config.subscriptionId && config.resourceGroup && config.acrName &&
    config.backendImage && config.frontendImage && config.foundryProjectEndpoint,
  );
  const checks: DeploymentPreflightCheck[] = [
    {
      key: 'azure-identity', label: 'Azure identity',
      status: config.enabled && requiredConfigured ? 'PASS' : 'BLOCKED',
      detail: config.enabled && requiredConfigured ? 'Managed Identity deployment engine configured' : 'Self-service deployment is not enabled',
    },
    {
      key: 'foundry-model', label: 'Foundry model',
      status: config.foundryProjectEndpoint ? 'PASS' : 'BLOCKED',
      detail: config.foundryProjectEndpoint ? `${config.foundryModelName} ready` : 'Foundry project missing',
    },
    {
      key: 'registry', label: 'UBO connector',
      status: registry.enabled && registry.credentialConfigured ? 'PASS' : 'BLOCKED',
      detail: registry.enabled && registry.credentialConfigured ? `${registry.displayName} connected` : 'Registry credentials missing',
    },
    { key: 'security', label: 'Security baseline', status: 'PASS', detail: 'Allowlisted profile · operator approval · Managed Identity' },
    await lockCheck(config),
  ];

  return {
    enabled: config.enabled && requiredConfigured,
    subscriptionName: config.subscriptionName,
    resourceGroup: config.resourceGroup,
    location: config.location,
    environmentName: process.env.DEPLOYMENT_ENVIRONMENT_NAME ?? 'production',
    foundryProject: config.foundryProjectEndpoint.split('/').slice(-1)[0] || 'Not configured',
    model: config.foundryModelName,
    registryName: registry.displayName,
    checks,
  };
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Azure deployment failed.';
  return message.replace(/(api[-_ ]?key|token|secret|password)[^,;\n]*/gi, '$1 [redacted]').slice(0, 500);
}

async function runDeployment(job: DeploymentJob): Promise<void> {
  const config = settings();
  const running: DeploymentJob = {
    ...job,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await savePlatformDocument(running);

  try {
    const client = clientFor(config.subscriptionId);
    const poller = await client.deployments.beginCreateOrUpdate(config.resourceGroup, job.deploymentName, {
      properties: {
        mode: 'Incremental',
        template: template as Record<string, unknown>,
        parameters: {
          location: { value: config.location },
          namePrefix: { value: config.namePrefix },
          backendImage: { value: config.backendImage },
          frontendImage: { value: config.frontendImage },
          acrName: { value: config.acrName },
          foundryProjectEndpoint: { value: config.foundryProjectEndpoint },
          foundryModelName: { value: config.foundryModelName },
          registryApiKey: { value: process.env.REGISTRY_API_KEY ?? '' },
          registryEmail: { value: process.env.REGISTRY_EMAIL ?? '' },
          platformAdminKey: { value: process.env.PLATFORM_ADMIN_KEY ?? '' },
          enableSelfServiceDeployment: { value: true },
          deploymentEnvironmentName: { value: job.environmentName },
          includeRoleAssignments: { value: false },
        },
      },
    });
    const result = await poller.pollUntilDone();
    const outputs = result.properties?.outputs as Record<string, { value?: string }> | undefined;
    await savePlatformDocument({
      ...running,
      status: 'SUCCEEDED',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      frontendUrl: outputs?.frontendUrl?.value,
    });
  } catch (error) {
    await savePlatformDocument({
      ...running,
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: publicError(error),
    });
  }
}

export async function createDeploymentJob(environmentName: unknown): Promise<DeploymentJob> {
  const config = settings();
  const profile = await getDeploymentProfile();
  if (!profile.enabled) throw Object.assign(new Error('Self-service deployment is not configured.'), { statusCode: 503 });
  if (profile.checks.some((check) => check.status === 'BLOCKED')) {
    throw Object.assign(new Error('Deployment pre-flight checks are blocked. Resolve them before deploying.'), { statusCode: 409 });
  }
  if (typeof environmentName !== 'string' || !/^[a-z][a-z0-9-]{2,23}$/.test(environmentName)) {
    throw Object.assign(new Error('Environment name must be 3-24 lowercase letters, numbers, or hyphens.'), { statusCode: 400 });
  }
  const activeCandidate = (await listDeploymentJobs()).find((job) => job.status === 'QUEUED' || job.status === 'RUNNING');
  const active = activeCandidate ? await getDeploymentJob(activeCandidate.id) : undefined;
  if (active && active.status !== 'QUEUED' && active.status !== 'RUNNING') {
    // Azure completed an execution while this process was unavailable; the persisted
    // status has now been reconciled and a new deployment may proceed.
  } else if (active) {
    throw Object.assign(new Error(`Deployment ${active.id} is already active.`), { statusCode: 409 });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const job: DeploymentJob = {
    id,
    kind: 'deployment-job',
    deploymentName: `verityos-${environmentName}-${id.slice(0, 8)}`,
    environmentName,
    subscriptionId: config.subscriptionId,
    resourceGroup: profile.resourceGroup,
    location: profile.location,
    status: 'QUEUED',
    createdAt: now,
    updatedAt: now,
    portalUrl: `https://portal.azure.com/#resource/subscriptions/${config.subscriptionId}/resourceGroups/${profile.resourceGroup}/overview`,
  };
  await savePlatformDocument(job);
  void runDeployment(job);
  return job;
}

export async function getDeploymentJob(id: string): Promise<DeploymentJob> {
  const job = await getPlatformDocument<DeploymentJob>(id);
  if (!job || job.kind !== 'deployment-job') {
    throw Object.assign(new Error(`Deployment ${id} not found.`), { statusCode: 404 });
  }
  if (job.status !== 'RUNNING') return job;

  try {
    const client = clientFor(job.subscriptionId);
    const deployment = await client.deployments.get(job.resourceGroup, job.deploymentName);
    const state = deployment.properties?.provisioningState;
    if (state !== 'Succeeded' && state !== 'Failed' && state !== 'Canceled') return job;
    const completed: DeploymentJob = {
      ...job,
      status: state === 'Succeeded' ? 'SUCCEEDED' : 'FAILED',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: state === 'Succeeded' ? undefined : `Azure deployment ended with state ${state}.`,
    };
    return savePlatformDocument(completed);
  } catch {
    return job;
  }
}

export { listDeploymentJobs };