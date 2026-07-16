import { v4 as uuidv4 } from 'uuid';
import type { Case, CaseDocument, ExtractedData, UboRegistryData, ComparisonResults, CaseStatus } from '../types';

type AgentSection = 'extractedData' | 'uboRegistryData' | 'comparisonResults';
type AgentSectionData = ExtractedData | UboRegistryData | ComparisonResults;

const store = new Map<string, Case>();

export class MockCaseRepository {
  async createCase(
    companyName: string,
    countryCode: string,
    documents: CaseDocument[],
    registrationNumber?: string,
  ): Promise<Case> {
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
    store.set(newCase.id, newCase);
    return newCase;
  }

  async getCaseById(id: string): Promise<Case> {
    const c = store.get(id);
    if (!c) {
      const err = new Error(`Case ${id} not found.`) as NodeJS.ErrnoException;
      (err as unknown as { statusCode: number }).statusCode = 404;
      throw err;
    }
    return c;
  }

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
    store.set(id, updated);
    return updated;
  }

  async getActiveCases(): Promise<Case[]> {
    return Array.from(store.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
}
