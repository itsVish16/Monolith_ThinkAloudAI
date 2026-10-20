import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  Trash2, 
  Eye, 
  Plus, 
  X, 
  Award, 
  ExternalLink,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import type { AdminUserItem, UserStats, UserDossier, AchievementItem } from '../../services/adminService';
import '../../styles/AdminAnalytics.css';

interface UsersAnalyticsProps {
  initialStats?: UserStats;
}

export const UsersAnalytics: React.FC<UsersAnalyticsProps> = ({ initialStats }) => {
  const [stats, setStats] = useState<UserStats | null>(initialStats || null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  // Modals
  const [selectedDossier, setSelectedDossier] = useState<UserDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [isAchievementModalOpen, setIsAchievementModalOpen] = useState(false);
  const [newAchievement, setNewAchievement] = useState({ title: '', description: '', icon_url: '' });

  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const loadStats = async () => {
    try {
      const s = await adminService.getUsersStats();
      setStats(s);
    } catch (e) {
      console.warn("Could not load fresh user stats:", e);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const is_verified = verifiedFilter === 'all' ? undefined : verifiedFilter === 'verified';
      const data = await adminService.getUsers({
        page,
        limit: 15,
        search: search.trim() || undefined,
        is_verified
      });
      setUsers(data.items || []);
      setTotalPages(data.pages || 1);
      setTotalUsersCount(data.total || (data.items ? data.items.length : 0));
    } catch (e) {
      console.error("Failed to load users list:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadAchievements = async () => {
    try {
      const ach = await adminService.getAchievements();
      setAchievements(ach);
    } catch (e) {
      console.warn("Could not load achievements:", e);
    }
  };

  useEffect(() => {
    loadStats();
    loadAchievements();
  }, []);

  useEffect(() => {
    loadUsers();
  }, [page, verifiedFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  const handleToggleVerified = async (user: AdminUserItem) => {
    try {
      const nextStatus = !user.is_verified;
      await adminService.updateUserStatus(user.id, { is_verified: nextStatus });
      setUsers(users.map(u => u.id === user.id ? { ...u, is_verified: nextStatus } : u));
      loadStats();
    } catch (e: any) {
      alert("Failed to update status: " + e.message);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    setConfirmState({
      title: 'Delete User Account',
      message: `Are you sure you want to permanently delete user #${userId}?`,
      confirmLabel: 'Delete User',
      onConfirm: async () => {
        try {
          await adminService.deleteUser(userId);
          setUsers(users.filter(u => u.id !== userId));
          loadStats();
        } catch (e: any) {
          alert("Failed to delete user: " + e.message);
        }
      }
    });
  };

  const handleOpenDossier = async (userId: number) => {
    try {
      setLoadingDossier(true);
      const dossier = await adminService.getUserDossier(userId);
      setSelectedDossier(dossier);
    } catch (e: any) {
      alert("Failed to load dossier: " + e.message);
    } finally {
      setLoadingDossier(false);
    }
  };

  const handleCreateAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await adminService.createAchievement(newAchievement);
      setAchievements([...achievements, created]);
      setIsAchievementModalOpen(false);
      setNewAchievement({ title: '', description: '', icon_url: '' });
    } catch (e: any) {
      alert("Failed to create achievement: " + e.message);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="admin-tab-content ana-tab-content">
      {/* 0. Page header block */}
      <div className="ana-tab-header">
        <div className="ana-tab-header-main">
          <div className="ana-tab-title-row">
            <h2 className="ana-tab-title">Users &amp; Gamification</h2>
            <span className="ana-count-chip">{stats?.total_users ?? totalUsersCount} users</span>
          </div>
          <p className="ana-tab-subtitle">
            Registered candidates, verification state, and gamification badge unlocks across the platform.
          </p>
        </div>
        <div className="ana-tab-header-actions">
          <button
            className="ana-icon-refresh"
            title="Refresh user data"
            aria-label="Refresh user data"
            onClick={() => { setPage(1); loadUsers(); loadStats(); }}
          >
            <RefreshCw size={16} className={loading ? 'ana-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 1. Header Metrics HUD */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon orange">
            <Users size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Total Registered Users</span>
            <span className="admin-stat-val">{stats?.total_users ?? totalUsersCount}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon green">
            <ShieldCheck size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Verified Candidates</span>
            <span className="admin-stat-val">{stats?.verified_users ?? '-'}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon amber">
            <ShieldAlert size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Unverified Accounts</span>
            <span className="admin-stat-val">{stats?.unverified_users ?? '-'}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon gold">
            <Award size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">System Achievements</span>
            <span className="admin-stat-val">{achievements.length}</span>
          </div>
        </div>
      </div>

      {/* 2. Directory Action Bar */}
      <div className="admin-table-header-card">
        <div className="admin-filter-row ana-toolbar">
          <form onSubmit={handleSearchSubmit} className="admin-search-box ana-toolbar-search">
            <Search size={16} className="text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by username, email, or name..."
              aria-label="Search users by username, email, or name"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </form>

          <div className="admin-filter-group ana-toolbar-actions">
            <select 
              value={verifiedFilter} 
              onChange={(e: any) => { setVerifiedFilter(e.target.value); setPage(1); }}
              className="admin-select"
            >
              <option value="all">All Verification Status</option>
              <option value="verified">Verified Only</option>
              <option value="unverified">Unverified Only</option>
            </select>

            <button className="admin-btn-secondary" onClick={() => { setPage(1); loadUsers(); }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button className="admin-btn-primary" onClick={() => setIsAchievementModalOpen(true)}>
              <Plus size={15} />
              <span>New Achievement</span>
            </button>
          </div>
        </div>

        {/* 3. Paginated User Table */}
        <div className="admin-table-wrapper">
          <table className="admin-table ana-table-mid">
            <thead>
              <tr>
                <th>ID</th>
                <th>Candidate / User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Role</th>
                <th>Joined</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ana-empty">
                      <RefreshCw size={14} className="ana-spin" />
                      <span>Loading user directory...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ana-empty">
                      <Users size={15} />
                      <span>No users found matching query.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id}>
                    <td className="font-mono text-gray-400">#{u.id}</td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">{u.full_name || u.username}</span>
                        <span className="text-xs text-gray-400 font-mono">@{u.username}</span>
                      </div>
                    </td>
                    <td className="font-mono text-xs text-gray-300">{u.email}</td>
                    <td>
                      <span 
                        onClick={() => handleToggleVerified(u)}
                        className={`admin-status-pill cursor-pointer ana-pill-click ${u.is_verified ? 'verified' : 'unverified'}`}
                        title="Click to toggle verification status"
                      >
                        {u.is_verified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-role-pill ${u.role === 'admin' || u.is_admin ? 'admin' : 'user'}`}>
                        {u.role || (u.is_admin ? 'admin' : 'user')}
                      </span>
                    </td>
                    <td className="text-xs text-gray-400">{formatDate(u.created_at)}</td>
                    <td>
                      <div className="admin-action-btns">
                        <button 
                          className="admin-icon-btn view" 
                          title="View Full Dossier" 
                          onClick={() => handleOpenDossier(u.id)}
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          className="admin-icon-btn delete" 
                          title="Delete User Account"
                          onClick={() => handleDeleteUser(u.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="admin-pagination">
          <span className="text-xs text-gray-400">Page <span className="ana-mono">{page}</span> of <span className="ana-mono">{totalPages}</span> (<span className="ana-mono">{totalUsersCount}</span> users)</span>
          <div className="flex gap-2">
            <button 
              disabled={page <= 1} 
              onClick={() => setPage(p => p - 1)}
              className="admin-btn-page"
            >
              Previous
            </button>
            <button 
              disabled={page >= totalPages} 
              onClick={() => setPage(p => p + 1)}
              className="admin-btn-page"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          USER DOSSIER MODAL
          ============================================================ */}
      {selectedDossier && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card ana-modal-md" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                Candidate Dossier — @{selectedDossier.user.username}
              </h3>
              <button className="admin-modal-close" onClick={() => setSelectedDossier(null)} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Identity Row */}
              <div className="admin-dossier-hero">
                <div className="admin-dossier-avatar">
                  {selectedDossier.profile?.avatar_url ? (
                    <img src={selectedDossier.profile.avatar_url} alt="Avatar" />
                  ) : (
                    <span className="text-xl font-bold text-orange-400">
                      {selectedDossier.user.username[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">{selectedDossier.user.full_name || selectedDossier.user.username}</h4>
                  <p className="text-sm text-gray-400">{selectedDossier.user.email}</p>
                  <div className="ana-dossier-hero-meta">
                    <span className={`admin-status-pill ${selectedDossier.user.is_verified ? 'verified' : 'unverified'}`}>
                      {selectedDossier.user.is_verified ? 'Verified Account' : 'Unverified'}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      Target: {selectedDossier.profile?.target_role || 'Software Engineer'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bio & Details */}
              <div className="admin-dossier-section">
                <label className="admin-dossier-label">Bio / Career Objective</label>
                <p className="ana-dossier-bio">
                  {selectedDossier.profile?.bio || 'No candidate bio provided.'}
                </p>
              </div>

              {/* Meta Links */}
              <div className="grid grid-cols-2 gap-3">
                <div className="ana-dossier-meta">
                  <span className="ana-dossier-meta-label">GitHub</span>
                  {selectedDossier.profile?.github_url ? (
                    <a href={selectedDossier.profile.github_url} target="_blank" rel="noreferrer" className="ana-dossier-meta-value">
                      {selectedDossier.profile.github_url} <ExternalLink size={12} />
                    </a>
                  ) : <span className="ana-dossier-meta-value dim">Not linked</span>}
                </div>

                <div className="ana-dossier-meta">
                  <span className="ana-dossier-meta-label">LinkedIn</span>
                  {selectedDossier.profile?.linkedin_url ? (
                    <a href={selectedDossier.profile.linkedin_url} target="_blank" rel="noreferrer" className="ana-dossier-meta-value">
                      {selectedDossier.profile.linkedin_url} <ExternalLink size={12} />
                    </a>
                  ) : <span className="ana-dossier-meta-value dim">Not linked</span>}
                </div>
              </div>

              {/* Achievements Shelf */}
              <div className="admin-dossier-section">
                <label className="admin-dossier-label">Unlocked Achievements</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedDossier.achievements && selectedDossier.achievements.length > 0 ? (
                    selectedDossier.achievements.map(a => (
                      <div key={a.id} className="admin-achievement-tag">
                        <Award size={14} className="text-orange-400" />
                        <span>{a.title}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">No achievements unlocked yet.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setSelectedDossier(null)}>
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          CREATE ACHIEVEMENT MODAL
          ============================================================ */}
      {isAchievementModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Create System Achievement</h3>
              <button className="admin-modal-close" onClick={() => setIsAchievementModalOpen(false)} title="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAchievement} className="admin-modal-form">
              <div className="admin-form-group">
                <label>Achievement Title</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. System Architect"
                  value={newAchievement.title}
                  onChange={e => setNewAchievement({ ...newAchievement, title: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label>Description / Criteria</label>
                <textarea 
                  rows={3}
                  required
                  placeholder="e.g. Scored 90+ in 5 System Design mock interviews."
                  value={newAchievement.description}
                  onChange={e => setNewAchievement({ ...newAchievement, description: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label>Badge Icon URL</label>
                <input 
                  type="url"
                  placeholder="https://assets.thinkaloudai.tech/badges/system-architect.svg"
                  value={newAchievement.icon_url}
                  onChange={e => setNewAchievement({ ...newAchievement, icon_url: e.target.value })}
                />
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="admin-btn-secondary" onClick={() => setIsAchievementModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn-primary">
                  Save Achievement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          DELETE CONFIRMATION MODAL
          ============================================================ */}
      {confirmState && (
        <div className="admin-modal-overlay" onClick={() => setConfirmState(null)}>
          <div
            className="admin-modal-card ana-modal-sm"
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">{confirmState.title}</h3>
              <button className="admin-modal-close" onClick={() => setConfirmState(null)} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="ana-confirm-body">
                <span className="ana-confirm-icon">
                  <AlertTriangle size={16} />
                </span>
                <p className="ana-confirm-text">{confirmState.message}</p>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setConfirmState(null)}>
                Cancel
              </button>
              <button
                className="ana-btn-danger"
                onClick={() => {
                  const action = confirmState.onConfirm;
                  setConfirmState(null);
                  action();
                }}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
