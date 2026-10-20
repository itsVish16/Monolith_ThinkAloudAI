import React from 'react';
import { PreJoinInterview } from './PreJoinInterview';

interface CandidateInviteLandingProps {
  token: string;
  onNavigate: (page: string, params?: any) => void;
}

/**
 * CandidateInviteLanding acts as the invite-only entry point,
 * rendering the unified luxury PreJoin page with strict camera, mic, and sound verification.
 */
export const CandidateInviteLanding: React.FC<CandidateInviteLandingProps> = ({
  token,
  onNavigate,
}) => {
  return <PreJoinInterview inviteToken={token} onNavigate={onNavigate} />;
};

export default CandidateInviteLanding;
