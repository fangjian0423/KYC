import { useState, useEffect, useCallback } from 'react';
import {
  Activity, ArrowRight, Boxes, Building2, Check, ChevronRight, CircleHelp,
  Cloud, Database, FileSearch, Globe2, LayoutDashboard, Menu, Plus,
  RefreshCw, Search, Settings2, ShieldCheck, Sparkles, X, Zap,
} from 'lucide-react';
import type { Case } from './types';
import { fetchCases } from './api';
import { StatusBadge } from './components/StatusBadge';
import { CaseDetail } from './components/CaseDetail';
import { DocumentUploadComponent } from './components/DocumentUploadComponent';
import { RegistryStudio } from './components/RegistryStudio';
import { DeploymentCenter } from './components/DeploymentCenter';
import './App.css';

type View = 'grid' | 'detail' | 'new' | 'registry' | 'deploy';

const pipeline = [
  { label: 'Document AI', detail: 'Vision extraction', icon: FileSearch },
  { label: 'UBO Registry', detail: 'Live source query', icon: Database },
  { label: 'Risk Intelligence', detail: 'AI comparison', icon: Sparkles },
];

export default function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<View>('grid');
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    setFetchError(null);
    try { setCases(await fetchCases()); }
    catch { setFetchError('The verification service is temporarily unavailable.'); }
    finally { setLoadingCases(false); }
  }, []);

  // Initial synchronization with the external case API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadCases(); }, [loadCases]);

  const verified = cases.filter((c) => c.status === 'VERIFIED').length;
  const flagged = cases.filter((c) => c.status === 'DISCREPANCY_FOUND').length;
  const filteredCases = cases.filter((c) =>
    `${c.companyName} ${c.id} ${c.countryCode}`.toLowerCase().includes(query.toLowerCase()),
  );

  function navigate(next: View) {
    setView(next);
    setMobileOpen(false);
    if (next !== 'detail') setSelectedCase(null);
  }
  function handleSelectCase(c: Case) { setSelectedCase(c); setView('detail'); }
  function handleCaseCreated(c: Case) { setCases((prev) => [c, ...prev]); setSelectedCase(c); setView('detail'); }
  function handleCaseUpdated(updated: Case) { setCases((prev) => prev.map((c) => c.id === updated.id ? updated : c)); setSelectedCase(updated); }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => navigate('grid')} role="button" tabIndex={0}>
          <div className="brand-mark"><ShieldCheck size={21} /></div>
          <div><strong>VerityOS</strong><span>KYC Intelligence</span></div>
        </div>
        <nav className={mobileOpen ? 'main-nav mobile-open' : 'main-nav'}>
          <button className={view === 'grid' ? 'active' : ''} onClick={() => navigate('grid')}><LayoutDashboard size={16} /> Command Center</button>
          <button className={view === 'registry' ? 'active' : ''} onClick={() => navigate('registry')}><Database size={16} /> Registry Studio</button>
          <button className={view === 'deploy' ? 'active' : ''} onClick={() => navigate('deploy')}><Boxes size={16} /> Deploy</button>
        </nav>
        <div className="topbar-actions">
          <div className="environment-pill"><span /> Production</div>
          <button className="icon-button" aria-label="Help"><CircleHelp size={18} /></button>
          <button className="primary-button compact" onClick={() => navigate('new')}><Plus size={17} /> New verification</button>
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">{mobileOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <main>
        {view === 'grid' && <Dashboard cases={cases} filteredCases={filteredCases} loading={loadingCases} error={fetchError} verified={verified} flagged={flagged} query={query} setQuery={setQuery} loadCases={loadCases} navigate={navigate} selectCase={handleSelectCase} />}
        {view === 'new' && <div className="page-container form-page"><button className="back-link" onClick={() => navigate('grid')}>← Back to workspace</button><div className="form-hero"><span className="section-kicker">NEW VERIFICATION</span><h1>Verify a business entity</h1><p>Upload one document. Our Foundry agents handle extraction, registry lookup and risk comparison.</p></div><DocumentUploadComponent onCaseCreated={handleCaseCreated} /></div>}
        {view === 'detail' && selectedCase && <div className="page-container detail-page"><CaseDetail selectedCase={selectedCase} onBack={() => navigate('grid')} onUpdate={handleCaseUpdated} /></div>}
        {view === 'registry' && <RegistryStudio onBack={() => navigate('grid')} />}
        {view === 'deploy' && <DeploymentCenter onBack={() => navigate('grid')} />}
      </main>
    </div>
  );
}

interface DashboardProps {
  cases: Case[]; filteredCases: Case[]; loading: boolean; error: string | null;
  verified: number; flagged: number; query: string; setQuery: (value: string) => void;
  loadCases: () => void; navigate: (view: View) => void; selectCase: (c: Case) => void;
}

