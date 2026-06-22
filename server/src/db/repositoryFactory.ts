import { CaseRepository } from './CaseRepository';
import { MockCaseRepository } from './MockCaseRepository';
import { SqliteCaseRepository } from './SqliteCaseRepository';

export type AnyRepository = CaseRepository | MockCaseRepository | SqliteCaseRepository;

let _repo: AnyRepository | null = null;

export function getRepository(): AnyRepository {
  if (_repo) return _repo;

  if (process.env.USE_MOCK_DB === 'true') {
    console.log('[db] Using in-memory mock repository');
    _repo = new MockCaseRepository();
  } else if (process.env.COSMOS_CONNECTION_STRING) {
    console.log('[db] Using Cosmos DB repository');
    _repo = new CaseRepository();
  } else {
    _repo = new SqliteCaseRepository(); // logs from getDb()
  }
  return _repo;
}
