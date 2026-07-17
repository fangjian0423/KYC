export type RegistryAuthMethod = 'oauth2_exchange';

export interface RegistryFieldMappings {
  legalName: string;
  registrationNumber: string;
  shareholders: string;
  equityPercentage: string;
}

export interface RegistryConfiguration {
  id: 'registry-configuration';
  kind: 'registry-configuration';
  provider: 'custom-openapi';
  displayName: string;
  baseUrl: string;
  tokenEndpoint: string;
  scope: string;
  region: 'EU' | 'UK' | 'US';
  authMethod: RegistryAuthMethod;
  fieldMappings: RegistryFieldMappings;
  enabled: boolean;
  credentialConfigured: boolean;
  updatedAt: string;
  lastTest?: RegistryConnectionTest;
}

export interface RegistryConnectionTest {
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
  message: string;
}

export type DeploymentStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface DeploymentJob {
  id: string;
  kind: 'deployment-job';
  deploymentName: string;
  environmentName: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  status: DeploymentStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  frontendUrl?: string;
  portalUrl?: string;
  error?: string;
}

export interface DeploymentPreflightCheck {
  key: string;
  label: string;
  status: 'PASS' | 'BLOCKED' | 'UNKNOWN';
  detail: string;
}

export interface DeploymentProfile {
  enabled: boolean;
  subscriptionName: string;
  resourceGroup: string;
  location: string;
  environmentName: string;
  foundryProject: string;
  model: string;
  registryName: string;
  checks: DeploymentPreflightCheck[];
}