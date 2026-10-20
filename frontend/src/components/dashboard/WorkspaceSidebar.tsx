import React, { useEffect, useState } from 'react';
import { Collapsible, DropdownMenu, Tooltip } from 'radix-ui';
import {
  House,
  ChatCircleDots,
  CodeBlock,
  VideoCamera,
  ChatText,
  Plus,
  DotsThree,
  CaretRight,
  CaretUpDown,
  SidebarSimple,
  Trash,
  User,
  SignOut,
  Sparkle,
  Info,
  ArrowRight,
} from '@phosphor-icons/react';
import '../../styles/WorkspaceSidebar.css';

export type WorkspaceSection = 'home' | 'chat' | 'practice' | 'interview' | 'schedules' | 'progress';

interface NavChild {
  label: string;
  section?: WorkspaceSection;
  page?: string;
}

interface NavEntry {
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  section: WorkspaceSection;
  children?: NavChild[];
}

/* The workspace menu — grouped like a platform console: primary sections
   with expandable sub-views, followed by the recent session list. */
const NAV_ENTRIES: NavEntry[] = [
  { key: 'home', label: 'Dashboard', icon: House, section: 'home' },
  { key: 'chat', label: 'AI Chat', icon: ChatCircleDots, section: 'chat' },
  {
    key: 'practice',
    label: 'Practice Arena',
    icon: CodeBlock,
    section: 'practice',
    children: [
      { label: 'DSA Problem Set', section: 'practice' },
      { label: 'Roadmaps', section: 'schedules' },
    ],
  },
  {
    key: 'interview',
    label: 'Mock Interviews',
    icon: VideoCamera,
    section: 'interview',
    children: [
      { label: 'Interview Tracks', page: 'interview-types' },
      { label: 'DSA Interview', page: 'dsa-interview' },
      { label: 'System Design', page: 'system-design-interview' },
      { label: 'Behavioral & HR', page: 'general-interview' },
    ],
  },
];

const EXPANDED_STORAGE_KEY = 'thinkaloud_sidebar_expanded';

