import { v4 as uuidv4 } from 'uuid';
import { getContainer } from './cosmosClient';
import type { Case, CaseDocument, ExtractedData, UboRegistryData, ComparisonResults, CaseStatus } from '../types';

type AgentSection = 'extractedData' | 'uboRegistryData' | 'comparisonResults';
type AgentSectionData = ExtractedData | UboRegistryData | ComparisonResults;

export class CaseRepository {
  /**
   * Create a new case with SUBMITTED status.
   */
  async createCase(
    companyName: string,
    countryCode: string,
    documents: CaseDocument[],
    registrationNumber?: string,
  ): Promise<Case> {
    const container = await getContainer();
    const now = new Date().toISOString();

    const newCase: Case = {
      id: uuidv4(),
      status: 'SUBMITTED',
      companyName,
      countryCode,
      registrationNumber,
      createdAt: now,
      updatedAt: now,
      documents,
    };

    const { resource } = await container.items.create<Case>(newCase);
    if (!resource) throw new Error('Failed to create case — Cosmos returned no resource.');
    return resource;
  }

  /**
   * Fetch a single case by id. Throws a 404-coded error if not found.
   */
  async getCaseById(id: string): Promise<Case> {
    const container = await getContainer();
    const { resource } = await container.item(id, id).read<Case>();
    if (!resource) {
      const err = new Error(`Case ${id} not found.`) as NodeJS.ErrnoException;
      (err as unknown as { statusCode: number }).statusCode = 404;
      throw err;
    }
    return resource;
  }

  /**
   * Merge new agent output into a specific section of the case document,
   * advance the status, and persist via upsert.
   */
  async updateAgentState(
    id: string,
    section: AgentSection,
    data: AgentSectionData,
    nextStatus: string,
  ): Promise<Case> {
    const existing = await this.getCaseById(id);

    const updated: Case = {
      ...existing,
      [section]: data,
      status: nextStatus as CaseStatus,
      updatedAt: new Date().toISOString(),
    };

    const container = await getContainer();
    const { resource } = await container.items.upsert<Case>(updated);
    if (!resource) throw new Error('Failed to update case — Cosmos returned no resource.');
    return resource;
  }

  /**
   * Return all cases ordered by creation date descending.
   */
  async getActiveCases(): Promise<Case[]> {
    const container = await getContainer();
    const { resources } = await container.items
      .query<Case>('SELECT * FROM c ORDER BY c.createdAt DESC')
      .fetchAll();
    return resources;
  }
}
