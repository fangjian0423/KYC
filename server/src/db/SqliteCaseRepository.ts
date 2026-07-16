import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Case, CaseDocument, ExtractedData, UboRegistryData, ComparisonResults, CaseStatus } from '../types';

type AgentSection = 'extractedData' | 'uboRegistryData' | 'comparisonResults';
type AgentSectionData = ExtractedData | UboRegistryData | ComparisonResults;

// Stored row shape — everything except id/createdAt/updatedAt is JSON-encoded in `data`
interface CaseRow {
  id: string;
  created_at: string;
  updated_at: string;
  data: string; // JSON-encoded Case
}

function rowToCase(row: CaseRow): Case {
  return JSON.parse(row.data) as Case;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'kyc.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
  `);

  console.log(`[db] SQLite ready at ${dbPath}`);
  return _db;
}

export class SqliteCaseRepository {
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

    getDb()
      .prepare('INSERT INTO cases (id, created_at, updated_at, data) VALUES (?, ?, ?, ?)')
      .run(newCase.id, now, now, JSON.stringify(newCase));

    return newCase;
  }

  async getCaseById(id: string): Promise<Case> {
    const row = getDb()
      .prepare<string, CaseRow>('SELECT * FROM cases WHERE id = ?')
      .get(id);

    if (!row) {
      const err = new Error(`Case ${id} not found.`) as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return rowToCase(row);
  }

  async updateAgentState(
    id: string,
    section: AgentSection,
    data: AgentSectionData,
    nextStatus: string,
  ): Promise<Case> {
    const existing = await this.getCaseById(id);
    const now = new Date().toISOString();
    const updated: Case = {
      ...existing,
      [section]: data,
      status: nextStatus as CaseStatus,
      updatedAt: now,
    };

    getDb()
      .prepare('UPDATE cases SET updated_at = ?, data = ? WHERE id = ?')
      .run(now, JSON.stringify(updated), id);

    return updated;
  }

  async getActiveCases(): Promise<Case[]> {
    const rows = getDb()
      .prepare<[], CaseRow>('SELECT * FROM cases ORDER BY created_at DESC')
      .all();
    return rows.map(rowToCase);
  }
}
