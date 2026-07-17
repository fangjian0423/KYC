import { useState } from 'react';
import type { Case } from '../types';
import { verifyCase, documentUrl } from '../api';

interface Props {
  caseData: Case;
  onVerified: (c: Case) => void;
}

const STEPS = ['Extracting document', 'Verifying registry', 'Comparing & scoring'];

export function CaseSummaryPanel({ caseData, onVerified }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const alreadyVerified = Boolean(caseData.comparisonResults);

  async function handleVerify() {
    setError(null);
    setLoading(true);
    try {
      const updated = await verifyCase(caseData.id);
      onVerified(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }

  const doc = caseData.documents[0];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Case Details
      </h3>

      {/* Submitted data */}
      <dl className="grid grid-cols-3 gap-y-2 text-sm">
        <dt className="col-span-1 text-gray-500">Company</dt>
        <dd className="col-span-2 font-medium text-gray-900">{caseData.companyName}</dd>

        <dt className="col-span-1 text-gray-500">Country</dt>
        <dd className="col-span-2 text-gray-800">{caseData.countryCode}</dd>

        <dt className="col-span-1 text-gray-500">VAT / Reg. No.</dt>
        <dd className="col-span-2 text-gray-800">
          {caseData.registrationNumber || <span className="text-gray-400 italic">—</span>}
        </dd>

        <dt className="col-span-1 text-gray-500">Doc Type</dt>
        <dd className="col-span-2 text-gray-800">{doc?.docType?.replace(/_/g, ' ')}</dd>

        {doc?.fileName && doc.fileName !== 'unknown' && (
          <>
            <dt className="col-span-1 text-gray-500">File</dt>
            <dd className="col-span-2 text-gray-600 truncate">{doc.fileName}</dd>
          </>
        )}
      </dl>

      {/* Uploaded document preview */}
      {!imgFailed && (
        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">Uploaded document</p>
          <img
            src={documentUrl(caseData.id)}
            alt="Uploaded document"
            onError={() => setImgFailed(true)}
            className="max-h-56 w-full rounded border border-gray-200 object-contain bg-gray-50"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Verify action */}
      <button
        type="button"
        onClick={handleVerify}
        disabled={loading}
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Running verification…' : alreadyVerified ? 'Re-run Verification' : 'Trigger Verification'}
      </button>

      {/* Loading pipeline indicator */}
      {loading && (
        <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-700">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Running the 3-agent Foundry pipeline…
          </p>
          <ul className="flex flex-col gap-1">
            {STEPS.map((s) => (
              <li key={s} className="flex items-center gap-2 text-xs text-indigo-600">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
