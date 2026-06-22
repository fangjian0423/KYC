import type { CaseStatus } from '../types';

const STATUS_STYLES: Record<CaseStatus, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-800',
  EXTRACTION_COMPLETE: 'bg-yellow-100 text-yellow-800',
  UBO_COMPLETE: 'bg-purple-100 text-purple-800',
  VERIFIED: 'bg-green-100 text-green-800',
  DISCREPANCY_FOUND: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