interface WorkspaceSidebarProps {
  user: any;
  isAdmin: boolean;
  activeSection: WorkspaceSection;
  activeChatId: string | null;
  chats: { id: string; title: string }[];
  onSectionSwitch: (section: WorkspaceSection) => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (event: React.MouseEvent, chatId: string) => void;
  onNewChat: () => void;
  onNavigate: (page: string, params?: any) => void;
  onLogout: () => void;
  /** Mobile drawer state (viewport ≤820px). */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  user,
  isAdmin,
  activeSection,
  activeChatId,
  chats,
  onSectionSwitch,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  onNavigate,
  onLogout,
  mobileOpen = false,
  onMobileClose,
}) => {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(EXPANDED_STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    practice: activeSection === 'practice' || activeSection === 'schedules',
    interview: activeSection === 'interview',
  }));

  // Keep the group holding the active view open
  useEffect(() => {
    if (activeSection === 'practice' || activeSection === 'schedules') {
      setOpenGroups((prev) => (prev.practice ? prev : { ...prev, practice: true }));
    } else if (activeSection === 'interview') {
      setOpenGroups((prev) => (prev.interview ? prev : { ...prev, interview: true }));
    }
  }, [activeSection]);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, String(next));
      } catch {
        /* storage unavailable — ignore */
      }
      return next;
    });
  };

  const initials = (user?.full_name || user?.username || 'Candidate')
    .substring(0, 2)
    .toUpperCase();
  const displayName = user?.full_name || user?.username || 'Candidate';
  const displaySub = user?.email || user?.role || 'Member';

  // On mobile the drawer always renders in its expanded form.
  const isExpanded = expanded || mobileOpen;

  // Icon-rail mode: menu buttons get hover tooltips
  const withTooltip = (label: string, node: React.ReactElement) =>
    isExpanded ? (
      node
    ) : (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{node}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="wsb-tooltip" side="right" align="center" sideOffset={8}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );

  return (
    <Tooltip.Provider delayDuration={150}>
      {mobileOpen && (
        <button
          type="button"
          className="wsb-mobile-scrim"
          aria-label="Close navigation"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`wsb-sidebar ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${mobileOpen ? 'is-mobile-open' : ''}`}
        data-state={isExpanded ? 'expanded' : 'collapsed'}
      >
        {/* Drag rail — click the edge to collapse / expand */}
        <button
          type="button"
          className={`wsb-rail wsb-rail-${isExpanded ? 'collapse' : 'expand'}`}
          onClick={toggleExpanded}
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        />

        {/* Header: workspace switcher */}
        <div className="wsb-header">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="wsb-brand-btn" title="Workspace menu">
                {isExpanded ? (
                  <>
                    <img src="/logo.png" alt="ThinkAloud.AI" className="wsb-brand-logo" />
                    <CaretUpDown size={13} weight="bold" className="wsb-chevron" />
                  </>
                ) : (
                  <span className="wsb-brand-mark">
                    <img src="/favicon.svg" alt="" aria-hidden="true" />
                  </span>
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="wsb-dropdown"
                side="right"
                align="start"
                sideOffset={8}
              >
                <DropdownMenu.Label className="wsb-dropdown-label">Workspace</DropdownMenu.Label>
                <DropdownMenu.Item className="wsb-dropdown-item" onSelect={() => onSectionSwitch('home')}>
                  <House size={15} />
                  <span>Candidate Dashboard</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="wsb-dropdown-item" onSelect={() => onNavigate('profile')}>
                  <User size={15} />
                  <span>Profile &amp; Achievements</span>
                </DropdownMenu.Item>
                {isAdmin && (
                  <DropdownMenu.Item className="wsb-dropdown-item is-admin" onSelect={() => onNavigate('admin')}>
                    <Info size={15} />
                    <span>Admin Console</span>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="wsb-dropdown-sep" />
                <DropdownMenu.Item className="wsb-dropdown-item" onSelect={onNewChat}>
                  <span className="wsb-add-box">
                    <Plus size={13} weight="bold" />
                  </span>
                  <span>New AI Chat</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {isExpanded && (
            <button
              type="button"
              className="wsb-toggle-btn"
              onClick={toggleExpanded}
              title="Collapse sidebar"
            >
              <SidebarSimple size={17} />
            </button>
          )}
        </div>

        {/* Content: platform nav + recent sessions */}
        <div className="wsb-content">
          <div className="wsb-group">
            {isExpanded && <div className="wsb-group-label">Platform</div>}
            <ul className="wsb-menu">
              {NAV_ENTRIES.map((entry) => {
                const Icon = entry.icon;
                const isActive = activeSection === entry.section;
                const iconEl = <Icon size={17} weight={isActive ? 'fill' : 'regular'} />;

                if (!entry.children || !isExpanded) {
                  const btn = (
                    <button
                      type="button"
                      className={`wsb-btn ${isActive ? 'is-active' : ''}`}
                      onClick={() => onSectionSwitch(entry.section)}
                    >
                      {iconEl}
                      {isExpanded && <span className="wsb-btn-label">{entry.label}</span>}
                    </button>
                  );
                  return (
                    <li key={entry.key} className="wsb-menu-item">
                      {withTooltip(entry.label, btn)}
                    </li>
                  );
                }

                const isOpen = !!openGroups[entry.key];
                return (
                  <li key={entry.key} className="wsb-menu-item">
                    <Collapsible.Root open={isOpen}>
                      <Collapsible.Trigger asChild>
                        <button
                          type="button"
                          className={`wsb-btn ${isActive ? 'is-active' : ''}`}
                          onClick={() => {
                            setOpenGroups((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }));
                            onSectionSwitch(entry.section);
                          }}
                        >
                          {iconEl}
                          <span className="wsb-btn-label">{entry.label}</span>
                          <CaretRight
                            size={12}
                            weight="bold"
                            className={`wsb-btn-chevron ${isOpen ? 'is-open' : ''}`}
                          />
                        </button>
                      </Collapsible.Trigger>
                      <Collapsible.Content>
                        <ul className="wsb-sub">
                          {entry.children.map((child) => {
                            const childActive = child.section ? activeSection === child.section : false;
                            return (
                              <li key={child.label}>
                                <button
                                  type="button"
                                  className={`wsb-sub-btn ${childActive ? 'is-active' : ''}`}
                                  onClick={() => {
                                    if (child.page) {
                                      onNavigate(child.page);
                                    } else if (child.section) {
                                      onSectionSwitch(child.section);
                                    }
                                  }}
                                >
                                  <span>{child.label}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </Collapsible.Content>
                    </Collapsible.Root>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Recent sessions — mirrors the "Projects" group */}
          <div className="wsb-group">
            {isExpanded && (
              <div className="wsb-group-label">
                <span>Recent Sessions</span>
                <button
                  type="button"
                  className="wsb-group-action"
                  onClick={onNewChat}
                  title="Start new chat"
                >
                  <Plus size={12} weight="bold" />
                </button>
              </div>
            )}
            <ul className="wsb-menu">
              {chats.map((chat) => {
                const isActive = activeSection === 'chat' && activeChatId === chat.id;
                const btn = (
                  <button
                    type="button"
                    className={`wsb-btn ${isExpanded ? 'has-action' : ''} ${isActive ? 'is-active' : ''}`}
                    onClick={() => onSelectChat(chat.id)}
                  >
                    <ChatText size={16} weight={isActive ? 'fill' : 'regular'} />
                    {isExpanded && <span className="wsb-btn-label">{chat.title}</span>}
                  </button>
                );
                return (
                  <li key={chat.id} className="wsb-menu-item">
                    {withTooltip(chat.title, btn)}
                    {isExpanded && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button type="button" className="wsb-menu-action" aria-label="Session options">
                            <DotsThree size={16} weight="bold" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            className="wsb-dropdown"
                            side="right"
                            align="start"
                            sideOffset={6}
                          >
                            <DropdownMenu.Item
                              className="wsb-dropdown-item"
                              onSelect={() => onSelectChat(chat.id)}
                            >
                              <ArrowRight size={14} />
                              <span>Open Session</span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="wsb-dropdown-sep" />
                            <DropdownMenu.Item
                              className="wsb-dropdown-item is-danger"
                              onSelect={(event) =>
                                onDeleteChat(event as unknown as React.MouseEvent, chat.id)
                              }
                            >
                              <Trash size={14} />
                              <span>Delete Session</span>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </li>
                );
              })}
              {chats.length === 0 && (
                <li className="wsb-menu-item">
                  {withTooltip(
                    'New chat',
                    <button type="button" className="wsb-btn wsb-btn-empty" onClick={onNewChat}>
                      {isExpanded ? <span>No sessions yet — start one</span> : <ChatText size={16} />}
                    </button>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Footer: account menu */}
        <div className="wsb-footer">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="wsb-user-btn" title="Account menu">
                <span className="wsb-avatar">{initials}</span>
                {isExpanded && (
                  <>
                    <span className="wsb-user-text">
                      <span className="wsb-user-name">{displayName}</span>
                      <span className="wsb-user-sub">{displaySub}</span>
                    </span>
                    <CaretUpDown size={13} weight="bold" className="wsb-chevron" />
                  </>
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="wsb-dropdown"
                side="right"
                align="end"
                sideOffset={8}
              >
                <DropdownMenu.Label className="wsb-dropdown-user">
                  <span className="wsb-avatar">{initials}</span>
                  <span className="wsb-user-text">
                    <span className="wsb-user-name">{displayName}</span>
                    <span className="wsb-user-sub">{displaySub}</span>
                  </span>
                </DropdownMenu.Label>
                <DropdownMenu.Separator className="wsb-dropdown-sep" />
                <DropdownMenu.Item
                  className="wsb-dropdown-item"
                  onSelect={() => onNavigate('interview-types')}
                >
                  <Sparkle size={15} />
                  <span>Start Mock Interview</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="wsb-dropdown-sep" />
                <DropdownMenu.Item
                  className="wsb-dropdown-item"
                  onSelect={() => onNavigate('profile')}
                >
                  <User size={15} />
                  <span>My Profile</span>
                </DropdownMenu.Item>
                {isAdmin && (
                  <DropdownMenu.Item
                    className="wsb-dropdown-item is-admin"
                    onSelect={() => onNavigate('admin')}
                  >
                    <Info size={15} />
                    <span>Admin Console</span>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="wsb-dropdown-sep" />
                <DropdownMenu.Item className="wsb-dropdown-item is-danger" onSelect={onLogout}>
                  <SignOut size={15} />
                  <span>Log Out</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </aside>
    </Tooltip.Provider>
  );
};

export default WorkspaceSidebar;
