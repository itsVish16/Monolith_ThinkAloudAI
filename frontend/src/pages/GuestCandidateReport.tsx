import React from 'react';
import { InterviewCompleteScreen } from '../components/interview/InterviewCompleteScreen';

interface GuestCandidateReportProps {
  token: string;
  onNavigate?: (page: string, params?: any) => void;
}

export const GuestCandidateReport: React.FC<GuestCandidateReportProps> = ({
  onNavigate,
}) => {
  return (
    <InterviewCompleteScreen
      onExit={onNavigate ? () => onNavigate('landing') : undefined}
    />
  );
};

export default GuestCandidateReport;
