import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  FileText
} from 'lucide-react';
import { getGuestInterviewReport } from '../services/interviewService';

interface GuestCandidateReportProps {
  token: string;
  onNavigate?: (page: string, params?: any) => void;
}

export const GuestCandidateReport: React.FC<GuestCandidateReportProps> = ({
  token,
  onNavigate,
}) => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    async function loadReport() {
      try {
        setLoading(true);
        setErrorMsg(null);
        const data = await getGuestInterviewReport(token);
        if (!isCurrent) return;
        setReport(data);
      } catch (err: any) {
        if (!isCurrent) return;
        setErrorMsg(err.message || 'Evaluation report could not be loaded.');
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    if (token) {
      loadReport();
    } else {
      setErrorMsg('No invitation token provided.');
      setLoading(false);
    }

    return () => {
      isCurrent = false;
    };
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090E] flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-sm font-semibold text-slate-300">Generating Evaluation Scorecard...</h2>
        <p className="text-xs text-slate-500 mt-1">Aggregating audio analysis, code quality, and Rubric scores</p>
      </div>
    );
  }

  if (errorMsg || !report) {
    return (
      <div className="min-h-screen bg-[#07090E] flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-md w-full p-8 bg-[#0D0F18] border border-slate-800 rounded-3xl text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-lg font-bold text-white">Report Not Found</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {errorMsg || 'Your interview session may still be processing or analysis has not yet concluded. Please refresh in a moment.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs rounded-xl shadow-lg transition"
          >
            Refresh Scorecard
          </button>
        </div>
      </div>
    );
  }

  const candidateEmail = report.candidate_email || '';

  return (
    <div className="min-h-screen bg-[#07090F] text-slate-100 flex flex-col justify-between">
      
      {/* Top Navbar */}
      <header className="px-6 py-4 border-b border-slate-800/80 bg-slate-950/50 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="ThinkAloudAI" className="h-7 w-auto" />
          <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">Interview Session Concluded</span>
        </div>
      </header>

      {/* Main Thank You & Email Notification View */}
      <main className="max-w-xl mx-auto w-full px-6 py-16 flex-1 flex flex-col items-center justify-center text-center">
        
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-6 shadow-xl shadow-emerald-900/20">
          <CheckCircle2 size={34} />
        </div>

        {/* Title & Greeting */}
        <h1 className="text-2xl font-black text-white tracking-tight sm:text-3xl">
          Interview Completed Successfully
        </h1>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          Thank you, <strong className="text-slate-200">{report.candidate_name}</strong>! Your technical interview session has officially concluded and your responses have been recorded.
        </p>

        {/* Informative Notification Card */}
        <div className="w-full mt-8 p-6 bg-[#0D0F1A] border border-slate-800/90 rounded-2xl text-left space-y-4 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-violet-950/50 border border-violet-500/30 text-violet-400 mt-0.5">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Evaluation In Progress
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Our AI evaluation engine is analyzing your interview session, code execution metrics, and think-aloud problem-solving approach.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Interview Track:</span>
              <span className="font-semibold text-slate-200 capitalize">{report.interview_type || 'Data Structures & Algorithms'}</span>
            </div>
            {candidateEmail && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Report Recipient:</span>
                <span className="font-mono text-emerald-400">{candidateEmail}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Delivery Status:</span>
              <span className="text-amber-400 font-medium">Detailed scorecard will be emailed shortly</span>
            </div>
          </div>
        </div>

        {/* Return Button */}
        <div className="w-full mt-8">
          <a
            href="/"
            className="w-full py-3 px-6 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs rounded-xl border border-slate-700/80 transition shadow-lg inline-block text-center"
          >
            Return to ThinkAloudAI
          </a>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-slate-900 text-center text-xs text-slate-600">
        &copy; {new Date().getFullYear()} ThinkAloudAI. The AI-Powered Technical Interview Platform.
      </footer>
    </div>
  );
};

export default GuestCandidateReport;

