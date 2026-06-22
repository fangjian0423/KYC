import type { Case } from '../types';
import { DocumentUploadComponent } from './DocumentUploadComponent';
import { ExtractedDataCard, RegistryDataCard, IntelligencePanel } from './ResultPanels';
import { StatusBadge } from './StatusBadge';

interface Props {
  selectedCase: Case;
  onBack: () => void;
  onUpdate: (c: Case) => void;
}

export function CaseDetail({ selectedCase, onBack, onUpdate }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition"
        >
          ← Back
        </button>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{selectedCase.companyName}</h2>
          <p className="text-xs text-gray-400">
            {selectedCase.id} · {selectedCase.countryCode}
          </p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={selectedCase.status} />
        </div>
      </div>

      {/* Three-column workspace */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: Upload */}
        <DocumentUploadComponent
          caseId={selectedCase.id}
          onCaseCreated={onUpdate}
          onVerified={onUpdate}
        />

        {/* Center: Dual data cards */}
        <div className="flex flex-col gap-4">
          <ExtractedDataCard data={selectedCase.extractedData} />
          <RegistryDataCard data={selectedCase.uboRegistryData} />
        </div>

        {/* Right: Intelligence panel */}
        <IntelligencePanel data={selectedCase.comparisonResults} />
      </div>
    </div>
  );
}
