import type { ExtractedData, UboRegistryData, ComparisonResults, Discrepancy } from '../types';

// ─── Extracted Data Card ────────────────────────────────────────────────────

export function ExtractedDataCard({ data }: { data?: ExtractedData }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm h-full">
      <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Document Extraction Layer
      </h3>
      {data ? (
        <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-gray-400 italic">No extraction data yet.</p>
      )}
    </div>
  );
}

// ─── Registry Data Card ─────────────────────────────────────────────────────

export function RegistryDataCard({ data }: { data?: UboRegistryData }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm h-full">
      <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Official Government Registry Data
      </h3>
      {data ? (
        <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-gray-400 italic">No registry data yet.</p>
      )}
    </div>
  );
}

// ─── Match Score Gauge ──────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-yellow-500';
  return 'text-red-600';
}

function barColor(score: number) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-400';
  return 'bg-red-500';
}

function DiscrepancyRow({ d }: { d: Discrepancy }) {
  const severityClass =
    d.severity === 'CRITICAL'
      ? 'border-red-400 bg-red-50'
      : 'border-yellow-400 bg-yellow-50';
  return (
    <div className={`rounded border-l-4 p-2 text-xs ${severityClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-gray-700">{d.field}</p>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
            d.severity === 'CRITICAL'
              ? 'bg-red-200 text-red-800'
              : 'bg-yellow-200 text-yellow-800'
          }`}
        >
          {d.severity}
        </span>
      </div>
      {d.description && <p className="mt-1 text-gray-700">{d.description}</p>}
      <p className="mt-1 text-gray-600">
        <span className="font-medium">Document:</span> {d.extractedValue}
      </p>
      <p className="text-gray-600">
        <span className="font-medium">Registry:</span> {d.registryValue}
      </p>
    </div>
  );
}

export function IntelligencePanel({ data }: { data?: ComparisonResults }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm h-full flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Intelligence &amp; Match Score
      </h3>

      {data ? (
        <>
          {/* Score gauge */}
          <div className="flex flex-col items-center gap-2">
            <span className={`text-5xl font-bold ${scoreColor(data.matchScore)}`}>
              {data.matchScore}
            </span>
            <span className="text-xs text-gray-400">/ 100</span>
            <div className="w-full rounded-full bg-gray-200 h-3">
              <div
                className={`h-3 rounded-full transition-all ${barColor(data.matchScore)}`}
                style={{ width: `${data.matchScore}%` }}
              />
            </div>
          </div>

          {/* Plain-language summary */}
          {data.summary && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Assessment
              </p>
              <p className="text-sm text-gray-700">{data.summary}</p>
            </div>
          )}

          {/* Discrepancies */}
          {data.discrepancies.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-500">
                Discrepancies ({data.discrepancies.length})
              </p>
              {data.discrepancies.map((d, i) => (
                <DiscrepancyRow key={i} d={d} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-green-600 font-medium">No discrepancies found.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-400 italic">Run verification to see results.</p>
      )}
    </div>
  );
}
