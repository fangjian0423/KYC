import { useCallback, useEffect, useState } from 'react';
import {
  Check, Cloud, Database, ExternalLink, Globe2, KeyRound, LoaderCircle,
  RefreshCw, Rocket, Server, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import type { DeploymentJob, DeploymentProfile } from '../types';
import {
  apiErrorMessage,
  createDeployment,
  fetchDeployment,
  fetchDeploymentProfile,
} from '../api';

interface Props {
  onBack: () => void;
}

export function DeploymentCenter({ onBack }: Props) {
  const [profile, setProfile] = useState<DeploymentProfile | null>(null);
  const [environmentName, setEnvironmentName] = useState('production');
  const [operatorKey, setOperatorKey] = useState('');
  const [job, setJob] = useState<DeploymentJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDeploymentProfile();
      setProfile(next);
      setEnvironmentName(next.environmentName);
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Deployment profile could not be loaded.'));
    } finally { setLoading(false); }
  }, []);

  // Initial synchronization with the deployment profile API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProfile(); }, [loadProfile]);

  useEffect(() => {
    if (!job || job.status === 'SUCCEEDED' || job.status === 'FAILED' || !operatorKey) return;
    const timer = window.setInterval(() => {
      void fetchDeployment(job.id, operatorKey)
        .then(setJob)
        .catch((pollError) => setError(apiErrorMessage(pollError, 'Deployment status could not be refreshed.')));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job, operatorKey]);

  async function deploy() {
    setError(null);
    try { setJob(await createDeployment(environmentName, operatorKey)); }
    catch (deployError) { setError(apiErrorMessage(deployError, 'Deployment could not be started.')); }
  }

  const blocked = !profile?.enabled || profile.checks.some((check) => check.status === 'BLOCKED');
  const active = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  const succeeded = job?.status === 'SUCCEEDED';

  return <div className="page-container deploy-page">
    <button className="back-link" onClick={onBack}>← Back to command center</button>
    <div className="deploy-hero"><div className="eyebrow"><Rocket size={14} /> CONTROLLED AZURE DEPLOYMENT</div><h1>Your KYC platform<br /></h1><p>This page now starts a real, asynchronous ARM deployment using one server-side allowlisted profile—never browser-side credentials or shell commands.</p></div>
    <div className="deploy-layout">
      <section className="deploy-config">
        <div className="config-header"><div><h2>Deployment profile</h2><p>Target values are resolved and enforced by the backend.</p></div>{loading ? <span className="connected-badge"><LoaderCircle className="spin" size={13} /> Checking</span> : <span className={blocked ? 'connected-badge blocked' : 'connected-badge'}>{blocked ? <X size={13} /> : <Check size={13} />} {blocked ? 'Blocked' : 'Ready'}</span>}</div>
        {profile && <>
          <div className="deploy-form">
            <label className="guided-field"><span>Azure subscription</span><input value={profile.subscriptionName} disabled /></label>
            <label className="guided-field"><span>Region</span><input value={profile.location} disabled /></label>
            <label className="guided-field"><span>Resource group</span><input value={profile.resourceGroup} disabled /></label>
            <label className="guided-field"><span>Foundry project</span><input value={`${profile.foundryProject} · ${profile.model}`} disabled /></label>
            <label className="guided-field"><span>Environment label</span><input value={environmentName} onChange={(event) => setEnvironmentName(event.target.value.toLowerCase())} /></label>
            <label className="guided-field"><span>Operator access code</span><div className="input-with-icon"><KeyRound size={16} /><input type="password" value={operatorKey} onChange={(event) => setOperatorKey(event.target.value)} placeholder="Approval required" autoComplete="off" /></div></label>
          </div>
          <div className="preflight"><h3>Live pre-flight checks</h3>{profile.checks.map((check) => <div key={check.key} className={check.status.toLowerCase()}><span>{check.status === 'PASS' ? <Check size={12} /> : check.status === 'BLOCKED' ? <X size={12} /> : '?'}</span><strong>{check.label}</strong><em>{check.detail}</em></div>)}</div>
        </>}
        {job && <div className={`deployment-job ${job.status.toLowerCase()}`}><div className="job-heading"><span>{active ? <RefreshCw className="spin" size={16} /> : succeeded ? <Check size={16} /> : <X size={16} />}</span><div><strong>{job.status === 'QUEUED' ? 'Deployment queued' : job.status === 'RUNNING' ? 'Azure deployment is running' : job.status === 'SUCCEEDED' ? 'Environment deployment succeeded' : 'Deployment failed'}</strong><small>{job.deploymentName} · updated {new Date(job.updatedAt).toLocaleTimeString()}</small></div></div>{job.error && <p>{job.error}</p>}<div className="job-links">{job.frontendUrl && <a href={job.frontendUrl} target="_blank" rel="noreferrer">Open environment <ExternalLink size={12} /></a>}{job.portalUrl && <a href={job.portalUrl} target="_blank" rel="noreferrer">Azure portal <ExternalLink size={12} /></a>}</div></div>}
        {error && <div className="inline-notice error">{error}</div>}
        <button className={succeeded ? 'deploy-button success' : 'deploy-button'} onClick={deploy} disabled={loading || blocked || !operatorKey || active || succeeded}>{active ? <><RefreshCw className="spin" size={17} /> {job?.status === 'QUEUED' ? 'Queueing deployment…' : 'Deploying approved ARM template…'}</> : succeeded ? <><Check size={17} /> Environment is live</> : <><Rocket size={17} /> Start Azure deployment</>}</button>
        <p className="deploy-note"><ShieldCheck size={13} /> The API accepts only this profile and validates operator approval. No arbitrary Azure scope or commands are accepted.</p>
      </section>
      <section className="architecture-card">
        <div className="architecture-heading"><span>YOUR MANAGED ARCHITECTURE</span><strong>Secure by default</strong></div>
        <div className="architecture-flow">
          <div className="arch-node public"><Globe2 /><strong>Web experience</strong><span>Azure Container Apps</span></div>
          <i />
          <div className="arch-private"><span>PRIVATE NETWORK</span><div className="arch-node"><Server /><strong>KYC API</strong><small>Internal only</small></div><div className="arch-split"><div className="arch-node small"><Sparkles /><strong>Foundry</strong></div><div className="arch-node small"><Database /><strong>Cosmos DB</strong></div><div className="arch-node small"><Cloud /><strong>Blob Storage</strong></div></div></div>
        </div>
        <div className="architecture-benefits"><span><Check size={12} /> Versioned ARM template</span><span><Check size={12} /> Async job tracking</span><span><Check size={12} /> End-to-end tracing</span></div>
      </section>
    </div>
  </div>;
}
