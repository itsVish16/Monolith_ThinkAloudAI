import React, { useState, useEffect } from 'react';
import {
  Zap,
  Activity,
  Clock,
  Cpu,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  X,
  Sparkles,
  Layers
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import type {
  AdminTelemetryOverviewResponse,
  AdminSessionMetricsResponse,
  SlowestTurnItem,
  TurnMetricItem
} from '../../services/adminService';
import '../../styles/AdminTelemetry.css';

export const TelemetryAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [overview, setOverview] = useState<AdminTelemetryOverviewResponse | null>(null);

  // Modal state for session deep-dive
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionMetrics, setSessionMetrics] = useState<AdminSessionMetricsResponse | null>(null);
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getTelemetryOverview(limit);
      setOverview(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch global latency telemetry');
    } finally {
      setLoading(false);
    }
  };

  const handleInspectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSessionLoading(true);
    setSessionMetrics(null);
    setExpandedTurn(null);
    try {
      const data = await adminService.getSessionMetrics(sessionId);
      setSessionMetrics(data);
      if (data.turns && data.turns.length > 0) {
        setExpandedTurn(data.turns[0].turn_number);
      }
    } catch (err: any) {
      console.error('Failed to load session metrics:', err);
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [limit]);

  const getLatencyBadgeClass = (ms?: number) => {
    if (!ms) return 'ta-lat-none';
    if (ms < 400) return 'ta-lat-ok';
    if (ms < 650) return 'ta-lat-warn';
    return 'ta-lat-bad';
  };

  const getStageChipClass = (stage?: string) =>
    stage?.toLowerCase() === 'completed' ? 'ta-chip ta-chip-ok' : 'ta-chip ta-chip-stage';

  return (
    <div className="ta-root">
      {/* Top Header & Filter Controls */}
      <div className="admin-table-header-card">
        <div className="admin-filter-row ta-header-row">
          <div className="ta-header-left">
            <div className="ta-header-chip">
              <Activity size={19} />
            </div>
            <div className="ta-header-copy">
              <h2 className="ta-header-title">AI Voice Latency &amp; Turn Telemetry</h2>
              <p className="ta-header-sub">Turn-by-turn latency measurement, speculative bridge TTFT, and pipeline bottleneck diagnostics</p>
            </div>
          </div>

          <div className="ta-header-actions">
            <div className="ta-seg">
              <span className="ta-seg-label">Sessions:</span>
              <div className="ta-seg-group">
                {[25, 50, 100, 200].map((val) => (
                  <button
                    key={val}
                    className={`ta-seg-btn ${limit === val ? 'active' : ''}`}
                    onClick={() => setLimit(val)}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <button className="admin-btn-secondary ta-refresh" onClick={fetchOverview} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="admin-error-box flex items-center gap-2 text-red-400">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Standard Admin Stat KPI Cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon orange">
            <Zap size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Overall Avg E2E Latency</span>
            <div className="admin-stat-val ta-val ta-val-orange">
              {overview?.overall_avg_e2e_latency_ms ? `${overview.overall_avg_e2e_latency_ms} ms` : '—'}
            </div>
            <span className="ta-note ta-note-ok">Target &lt; 450ms (Speech to Voice)</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon green">
            <Sparkles size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Fast Bridge Speculative TTFT</span>
            <div className="admin-stat-val ta-val ta-val-green">
              {overview?.overall_avg_fast_ttft_ms ? `${overview.overall_avg_fast_ttft_ms} ms` : '—'}
            </div>
            <span className="ta-note ta-note-warn">Sub-150ms Instant Filler</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon amber">
            <Cpu size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Main LLM Deep Reasoning TTFT</span>
            <div className="admin-stat-val ta-val ta-val-amber">
              {overview?.overall_avg_main_ttft_ms ? `${overview.overall_avg_main_ttft_ms} ms` : '—'}
            </div>
            <span className="ta-note ta-note-dim">LangGraph Primary Stream</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon ta-icon-neutral">
            <Layers size={22} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Analyzed Sessions</span>
            <div className="admin-stat-val ta-val">
              {overview?.analyzed_sessions_count ?? 0}
            </div>
            <span className="ta-note ta-note-dim">Aggregated Telemetry Sample</span>
          </div>
        </div>
      </div>

      {/* Split Section: Top 10 Bottlenecks & Recent Sessions */}
      <div className="ta-split">

        {/* Left: Top 10 Slowest Turns (Bottleneck Isolator) */}
        <div className="admin-table-header-card ta-panel">
          <div className="ta-panel-head">
            <div className="ta-panel-title">
              <span className="ta-panel-ico amber">
                <AlertTriangle size={13} />
              </span>
              <h3>Top 10 Latency Bottlenecks (Slowest Turns)</h3>
            </div>
            <span className="ta-panel-hint">High latency spikes</span>
          </div>

          <div className="ta-scroll-wrap">
            <div className="admin-table-wrapper ta-scroll">
              <table className="admin-table ta-table">
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>Candidate</th>
                    <th>Stage</th>
                    <th>Turn</th>
                    <th>E2E Latency</th>
                    <th>Main TTFT</th>
                    <th>Candidate Spoken Query</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="ta-empty">Loading bottleneck traces...</td>
                    </tr>
                  ) : !overview?.slowest_turns || overview.slowest_turns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="ta-empty">No latency spikes recorded.</td>
                    </tr>
                  ) : (
                    overview.slowest_turns.map((turn: SlowestTurnItem, idx: number) => (
                      <tr key={`${turn.session_id}-${turn.turn_number}-${idx}`}>
                        <td><span className="ta-sid">{turn.session_id}</span></td>
                        <td><span className="ta-candidate">{turn.candidate_name || 'Candidate'}</span></td>
                        <td>
                          <span className={getStageChipClass(turn.stage)}>{turn.stage || 'in_progress'}</span>
                        </td>
                        <td><span className="ta-turn">#{turn.turn_number}</span></td>
                        <td>
                          <span className={`ta-lat ${getLatencyBadgeClass(turn.e2e_latency_ms)}`}>
                            {turn.e2e_latency_ms ? `${Math.round(turn.e2e_latency_ms)} ms` : '—'}
                          </span>
                        </td>
                        <td>
                          <span className="ta-num">
                            {turn.main_llm_ttft_ms ? `${Math.round(turn.main_llm_ttft_ms)} ms` : '—'}
                          </span>
                        </td>
                        <td>
                          <span className="ta-quote" title={turn.user_text}>"{turn.user_text || '—'}"</span>
                        </td>
                        <td>
                          <button
                            className="admin-btn-secondary ta-btn-mini"
                            onClick={() => handleInspectSession(turn.session_id)}
                          >
                            Deep-Dive
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Recent Sessions Telemetry Summary */}
        <div className="admin-table-header-card ta-panel">
          <div className="ta-panel-head">
            <div className="ta-panel-title">
              <span className="ta-panel-ico orange">
                <Clock size={13} />
              </span>
              <h3>Recent Sessions Latency</h3>
            </div>
            <span className="ta-panel-hint">Click to inspect</span>
          </div>

          <div className="ta-scroll-wrap">
            <div className="admin-table-wrapper ta-scroll">
              <table className="admin-table ta-table">
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>Candidate</th>
                    <th>Type</th>
                    <th>Turns</th>
                    <th>Avg E2E Latency</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="ta-empty">Loading sessions...</td>
                    </tr>
                  ) : !overview?.recent_sessions || overview.recent_sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="ta-empty">No recent sessions found.</td>
                    </tr>
                  ) : (
                    overview.recent_sessions.map((sess) => (
                      <tr
                        key={sess.session_id}
                        className="ta-clickable"
                        onClick={() => handleInspectSession(sess.session_id)}
                      >
                        <td><span className="ta-sid">{sess.session_id}</span></td>
                        <td><span className="ta-candidate">{sess.candidate_name || 'Candidate'}</span></td>
                        <td>
                          <span className="ta-chip ta-chip-type">{sess.interview_type || 'DSA'}</span>
                        </td>
                        <td><span className="ta-turn">{sess.total_turns}</span></td>
                        <td>
                          <span className={`ta-lat ${getLatencyBadgeClass(sess.avg_e2e_latency_ms)}`}>
                            {sess.avg_e2e_latency_ms ? `${Math.round(sess.avg_e2e_latency_ms)} ms` : '—'}
                          </span>
                        </td>
                        <td>
                          <button className="admin-btn-secondary ta-icon-btn">
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* ========================================================
          SESSION LATENCY DEEP-DIVE MODAL / DRAWER
          ======================================================== */}
      {selectedSessionId && (
        <div className="admin-modal-overlay" onClick={() => setSelectedSessionId(null)}>
          <div className="admin-modal-card ta-dialog-wide" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="admin-modal-header">
              <div className="ta-dd-head">
                <div className="ta-header-chip ta-header-chip-sm">
                  <Zap size={17} />
                </div>
                <div className="ta-dd-head-copy">
                  <h3 className="ta-dd-title">Session Latency Deep-Dive: {selectedSessionId}</h3>
                  <p className="ta-dd-sub">
                    {sessionMetrics?.candidate_name} ({sessionMetrics?.user_email || 'Candidate'}) • Stage: {sessionMetrics?.stage}
                  </p>
                </div>
              </div>
              <button className="admin-btn-secondary ta-icon-btn" onClick={() => setSelectedSessionId(null)}>
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="admin-modal-body ta-dialog-body">
              {sessionLoading ? (
                <div className="ta-dd-loading">
                  <RefreshCw size={22} className="animate-spin ta-spin-orange" />
                  <span>Loading granular turn traces...</span>
                </div>
              ) : !sessionMetrics ? (
                <div className="ta-dd-fail">Failed to load session details.</div>
              ) : (
                <div className="ta-dd-layout">

                  {/* Telemetry Summary Bar */}
                  <div className="ta-dd-summary">
                    <div className="ta-dd-stat">
                      <span className="ta-dd-label">Total Turns</span>
                      <span className="ta-dd-val">{sessionMetrics.telemetry_summary?.total_turns ?? 0}</span>
                    </div>
                    <div className="ta-dd-stat">
                      <span className="ta-dd-label">Avg E2E Latency</span>
                      <span className="ta-dd-val ta-val-orange">
                        {Math.round(sessionMetrics.telemetry_summary?.avg_e2e_latency_ms || 0)} ms
                      </span>
                    </div>
                    <div className="ta-dd-stat">
                      <span className="ta-dd-label">Min / Max Latency</span>
                      <span className="ta-dd-val ta-dd-val-sm">
                        {Math.round(sessionMetrics.telemetry_summary?.min_e2e_latency_ms || 0)}ms / {Math.round(sessionMetrics.telemetry_summary?.max_e2e_latency_ms || 0)}ms
                      </span>
                    </div>
                    <div className="ta-dd-stat">
                      <span className="ta-dd-label">Fast Bridge TTFT</span>
                      <span className="ta-dd-val ta-val-green">
                        {Math.round(sessionMetrics.telemetry_summary?.avg_fast_llm_ttft_ms || 0)} ms
                      </span>
                    </div>
                    <div className="ta-dd-stat">
                      <span className="ta-dd-label">Main Reasoner TTFT</span>
                      <span className="ta-dd-val ta-val-amber">
                        {Math.round(sessionMetrics.telemetry_summary?.avg_main_llm_ttft_ms || 0)} ms
                      </span>
                    </div>
                  </div>

                  {/* Turn List */}
                  <div className="ta-turns">
                    <div className="ta-turns-head">
                      <h4 className="ta-turns-title">
                        Turn-by-Turn Latency &amp; Reasoning Traces ({sessionMetrics.turns?.length || 0})
                      </h4>
                      <span className="ta-turns-hint">Click any turn to expand pipeline diagnostics</span>
                    </div>

                    {(!sessionMetrics.turns || sessionMetrics.turns.length === 0) ? (
                      <div className="ta-empty-box">
                        No turn telemetry recorded for this session yet.
                      </div>
                    ) : (
                      sessionMetrics.turns.map((turn: TurnMetricItem) => {
                        const isExpanded = expandedTurn === turn.turn_number;
                        return (
                          <div key={turn.turn_number} className={`ta-turn-card ${isExpanded ? 'expanded' : ''}`}>
                            <div
                              className="ta-turn-head"
                              onClick={() => setExpandedTurn(isExpanded ? null : turn.turn_number)}
                            >
                              <div className="ta-turn-head-main">
                                <span className="ta-turn-num">Turn #{turn.turn_number}</span>
                                <span className={getStageChipClass(turn.stage)}>{turn.stage || 'speaking'}</span>
                                <span className="ta-quote-sm">
                                  Candidate: "{turn.user_text || '...'}"
                                </span>
                              </div>

                              <div className="ta-turn-head-side">
                                <span className={`ta-lat ${getLatencyBadgeClass(turn.e2e_response_latency_ms)}`}>
                                  E2E: {turn.e2e_response_latency_ms ? `${Math.round(turn.e2e_response_latency_ms)} ms` : '—'}
                                </span>
                                {turn.evaluation?.score !== undefined && (
                                  <span className="ta-score">
                                    Score: {turn.evaluation.score}/100
                                  </span>
                                )}
                                <ChevronRight size={16} className={`ta-caret ${isExpanded ? 'open' : ''}`} />
                              </div>
                            </div>

                            {/* Expanded Turn Pipeline Diagnostics */}
                            {isExpanded && (
                              <div className="ta-turn-body">

                                {/* Pipeline Latency Flow */}
                                <div className="ta-flow">
                                  <div className="ta-node">
                                    <div className="ta-node-head">🎙️ Sarvam STT</div>
                                    <div className="ta-node-val">{turn.stt_latency_ms ? `${Math.round(turn.stt_latency_ms)} ms` : '—'}</div>
                                    <div className="ta-node-sub">Speech-to-text</div>
                                  </div>

                                  <div className="ta-flow-arrow">➔</div>

                                  <div className="ta-node hl-green">
                                    <div className="ta-node-head">⚡ Fast Bridge LLM</div>
                                    <div className="ta-node-val ta-val-green">
                                      TTFT: {turn.fast_llm?.ttft_ms ? `${Math.round(turn.fast_llm.ttft_ms)} ms` : '—'}
                                    </div>
                                    <div className="ta-node-sub">
                                      Total: {turn.fast_llm?.total_ms ? `${Math.round(turn.fast_llm.total_ms)} ms` : '—'}
                                    </div>
                                  </div>

                                  <div className="ta-flow-arrow">➔</div>

                                  <div className="ta-node hl-amber">
                                    <div className="ta-node-head">🧠 Main Reasoner</div>
                                    <div className="ta-node-val ta-val-amber">
                                      TTFT: {turn.main_llm?.ttft_ms ? `${Math.round(turn.main_llm.ttft_ms)} ms` : '—'}
                                    </div>
                                    <div className="ta-node-sub">
                                      Total: {turn.main_llm?.total_ms ? `${Math.round(turn.main_llm.total_ms)} ms` : '—'}
                                    </div>
                                  </div>

                                  <div className="ta-flow-arrow">➔</div>

                                  <div className="ta-node">
                                    <div className="ta-node-head">🔊 TTS Audio</div>
                                    <div className="ta-node-val">{turn.tts_latency_ms ? `${Math.round(turn.tts_latency_ms)} ms` : '—'}</div>
                                    <div className="ta-node-sub">PCM Synthesis</div>
                                  </div>

                                  <div className="ta-flow-arrow">➔</div>

                                  <div className="ta-node hl-orange">
                                    <div className="ta-node-head">🎯 Evaluator Node</div>
                                    <div className="ta-node-val ta-val-orange">
                                      {turn.evaluation?.latency_ms ? `${Math.round(turn.evaluation.latency_ms)} ms` : '—'}
                                    </div>
                                    <div className="ta-node-sub">
                                      {turn.evaluation?.objective_met ? '✓ Objective Met' : 'In Progress'}
                                    </div>
                                  </div>
                                </div>

                                {/* Dialogue & Reasonings */}
                                <div className="ta-dialogue">
                                  <div className="ta-dialogue-block">
                                    <span className="ta-dialogue-label ta-label-orange">Candidate Utterance:</span>
                                    <p className="ta-dialogue-text">"{turn.user_text || '(No spoken text)'}"</p>
                                  </div>

                                  {turn.fast_llm?.output && (
                                    <div className="ta-dialogue-block">
                                      <span className="ta-dialogue-label ta-label-green">Speculative Filler Generated:</span>
                                      <code className="ta-filler-code">
                                        {turn.fast_llm.output}
                                      </code>
                                    </div>
                                  )}

                                  <div className="ta-dialogue-block">
                                    <span className="ta-dialogue-label ta-label-amber">AI Structured Response:</span>
                                    <p className="ta-dialogue-text">"{turn.response_text || '(No response text)'}"</p>
                                  </div>

                                  {turn.evaluation?.reasoning && (
                                    <div className="ta-dialogue-block ta-eval-note">
                                      <span className="ta-dialogue-label ta-label-muted">Evaluator Reasoning:</span>
                                      <p className="ta-eval-text">
                                        "{turn.evaluation.reasoning}"
                                      </p>
                                    </div>
                                  )}
                                </div>

                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setSelectedSessionId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TelemetryAnalytics;
