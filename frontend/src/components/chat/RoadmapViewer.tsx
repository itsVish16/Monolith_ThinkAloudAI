import React, { useState } from 'react';
import type { Roadmap, RoadmapItem, RoadmapTopic } from '../../services/roadmapService';
import { 
  Laptop, Code, Database, ChartLineUp, Cloud, Users, CalendarBlank, Check, CheckCircle
} from '@phosphor-icons/react';
import { toggleRoadmapItem } from '../../services/roadmapService';
import '../../styles/RoadmapViewer.css';

interface RoadmapViewerProps {
  roadmap: Roadmap;
  onNavigate?: (page: string, params?: any) => void;
}

export const RoadmapViewer: React.FC<RoadmapViewerProps> = ({ roadmap, onNavigate }) => {
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [completedItems, setCompletedItems] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    roadmap.topics?.forEach(topic => {
      topic.items?.forEach(item => {
        if (item.is_completed) initial.add(item.id);
      });
    });
    return initial;
  });

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };
  
  // Helper to get an icon based on the topic index
  const getTopicIcon = (index: number) => {
    const icons = [
      <Laptop size={20} color="var(--accent-orange)" />,
      <Code size={20} color="var(--accent-orange)" />,
      <Database size={20} color="var(--accent-orange)" />,
      <ChartLineUp size={20} color="var(--accent-orange)" />,
      <Cloud size={20} color="var(--accent-orange)" />,
      <Users size={20} color="var(--accent-orange)" />
    ];
    return icons[index % icons.length];
  };

  return (
    <div className="roadmap-timeline-card">
      <div className="roadmap-timeline-header">
        <p className="roadmap-intro-text">
          Here's your personalized roadmap to become a <strong>{roadmap.title}</strong>. {roadmap.description} 🚀
        </p>
      </div>

      <div className="roadmap-timeline-wrapper">
        {roadmap.topics.map((topic, index) => {
          const taskCount = topic.items?.length || 0;
          
          return (
            <div key={topic.id} className="timeline-node-container">
              {/* Vertical line connecting nodes (except last one) */}
              {index !== roadmap.topics.length - 1 && <div className="timeline-vertical-line"></div>}
              
              {/* Node Circle */}
              <div className="timeline-circle">
                {index + 1}
              </div>

              <div className="timeline-content-wrapper" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {/* Content Card */}
                <div 
                  className="timeline-content-card" 
                  onClick={() => toggleTopic(String(topic.id))}
                  style={{ cursor: 'pointer', transition: 'all 0.2s ease', border: expandedTopics[topic.id] ? '1px solid var(--accent-orange)' : undefined }}
                >
                  <div className="topic-icon-wrapper">
                    {getTopicIcon(index)}
                  </div>
                  
                  <div className="topic-text-content">
                    <h4 className="topic-title">{topic.title}</h4>
                    <p className="topic-desc">{topic.description}</p>
                  </div>

                  <div className="topic-duration-badge">
                    <CalendarBlank size={16} />
                    <span>{taskCount} Task{taskCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                
                {/* Expandable Items List */}
                {expandedTopics[topic.id] && topic.items && topic.items.length > 0 && (
                  <div className="topic-expanded-items" style={{ 
                    marginTop: '12px', 
                    marginBottom: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {topic.items.map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        onClick={(e) => {
                          e.stopPropagation(); // prevent toggling topic
                          if (onNavigate) {
                            if (item.content_type === 'dsa') {
                              onNavigate('practice', { questionId: item.content_id || undefined });
                            } else if (item.content_type === 'mock_interview') {
                              const text = `${item.title || ''} ${item.category || ''} ${item.track_type || ''}`.toLowerCase();
                              let targetPage = 'dsa-interview';
                              if (text.includes('system design') || text.includes('system_design')) {
                                targetPage = 'system-design-interview';
                              } else if (
                                text.includes('behavioral') ||
                                text.includes('hr') ||
                                text.includes('general') ||
                                text.includes('pm') ||
                                text.includes('product') ||
                                text.includes('aiml') ||
                                text.includes('ai')
                              ) {
                                targetPage = 'general-interview';
                              }
                              onNavigate('pre-join', { 
                                targetPage, 
                                templateId: item.content_id || 'dsa', 
                                templateName: item.title 
                              });
                            }
                          }
                        }}
                        style={{
                          backgroundColor: '#09090b',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: onNavigate ? 'pointer' : 'default',
                          transition: 'all 0.2s ease'
                        }}
                      onMouseEnter={(e) => {
                        if (onNavigate) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                      }}
                      onMouseLeave={(e) => {
                        if (onNavigate) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                      }}
                    >
                      <div 
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%', 
                          backgroundColor: completedItems.has(item.id) ? 'rgba(34, 197, 94, 0.2)' : 'rgba(249, 115, 22, 0.12)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: completedItems.has(item.id) ? '#22c55e' : '#f97316', 
                          fontSize: '12px', fontWeight: 'bold',
                          transition: 'all 0.2s ease',
                          flexShrink: 0
                        }}
                      >
                        {completedItems.has(item.id) ? <Check weight="bold" size={14} /> : (idx + 1)}
                      </div>
                      <div style={{ opacity: completedItems.has(item.id) ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
                        <div style={{ fontWeight: 500, fontSize: '0.95rem', color: '#e5e7eb', textDecoration: completedItems.has(item.id) ? 'line-through' : 'none' }}>{item.title}</div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
                          {item.content_type === 'dsa' ? 'Practice Problem' : item.content_type === 'mock_interview' ? 'Mock Interview' : 'Custom Task'} 
                          {item.timeline_days ? ` • ${item.timeline_days} day(s)` : ''}
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto' }}>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!item.id) return;
                            
                            // Optimistic update
                            const isDone = completedItems.has(item.id);
                            const nextCompleted = !isDone;
                            setCompletedItems(prev => {
                              const next = new Set(prev);
                              if (isDone) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                            
                            try {
                              await toggleRoadmapItem(item.id, nextCompleted);
                            } catch (error) {
                              console.error("Failed to toggle item", error);
                              // Revert on failure
                              setCompletedItems(prev => {
                                const next = new Set(prev);
                                if (isDone) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              });
                            }
                          }}
                          style={{
                            background: completedItems.has(item.id) ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255,255,255,0.05)',
                            color: completedItems.has(item.id) ? '#22c55e' : '#9ca3af',
                            border: `1px solid ${completedItems.has(item.id) ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            opacity: completedItems.has(item.id) ? 0.8 : 1
                          }}
                          title={completedItems.has(item.id) ? "Mark as incomplete" : "Mark as complete"}
                        >
                          <CheckCircle weight="bold" size={14} />
                          {completedItems.has(item.id) ? 'Done' : 'Mark as Done'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="roadmap-timeline-footer">
        <span className="footer-motivational-text">
          <SparkleIcon /> Stay consistent and you'll achieve your goal! 💪
        </span>
      </div>
    </div>
  );
};

// Helper SVG for the orange sparkle
const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '6px', color: 'var(--accent-orange)'}}>
    <path d="M8 0L10.1518 5.84815L16 8L10.1518 10.1519L8 16L5.84815 10.1519L0 8L5.84815 5.84815L8 0Z" fill="currentColor"/>
  </svg>
);
