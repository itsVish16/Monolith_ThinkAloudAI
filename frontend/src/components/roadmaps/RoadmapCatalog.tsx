import React, { useState, useMemo } from 'react';
import {
  Sparkle,
  Lightning,
  Database,
  Stack,
  Cpu,
  Rocket,
  MagnifyingGlass,
  ArrowRight,
  Trash,
  CheckCircle,
  FileText,
  GitBranch,
  Plus,
  Fire,
  Star,
  Check,
  X
} from '@phosphor-icons/react';
import type { DAGTrack } from '../../pages/RoadmapsPage';
import '../../styles/RoadmapCatalog.css';

export interface RoadmapCatalogProps {
  tracks: DAGTrack[];
  completedNodes: Set<string>;
  onSelectTrack: (trackId: string) => void;
  onCreateCustom: () => void;
  onDeleteCustomTrack?: (trackId: string) => void;
}

export type RoadmapCategoryTab = 'all' | 'defaults' | 'sheets' | 'custom';

export const RoadmapCatalog: React.FC<RoadmapCatalogProps> = ({
  tracks,
  completedNodes,
  onSelectTrack,
  onCreateCustom,
  onDeleteCustomTrack
}) => {
  const [activeTab, setActiveTab] = useState<RoadmapCategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Helper to categorize tracks
  const getTrackCategory = (track: DAGTrack): 'defaults' | 'sheets' | 'custom' => {
    if (track.id.startsWith('custom-') || track.badge.toLowerCase().includes('custom')) {
      return 'custom';
    }
    if (
      track.id.startsWith('sheet-') ||
      track.name.toLowerCase().includes('sheet') ||
      track.badge.toLowerCase().includes('sheet') ||
      track.id.includes('blind-75')
    ) {
      return 'sheets';
    }
    return 'defaults';
  };

  // Helper icon for track
  const getTrackIcon = (track: DAGTrack) => {
    const id = track.id.toLowerCase();
    if (id.includes('blind-75')) return <Fire size={22} weight="fill" className="track-icon fire" />;
    if (id.includes('striver')) return <FileText size={22} weight="duotone" className="track-icon sheet" />;
    if (id.includes('faang')) return <Star size={22} weight="fill" className="track-icon faang" />;
    if (id.includes('dsa')) return <Lightning size={22} weight="fill" className="track-icon dsa" />;
    if (id.includes('sys')) return <Database size={22} weight="duotone" className="track-icon sys" />;
    if (id.includes('fullstack')) return <Stack size={22} weight="duotone" className="track-icon fullstack" />;
    if (id.includes('ai')) return <Cpu size={22} weight="duotone" className="track-icon ai" />;
    return <Rocket size={22} weight="duotone" className="track-icon custom" />;
  };

  // Calculate track stats
  const getTrackStats = (track: DAGTrack) => {
    const nodeCount = track.nodes.length;
    let totalProblems = 0;
    let completedProblems = 0;

    track.nodes.forEach(node => {
      const probCount = node.totalProblems || 1;
      totalProblems += probCount;
      if (completedNodes.has(node.id) || node.progressPercent === 100) {
        completedProblems += probCount;
      } else if (node.completedProblems) {
        completedProblems += node.completedProblems;
      }
    });

    const percent = Math.min(100, Math.round((completedProblems / Math.max(1, totalProblems)) * 100));
    const isHard = track.nodes.some(n => n.difficulty === 'Hard');
    const difficulty = isHard ? 'Advanced' : 'Intermediate';
    const estimatedHours = `${Math.max(15, Math.round(totalProblems * 1.5))} hrs`;

    return {
      nodeCount,
      totalProblems,
      completedProblems,
      percent,
      difficulty,
      estimatedHours
    };
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    let defaultsCount = 0;
    let sheetsCount = 0;
    let customCount = 0;

    tracks.forEach(track => {
      const cat = getTrackCategory(track);
      if (cat === 'defaults') defaultsCount++;
      else if (cat === 'sheets') sheetsCount++;
      else if (cat === 'custom') customCount++;
    });

    return {
      all: tracks.length,
      defaults: defaultsCount,
      sheets: sheetsCount,
      custom: customCount
    };
  }, [tracks]);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    return tracks.filter(track => {
      const cat = getTrackCategory(track);
      if (activeTab !== 'all' && cat !== activeTab) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = track.name.toLowerCase().includes(q);
        const matchesBadge = track.badge.toLowerCase().includes(q);
        const matchesDesc = track.description.toLowerCase().includes(q);
        const matchesNodes = track.nodes.some(n => n.title.toLowerCase().includes(q));
        if (!matchesName && !matchesBadge && !matchesDesc && !matchesNodes) {
          return false;
        }
      }

      return true;
    });
  }, [tracks, activeTab, searchQuery]);

  return (
    <div className="roadmap-catalog-container">
      {/* Background ambient lighting */}
      <div className="catalog-ambient-glow" />

      {/* Main Content Area */}
      <div className="catalog-inner">
        {/* Header Section */}
        <header className="catalog-header">
          <div className="catalog-header-badge">
            <span className="catalog-badge-dot" />
            <span className="catalog-badge-text">Interactive Curriculum & Interview Sheets</span>
          </div>

          <div className="catalog-header-content">
            <div className="catalog-title-group">
              <h1 className="catalog-title">Explore Engineering Roadmaps</h1>
              <p className="catalog-subtitle">
                Select a foundational track, standard interview sheet, or custom AI company pathway to visualize as an interactive, DAG-structured progression.
              </p>
            </div>

            <button 
              type="button" 
              className="catalog-create-btn"
              onClick={onCreateCustom}
            >
              <Sparkle size={16} weight="fill" />
              <span>Create Custom Pathway</span>
            </button>
          </div>

          {/* Controls Bar: Tabs + Search */}
          <div className="catalog-controls-bar">
            {/* Category Tabs */}
            <div className="catalog-tabs">
              <button
                type="button"
                className={`catalog-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <span>All Roadmaps</span>
                <span className="catalog-tab-count">{categoryCounts.all}</span>
              </button>

              <button
                type="button"
                className={`catalog-tab-btn ${activeTab === 'defaults' ? 'active' : ''}`}
                onClick={() => setActiveTab('defaults')}
              >
                <span>Core Curriculums</span>
                <span className="catalog-tab-count">{categoryCounts.defaults}</span>
              </button>

              <button
                type="button"
                className={`catalog-tab-btn ${activeTab === 'sheets' ? 'active' : ''}`}
                onClick={() => setActiveTab('sheets')}
              >
                <span>Curated Sheets</span>
                <span className="catalog-tab-count">{categoryCounts.sheets}</span>
              </button>

              <button
                type="button"
                className={`catalog-tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
                onClick={() => setActiveTab('custom')}
              >
                <span>Custom Pathways</span>
                <span className="catalog-tab-count">{categoryCounts.custom}</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="catalog-search-wrapper">
              <MagnifyingGlass size={16} className="catalog-search-icon" />
              <input
                type="text"
                placeholder="Search roadmaps, topics, or companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="catalog-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="catalog-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Tracks List */}
        {filteredTracks.length > 0 ? (
          <div className="catalog-list">
            {filteredTracks.map((track) => {
              const cat = getTrackCategory(track);
              const stats = getTrackStats(track);
              const isCustom = cat === 'custom';

              return (
                <div
                  key={track.id}
                  className={`catalog-list-item ${isCustom ? 'is-custom-track' : ''}`}
                  onClick={() => onSelectTrack(track.id)}
                >
                  {/* Left: Icon & Core Details */}
                  <div className="catalog-list-main">
                    <div className="catalog-list-icon-wrapper">
                      {getTrackIcon(track)}
                    </div>

                    <div className="catalog-list-info">
                      <div className="catalog-list-badges">
                        <span className={`catalog-cat-pill ${cat}`}>
                          {cat === 'defaults' && 'Core Track'}
                          {cat === 'sheets' && 'Interview Sheet'}
                          {cat === 'custom' && 'Custom Pathway'}
                        </span>
                        <span className="catalog-list-tag">{track.badge}</span>
                      </div>

                      <h3 className="catalog-list-title">{track.name}</h3>
                      <p className="catalog-list-desc">{track.description}</p>
                    </div>
                  </div>

                  {/* Center: Quick Stats & Curriculum Progress */}
                  <div className="catalog-list-stats-section">
                    <div className="catalog-list-stat-pills">
                      <span className="catalog-stat-pill">
                        <strong>{stats.nodeCount}</strong> Stages
                      </span>
                      <span className="catalog-stat-pill">
                        <strong>{stats.totalProblems}</strong> Problems
                      </span>
                      <span className="catalog-stat-pill difficulty">
                        {stats.difficulty}
                      </span>
                      <span className="catalog-stat-pill hours">
                        {stats.estimatedHours}
                      </span>
                    </div>

                    <div className="catalog-list-progress-box">
                      <div className="catalog-list-progress-labels">
                        <span>{stats.completedProblems} / {stats.totalProblems} Solved</span>
                        <span className="catalog-progress-pct">{stats.percent}%</span>
                      </div>
                      <div className="catalog-progress-track">
                        <div 
                          className="catalog-progress-fill"
                          style={{ width: `${stats.percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions & Explore CTA */}
                  <div className="catalog-list-action">
                    {isCustom && onDeleteCustomTrack && (
                      <button
                        type="button"
                        className="catalog-delete-btn"
                        title="Delete Custom Track"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete custom roadmap "${track.name}"?`)) {
                            onDeleteCustomTrack(track.id);
                          }
                        }}
                      >
                        <Trash size={16} />
                      </button>
                    )}

                    <div className="catalog-list-cta-btn">
                      <span>Explore Roadmap</span>
                      <ArrowRight size={16} weight="bold" className="catalog-cta-arrow" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="catalog-empty-state">
            <div className="catalog-empty-icon">
              <GitBranch size={36} weight="duotone" />
            </div>
            <h3 className="catalog-empty-title">No roadmaps matched your criteria</h3>
            <p className="catalog-empty-desc">
              {searchQuery
                ? `No roadmaps found for "${searchQuery}". Try searching for another topic or clear the filter.`
                : activeTab === 'custom'
                ? "You haven't generated any custom company pathways yet. Click below to synthesize one."
                : 'No roadmaps available in this category.'}
            </p>
            <div className="catalog-empty-actions">
              {searchQuery && (
                <button
                  type="button"
                  className="catalog-empty-btn outline"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search Filter
                </button>
              )}
              <button
                type="button"
                className="catalog-empty-btn primary"
                onClick={onCreateCustom}
              >
                <Sparkle size={15} weight="fill" />
                <span>Create Custom Pathway</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoadmapCatalog;
