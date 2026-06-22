import { useState, useEffect, useCallback } from 'react';
import type { Case } from './types';
import { fetchCases } from './api';
import { StatusBadge } from './components/StatusBadge';
import { CaseDetail } from './components/CaseDetail';
import { DocumentUploadComponent } from './components/DocumentUploadComponent';

type View = 'grid' | 'detail' | 'new';

export default function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<View>('grid');
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    setFetchError(null);
    try {
      const data = await fetchCases();
      setCases(data);
    } catch {
      setFetchError('Could not reach backend API. Make sure the server is running.');
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  function handleSelectCase(c: Case) {
    setSelectedCase(c);
    setView('detail');
  }

  function handleCaseCreated(c: Case) {
    setCases((prev) => [c, ...prev]);
    setSelectedCase(c);
    setView('detail');
  }

  function handleCaseUpdated(updated: Case) {
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedCase(updated);
  }

  function handleBack() {
    setSelectedCase(null);
    setView('grid');
    loadCases();
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <header className="bg-indigo-700 shadow">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white tracking-tight">KYB CaseManager</span>
            <span className="rounded bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-indigo-100 uppercase">
              PoC
            </span>
          </div>
          <button
            onClick={() => setView('new')}
            className="rounded bg-white px-4 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition"
          >
            + New Case
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* New Case Form */}
        {view === 'new' && (
          <div className="max-w-md mx-auto">
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={() => setView('grid')}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Back
              </button>
              <h2 className="text-lg font-semibold text-gray-900">Create New Case</h2>
            </div>
            <DocumentUploadComponent
              onCaseCreated={handleCaseCreated}
              onVerified={handleCaseUpdated}
            />
          </div>
        )}

        {/* Case Detail */}
        {view === 'detail' && selectedCase && (
          <CaseDetail
            selectedCase={selectedCase}
            onBack={handleBack}
            onUpdate={handleCaseUpdated}
          />
        )}

        {/* Case Grid */}
        {view === 'grid' && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Active Cases</h2>
              <button
                onClick={loadCases}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Refresh
              </button>
            </div>

            {loadingCases && (
              <div className="flex justify-center py-12">
                <svg className="h-8 w-8 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}

            {fetchError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {fetchError}
              </div>
            )}

            {!loadingCases && !fetchError && cases.length === 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400">
                No cases found. Click <strong>+ New Case</strong> to get started.
              </div>
            )}

            {!loadingCases && cases.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Case ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Company Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cases.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => handleSelectCase(c)}
                        className="cursor-pointer hover:bg-indigo-50 transition"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[120px]">{c.id}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{c.companyName}</td>
                        <td className="px-4 py-3 text-gray-600">{c.countryCode}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
