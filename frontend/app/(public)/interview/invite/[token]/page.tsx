import React from 'react';
import { CandidateInviteLanding } from '../../../../../src/pages/CandidateInviteLanding';

export default function GuestInvitePage({ params }: { params?: { token?: string } }) {
  // If params is not passed (e.g. Next.js vs SPA), fallback to extracting from window.location
  let token = params?.token || '';
  if (!token && typeof window !== 'undefined') {
    const parts = window.location.pathname.split('/');
    const inviteIdx = parts.indexOf('invite');
    if (inviteIdx !== -1 && parts[inviteIdx + 1]) {
      token = parts[inviteIdx + 1];
    }
  }

  return <CandidateInviteLanding token={token} onNavigate={(page, p) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/${page}${p?.sessionId ? `?sessionId=${p.sessionId}` : ''}`;
    }
  }} />;
}
