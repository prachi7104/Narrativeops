import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCcw } from 'lucide-react';

import {
  getCorrectionsSummary,
  getDashboardSummary,
  getHealth,
  getSettingsRules,
  listRuns,
  reloadSettingsRules,
} from '../api/client';
import type {
  CorrectionsSummaryResponse,
  DashboardSummary,
  RunSummary,
  SettingsRulesResponse,
} from '../api/types';

interface ApiStatusItem {
  key: string;
  label: string;
  connected: boolean;
  detail: string;
}

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [reloadingRules, setReloadingRules] = useState(false);
  const [rules, setRules] = useState<SettingsRulesResponse>({ rules: [], count: 0, source: 'unknown' });
  const [correctionsSummary, setCorrectionsSummary] = useState<CorrectionsSummaryResponse>({ summary: [], total: 0 });
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [healthOk, setHealthOk] = useState(false);
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    Promise.all([
      getHealth(),
      getSettingsRules(),
      getCorrectionsSummary(),
      getDashboardSummary(),
      listRuns(20),
    ])
      .then(([health, rulesResp, correctionsResp, dashboardResp, runsResp]) => {
        setHealthOk(health.status === 'ok');
        setRules(rulesResp);
        setCorrectionsSummary(correctionsResp);
        setDashboardSummary(dashboardResp);
        setRecentRuns(runsResp);
      })
      .catch((err) => {
        console.error('Failed to load settings data', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const apiStatus = useMemo<ApiStatusItem[]>(() => {
    const tavilyConnected = recentRuns.some((run) => (run.trend_sources_used || 0) > 0);
    const supabaseConnected = Boolean(dashboardSummary);

    return [
      {
        key: 'groq',
        label: 'Groq (primary LLM)',
        connected: healthOk,
        detail: healthOk ? 'Healthy from /health' : 'Health endpoint unavailable',
      },
      {
        key: 'tavily',
        label: 'Tavily (trend grounding)',
        connected: tavilyConnected,
        detail: tavilyConnected ? 'Trend sources observed in recent runs' : 'No trend sources in recent runs',
      },
      {
        key: 'supabase',
        label: 'Supabase (database)',
        connected: supabaseConnected,
        detail: supabaseConnected ? 'Dashboard summary reachable' : 'Dashboard summary unavailable',
      },
    ];
  }, [healthOk, recentRuns, dashboardSummary]);

  const handleReloadRules = async () => {
    setReloadingRules(true);
    try {
      await reloadSettingsRules();
      const updated = await getSettingsRules();
      setRules(updated);
    } catch (err) {
      console.error('Failed to reload rules', err);
    } finally {
      setReloadingRules(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-default">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
          <h2 className="text-2xl text-text-primary">Settings</h2>
          <p className="mt-1 text-sm text-text-secondary">Configuration transparency for APIs, rules, memory, and impact.</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings...
          </div>
        ) : (
          <>
            <section className="rounded-md border border-border-default bg-bg-surface p-5">
              <h3 className="text-lg text-text-primary">API Status</h3>
              <div className="mt-4 space-y-3">
                {apiStatus.map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-md border border-border-default bg-bg-primary px-3 py-2">
                    <div>
                      <p className="text-sm text-text-primary">{item.label}</p>
                      <p className="text-xs text-text-secondary">{item.detail}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${item.connected ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {item.connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {item.connected ? 'Connected' : 'Attention'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-border-default bg-bg-surface p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg text-text-primary">Default Rules</h3>
                  <p className="text-xs text-text-secondary">{rules.count} enabled rules · source: {rules.source}</p>
                </div>
                <button
                  onClick={handleReloadRules}
                  disabled={reloadingRules}
                  className="inline-flex items-center gap-2 rounded-md border border-border-default px-3 py-2 text-sm text-text-primary hover:bg-bg-elevated disabled:opacity-60"
                >
                  {reloadingRules ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Reload default rules
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-default text-left text-xs text-text-secondary">
                      <th className="py-2">Rule ID</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Severity</th>
                      <th className="py-2">Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.rules.map((rule) => (
                      <tr key={rule.rule_id} className="border-b border-border-default/60">
                        <td className="py-2 pr-3 font-mono text-xs text-text-primary">{rule.rule_id}</td>
                        <td className="py-2 pr-3 text-xs text-text-secondary">{rule.category}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${rule.severity === 'error' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'}`}>
                            {rule.severity}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-text-secondary">{rule.rule_text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-md border border-border-default bg-bg-surface p-5">
              <h3 className="text-lg text-text-primary">Editorial Memory</h3>
              <p className="text-xs text-text-secondary">Total corrections captured: {correctionsSummary.total}</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-default text-left text-xs text-text-secondary">
                      <th className="py-2">Category</th>
                      <th className="py-2">Corrections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correctionsSummary.summary.map((item) => (
                      <tr key={item.category} className="border-b border-border-default/60">
                        <td className="py-2 text-sm text-text-primary">{item.category}</td>
                        <td className="py-2 text-sm text-text-secondary">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-md border border-border-default bg-bg-surface p-5">
              <h3 className="text-lg text-text-primary">Impact Totals</h3>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total runs completed</span>
                  <span className="text-text-primary">{dashboardSummary?.total_runs ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total time saved</span>
                  <span className="text-text-primary">{(dashboardSummary?.total_time_saved_hours ?? 0).toFixed(1)} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total cost equivalent</span>
                  <span className="text-text-primary">₹{(dashboardSummary?.total_cost_saved_inr ?? 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
