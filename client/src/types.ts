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
