import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface InterviewCompleteScreenProps {
  onExit?: () => void;
}

const GUEST_SESSION_KEYS = [
  'guest_invite_token',
  'guest_interview_token',
  'guest_interview_url',
  'guest_session_id',
  'guest_interview_data',
];

export const InterviewCompleteScreen: React.FC<InterviewCompleteScreenProps> = ({ onExit }) => {
  const handleExit = () => {
    GUEST_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));

    if (onExit) {
      onExit();
      return;
    }

    window.location.assign('/');
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto mb-6 shadow-xl shadow-emerald-900/20">
          <CheckCircle2 size={34} aria-hidden="true" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          Interview complete
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed mt-3">
          Your scores and analysis will be emailed to your personal email.
        </p>

        <button
          type="button"
          onClick={handleExit}
          className="w-full sm:w-auto mt-8 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-950/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090E]"
        >
          Exit
        </button>
      </div>
    </div>
  );
};

export default InterviewCompleteScreen;