function Dashboard({ cases, filteredCases, loading, error, verified, flagged, query, setQuery, loadCases, navigate, selectCase }: DashboardProps) {
  return <div className="page-container dashboard-page">
    <section className="hero-banner">
      <div className="hero-copy">
        <div className="eyebrow"><Zap size={14} /> Built on Microsoft Foundry</div>
        <h1>Smart KYC.<br /><span>Built for the Modern Enterprise.</span></h1>
        <p>Deploy a production-ready verification workflow in minutes. Connect any UBO registry without writing orchestration code.</p>
        <div className="hero-actions"><button className="primary-button" onClick={() => navigate('new')}>Start a verification <ArrowRight size={17} /></button><button className="secondary-button" onClick={() => navigate('registry')}><Settings2 size={17} /> Customize registry</button></div>
        <div className="trust-row"><span><Check size={14} /> Managed identity</span><span><Check size={14} /> Private backend</span><span><Check size={14} /> Audit-ready traces</span></div>
      </div>
      <div className="pipeline-visual">
        <div className="pipeline-heading"><div><span className="live-dot" /> Live verification pipeline</div><span>3 agents</span></div>
        {pipeline.map(({ label, detail, icon: Icon }, index) => <div className="pipeline-step" key={label}><div className="step-icon"><Icon size={19} /></div><div><strong>{label}</strong><span>{detail}</span></div><div className="step-status"><Check size={14} /></div>{index < pipeline.length - 1 && <div className="step-connector" />}</div>)}
        <div className="pipeline-result"><Sparkles size={16} /><span>One workflow. Explainable results.</span></div>
      </div>
    </section>

    <section className="stats-grid">
      <div className="stat-card"><div className="stat-icon blue"><Activity /></div><div><span>Active cases</span><strong>{cases.length}</strong><small>Live workload</small></div></div>
      <div className="stat-card"><div className="stat-icon green"><ShieldCheck /></div><div><span>Verified</span><strong>{verified}</strong><small>Passed all checks</small></div></div>
      <div className="stat-card"><div className="stat-icon coral"><FileSearch /></div><div><span>Needs review</span><strong>{flagged}</strong><small>AI-flagged evidence</small></div></div>
      <div className="registry-stat" onClick={() => navigate('registry')} role="button" tabIndex={0}><div className="registry-logo"><Globe2 /></div><div><span>Registry connection</span><strong>Custom OpenAPI</strong><small><i /> Connected · DE sandbox</small></div><ChevronRight size={19} /></div>
    </section>

    <section className="workspace-section">
      <div className="section-heading"><div><span className="section-kicker">OPERATIONS</span><h2>Verification workspace</h2><p>Review every entity and follow its decision trail.</p></div><div className="table-actions"><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, country or ID" /></label><button className="icon-button bordered" onClick={loadCases} aria-label="Refresh"><RefreshCw size={17} /></button></div></div>
      {loading && <div className="loading-state"><RefreshCw className="spin" /><span>Syncing verification workspace…</span></div>}
      {error && <div className="error-state">{error}<button onClick={loadCases}>Try again</button></div>}
      {!loading && !error && filteredCases.length === 0 && <div className="empty-state"><div><Building2 /></div><h3>No cases found</h3><p>Start with a company document and VerityOS will orchestrate the rest.</p><button className="primary-button" onClick={() => navigate('new')}><Plus size={17} /> New verification</button></div>}
      {!loading && filteredCases.length > 0 && <div className="case-table-wrap"><table className="case-table"><thead><tr><th>Entity</th><th>Jurisdiction</th><th>Created</th><th>AI decision</th><th>Match</th><th /></tr></thead><tbody>{filteredCases.map((c) => <tr key={c.id} onClick={() => selectCase(c)}><td><div className="entity-cell"><div className="entity-avatar">{c.companyName.slice(0, 2).toUpperCase()}</div><div><strong>{c.companyName}</strong><span>{c.registrationNumber || c.id.slice(0, 16)}</span></div></div></td><td><span className="country-chip">{c.countryCode}</span></td><td><span className="date-main">{new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span><small>{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></td><td><StatusBadge status={c.status} /></td><td>{c.comparisonResults ? <div className="mini-score"><span>{c.comparisonResults.matchScore}</span><i><b style={{ width: `${c.comparisonResults.matchScore}%` }} /></i></div> : <span className="muted">Pending</span>}</td><td><button className="row-action"><ChevronRight /></button></td></tr>)}</tbody></table></div>}
    </section>

    <section className="value-strip"><div><Cloud /><span><strong>One-click Azure deployment</strong>No infrastructure expertise required</span></div><div><Database /><span><strong>Bring your own registry</strong>Map any REST or OpenAPI source</span></div><div><Sparkles /><span><strong>Foundry-native agents</strong>Observable, secure and explainable</span></div></section>
  </div>;
}

