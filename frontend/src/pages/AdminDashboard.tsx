import React, { useState } from 'react';
import {
  Users,
  Video,
  Code2,
  ArrowLeft,
  ShieldCheck,
  Activity,
  Calendar,
  Server,
  Sparkles
} from 'lucide-react';
import { UsersAnalytics } from '../components/admin/UsersAnalytics';
import { InterviewsAnalytics } from '../components/admin/InterviewsAnalytics';
import { CodingAnalytics } from '../components/admin/CodingAnalytics';
import { TelemetryAnalytics } from '../components/admin/TelemetryAnalytics';
import { ScheduledInterviewsTable } from '../components/admin/scheduling/ScheduledInterviewsTable';
import '../styles/AdminDashboard.css';

interface AdminDashboardProps {
  onNavigate: (page: string, params?: any) => void;
  user: any;
  initialTab?: 'scheduled' | 'users' | 'interviews' | 'coding' | 'telemetry';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  onNavigate, 
  user,
  initialTab = 'scheduled'
}) => {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'users' | 'interviews' | 'coding' | 'telemetry'>(initialTab);

  const isAdmin = Boolean(
    (user?.role && user.role.toLowerCase() === 'admin') ||
    (user?.is_admin === true)
  );

  return (
    <div className="admin-root">
      {/* Top Navbar */}
      <header className="admin-header-bar">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <button className="admin-back-btn" onClick={() => onNavigate('dashboard')}>
              <ArrowLeft size={16} />
              <span>Back to Dashboard</span>
            </button>
            <div className="admin-header-titles">
              <div className="admin-title-line">
                <h1 className="admin-main-title">
                  ThinkAloud Admin Control Center
                </h1>
                <span className="admin-version-pill">
                  <Sparkles size={11} />
                  v2.0 Monolith
                </span>
              </div>
              <p className="admin-main-subtitle">
                Unified live candidate invites, rubric scoring, problem banks, and real-time voice latency telemetry
              </p>
            </div>
          </div>

          <div className="admin-header-meta">
            <div className="admin-cluster-pill">
              <Server size={13} className="admin-cluster-icon" />
              <span>Cluster Active</span>
              <span className="admin-cluster-dot" />
            </div>

            <div className="admin-user-pill">
              <ShieldCheck size={14} />
              <span>{user?.email || 'admin@thinkaloudai.tech'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="admin-canvas">

        {/* Segmented Tab Navigation Switcher */}
        <div className="adm-tabbar" role="tablist" aria-label="Admin control center sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'scheduled'}
            className={`adm-tab ${activeTab === 'scheduled' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('scheduled')}
          >
            <Calendar size={15} />
            <span>Scheduled Candidates</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            className={`adm-tab ${activeTab === 'users' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={15} />
            <span>Users &amp; Gamification</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'interviews'}
            className={`adm-tab ${activeTab === 'interviews' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('interviews')}
          >
            <Video size={15} />
            <span>Mock Interviews Audit</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'coding'}
            className={`adm-tab ${activeTab === 'coding' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('coding')}
          >
            <Code2 size={15} />
            <span>DSA Catalog &amp; Submissions</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'telemetry'}
            className={`adm-tab ${activeTab === 'telemetry' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('telemetry')}
          >
            <Activity size={15} />
            <span>Voice Latency &amp; Telemetry</span>
          </button>
        </div>

        {/* Tab Viewport */}
        <div className="admin-panel-viewport" key={activeTab}>
          {activeTab === 'scheduled' && <ScheduledInterviewsTable onNavigate={onNavigate} />}
          {activeTab === 'users' && <UsersAnalytics />}
          {activeTab === 'interviews' && <InterviewsAnalytics />}
          {activeTab === 'coding' && <CodingAnalytics />}
          {activeTab === 'telemetry' && <TelemetryAnalytics />}
        </div>
      </main>
    </div>
  );
};
