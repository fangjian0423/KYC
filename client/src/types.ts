export type DocType = 'PASSPORT' | 'BUSINESS_REGISTRATION' | 'BANK_STATEMENT';

export type CaseStatus =
  | 'SUBMITTED'
  | 'EXTRACTION_COMPLETE'
  | 'UBO_COMPLETE'
  | 'VERIFIED'
  | 'DISCREPANCY_FOUND';

export interface CaseDocument {
  docId: string;
  fileName: string;
  docType: DocType;
  blobUrl: string;
}

export interface Shareholder {
  name: string;
  equityPercentage: number;
}

export interface ExtractedData {
  registrationNumber: string;
  legalName: string;
  documentTypeIdentified: string;
  shareholders: Shareholder[];
}

export interface UboRegistryData {
  registryName: string;
  taxCode: string;
  shareholders: Shareholder[];
}

export interface Discrepancy {
  field: string;
  extractedValue: string;
  registryValue: string;
  severity: 'CRITICAL' | 'WARNING';
  /** Human-readable explanation of what the mismatch is and why it matters. */
  description: string;
}

export interface ComparisonResults {
  matchScore: number;
  /** Plain-language overall assessment explaining the score and outcome. */
  summary: string;
  discrepancies: Discrepancy[];
}

export interface Case {
  id: string;
  status: CaseStatus;
  companyName: string;
  countryCode: string;
  /** Analyst-supplied VAT / national registration number used to query the registry. */
  registrationNumber?: string;
  createdAt: string;
  updatedAt: string;
  documents: CaseDocument[];
  extractedData?: ExtractedData;
  uboRegistryData?: UboRegistryData;
  comparisonResults?: ComparisonResults;
}

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
  authMethod: 'oauth2_exchange';
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

export interface DeploymentJob {
  id: string;
  kind: 'deployment-job';
  deploymentName: string;
  environmentName: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  frontendUrl?: string;
  portalUrl?: string;
  error?: string;
}
