import React from 'react';
import { GuestCandidateReport } from '../../../../../../src/pages/GuestCandidateReport';

export default function GuestInviteReportPage({ params }: { params?: { token?: string } }) {
  let token = params?.token || '';
  if (!token && typeof window !== 'undefined') {
    const parts = window.location.pathname.split('/');
    const inviteIdx = parts.indexOf('invite');
    if (inviteIdx !== -1 && parts[inviteIdx + 1]) {
      token = parts[inviteIdx + 1];
    }
  }

  return <GuestCandidateReport token={token} onNavigate={(page, p) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/${page}${p?.sessionId ? `?sessionId=${p.sessionId}` : ''}`;
    }
  }} />;
}
