import React, { useState } from 'react';
import { EnvelopeSimple, LockKey, Eye, EyeClosed, ShieldWarning, ArrowRight, User, GoogleLogo, GithubLogo, LinkedinLogo, CheckCircle } from '@phosphor-icons/react';
import { Check } from 'lucide-react';
import { authService } from '../services/authService';
import { AuthLayout } from '../components/AuthLayout';

interface SignupPageProps {
  onNavigate: (page: string) => void;
  onSignupSuccess: (tokens: { access_token: string, refresh_token: string }, user: any) => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onNavigate, onSignupSuccess }) => {
  const [step, setStep] = useState<'signup' | 'verify'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let cleanBase = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      cleanBase = cleanBase.replace(/^[0-9_]+/, '');
      if (cleanBase.length < 2) cleanBase = 'candidate';
      const username = `${cleanBase}_${Math.floor(1000 + Math.random() * 9000)}`.substring(0, 30);
      
      await authService.signup({ 
        email, 
        password, 
        username,
        full_name: fullName.trim() 
      });
      
      setSuccessMessage('Verification code sent to your email.');
      setStep('verify');
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('already registered')) {
        setErrorMessage('This email is already registered. Please log in instead.');
      } else {
        setErrorMessage(err.message || 'An error occurred during registration.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otp) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await authService.verifyEmail(email, otp);
      
      const loginRes = await authService.login(email, password);
      const token = loginRes.access_token;
      const userProfile = await authService.getMe(token);
      
      onSignupSuccess(loginRes, userProfile);
      onNavigate('dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await authService.resendVerification(email);
      setSuccessMessage('A new verification code has been sent.');
      setStep('verify');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout onNavigate={onNavigate}>
      {/* ── Editorial brand panel (left column on desktop) ── */}
      <aside className="auth-split-panel">
        <div className="auth-panel-content">
          <div className="auth-panel-pill">
            <span className="auth-panel-pill-dot" aria-hidden="true" />
            <span className="auth-panel-pill-label">Real-Time Voice AI Interviewing</span>
            <span className="auth-panel-pill-meta">WebRTC</span>
          </div>

          <h1 className="auth-panel-headline">
            Start out loud,
            <br />
            get hired <em>for real</em>.
          </h1>

          <p className="auth-panel-sub">
            Create your account and run your first live mock in under a minute — no setup required.
          </p>

          <ul className="auth-panel-list">
            <li className="auth-panel-item">
              <span className="auth-panel-chip" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
              <span>Real-time voice interviewer with follow-ups</span>
            </li>
            <li className="auth-panel-item">
              <span className="auth-panel-chip" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
              <span>Rubric-based scoring on every answer</span>
            </li>
            <li className="auth-panel-item">
              <span className="auth-panel-chip" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
              <span>Roadmaps built from real interview loops</span>
            </li>
          </ul>

          <div className="auth-panel-stats">
            <div className="auth-panel-stat">
              <b>500ms</b>
              <span>voice loop</span>
            </div>
            <div className="auth-panel-stat">
              <b>14</b>
              <span>hidden test suites</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Form card ── */}
      <div className="auth-card">
        {/* Segmented Switcher */}
        {step === 'signup' && (
          <div className="auth-tabs-segmented" role="tablist">
            <button type="button" className="auth-tab-segment" role="tab" aria-selected="false" onClick={() => onNavigate('login')}>Log in</button>
            <button type="button" className="auth-tab-segment active" role="tab" aria-selected="true">Sign up</button>
          </div>
        )}

        {/* Card Header */}
        <div className="auth-card-header">
          <span className="auth-eyebrow">
            {step === 'signup' ? 'Create account' : 'Verify email'}
          </span>
          <h2 className="auth-card-title">
            {step === 'signup' ? 'Create your account' : 'Verify email'}
          </h2>
          {step === 'signup' && (
            <p className="auth-card-subtitle">Your voice interview workspace, ready in under a minute.</p>
          )}
          {step === 'verify' && (
            <p className="auth-card-subtitle">Code sent to <span className="auth-highlight-text">{email}</span></p>
          )}
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="auth-banner-error">
            <ShieldWarning size={16} weight="fill" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="auth-banner-success">
            <CheckCircle size={16} weight="fill" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{successMessage}</span>
          </div>
        )}

        {step === 'signup' && (
          <>
            {/* Social Logins */}
            <div className="auth-social-row">
              <button 
                type="button" 
                className="auth-social-btn" 
                onClick={() => alert('Google authentication is configured in production.')} 
                title="Sign up with Google"
              >
                <GoogleLogo weight="bold" className="social-icon" style={{ color: '#EA4335' }} />
                <span>Google</span>
              </button>
              <button 
                type="button" 
                className="auth-social-btn" 
                onClick={() => alert('GitHub authentication is configured in production.')} 
                title="Sign up with GitHub"
              >
                <GithubLogo weight="fill" className="social-icon" />
                <span>GitHub</span>
              </button>
              <button 
                type="button" 
                className="auth-social-btn" 
                onClick={() => alert('LinkedIn authentication is configured in production.')} 
                title="Sign up with LinkedIn"
              >
                <LinkedinLogo weight="fill" className="social-icon" style={{ color: '#0A66C2' }} />
                <span>LinkedIn</span>
              </button>
            </div>

            <div className="auth-divider">
              <span className="auth-divider-line" />
              <span className="auth-divider-text">or</span>
              <span className="auth-divider-line" />
            </div>

            <form onSubmit={handleSignupSubmit} className="auth-form">
              <div className="auth-input-group">
                <label className="auth-label">Name</label>
                <div className="input-wrapper">
                  <User weight="bold" className="input-icon" size={16} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="auth-input-field"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-label">Email</label>
                <div className="input-wrapper">
                  <EnvelopeSimple weight="bold" className="input-icon" size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="auth-input-field"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-label">Password</label>
                <div className="input-wrapper">
                  <LockKey weight="bold" className="input-icon" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="auth-input-field"
                    required
                    disabled={isLoading}
                  />
                  <button 
                    type="button" 
                    className="toggle-password-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <Eye size={16} /> : <EyeClosed size={16} />}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                className="auth-submit-btn"
                disabled={isLoading || !email || !password || !fullName.trim()}
              >
                {isLoading ? (
                  <div className="spinner-mini" />
                ) : (
                  <>
                    <span>Create account</span>
                    <ArrowRight size={15} weight="bold" />
                  </>
                )}
              </button>
            </form>

            <div className="auth-redirect">
              <span>Already have an account? <button type="button" onClick={() => onNavigate('login')} className="auth-inline-link">Sign in</button></span>
            </div>
          </>
        )}

        {step === 'verify' && (
          <>
            <form onSubmit={handleVerifySubmit} className="auth-form">
              <div className="auth-input-group">
                <label className="auth-label">6-digit code</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="auth-input-field auth-otp-input"
                    maxLength={6}
                    required
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="auth-submit-btn"
                disabled={isLoading || otp.length !== 6}
              >
                {isLoading ? (
                  <div className="spinner-mini" />
                ) : (
                  <>
                    <span>Verify</span>
                    <ArrowRight size={15} weight="bold" />
                  </>
                )}
              </button>
            </form>

            <div className="auth-redirect">
              <span>Didn't receive a code? <button type="button" onClick={handleResendOtp} className="auth-inline-link">Resend</button></span>
              <button 
                type="button" 
                onClick={() => { setStep('signup'); setErrorMessage(null); setSuccessMessage(null); }} 
                className="auth-back-action-btn"
              >
                &larr; Change email or details
              </button>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
};

export default SignupPage;
