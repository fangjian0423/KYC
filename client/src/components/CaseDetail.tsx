import type { Case } from '../types';
import { CaseSummaryPanel } from './CaseSummaryPanel';
import { ExtractedDataCard, RegistryDataCard, IntelligencePanel } from './ResultPanels';
import { StatusBadge } from './StatusBadge';
import { Check, ChevronRight, Database, FileSearch, Sparkles } from 'lucide-react';

interface Props {
  selectedCase: Case;
  onBack: () => void;
  onUpdate: (c: Case) => void;
}

export function CaseDetail({ selectedCase, onBack, onUpdate }: Props) {
  return (
    <div className="case-workspace">
      {/* Header */}
      <div className="case-breadcrumbs"><button onClick={onBack}>Command center</button><ChevronRight size={13} /><span>Case {selectedCase.id.slice(0, 8)}</span></div>
      <div className="case-header">
        <button
          onClick={onBack}
          className="case-back-button"
        >
          ←
        </button>
        <div className="case-title">
          <span className="case-company-icon">{selectedCase.companyName.slice(0, 2).toUpperCase()}</span>
          <div><h2>{selectedCase.companyName}</h2><p>{selectedCase.countryCode} · {selectedCase.registrationNumber || selectedCase.id}</p></div>
        </div>
        <div className="case-status-area">
          <StatusBadge status={selectedCase.status} />
        </div>
      </div>

      <div className="agent-trail">
        {[{ icon: FileSearch, title: 'Document extracted', sub: 'Vision agent' }, { icon: Database, title: 'Registry queried', sub: 'UBO agent' }, { icon: Sparkles, title: 'Risk decision', sub: 'Comparison agent' }].map(({ icon: Icon, title, sub }, index) => <div className="trail-step" key={title}><div className="trail-icon"><Icon size={16} /><i><Check size={9} /></i></div><div><strong>{title}</strong><span>{sub}</span></div>{index < 2 && <em />}</div>)}
      </div>

      {/* Three-column workspace */}
      <div className="investigation-grid">
        {/* Left: Case summary + verify */}
        <CaseSummaryPanel caseData={selectedCase} onVerified={onUpdate} />

        {/* Center: Dual data cards */}
        <div className="evidence-stack">
          <ExtractedDataCard data={selectedCase.extractedData} />
          <RegistryDataCard data={selectedCase.uboRegistryData} />
        </div>

        {/* Right: Intelligence panel */}
        <IntelligencePanel data={selectedCase.comparisonResults} />
      </div>
    </div>
  );
}
