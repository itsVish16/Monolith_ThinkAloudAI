import React, { useState } from 'react';
import { EnvelopeSimple, LockKey, Eye, EyeClosed, ShieldWarning, ArrowRight, GoogleLogo, GithubLogo, LinkedinLogo, CheckCircle } from '@phosphor-icons/react';
import { Check } from 'lucide-react';
import { authService } from '../services/authService';
import { AuthLayout } from '../components/AuthLayout';

interface LoginPageProps {
  onNavigate: (page: string) => void;
  onLoginSuccess: (tokens: { access_token: string, refresh_token: string }, user: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate, onLoginSuccess }) => {
  const [step, setStep] = useState<'login' | 'forgot_password' | 'reset_password'>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const loginRes = await authService.login(email, password);
      const token = loginRes.access_token;
      const userProfile = await authService.getMe(token);
      onLoginSuccess(loginRes, userProfile);
      onNavigate('dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await authService.forgotPassword(email);
      setSuccessMessage(`Password reset code sent to ${email}`);
      setStep('reset_password');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to request password reset.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otp || !newPassword) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await authService.resetPassword(email, otp, newPassword);
      setSuccessMessage('Password reset successfully! Logging you in...');
      
      // Auto login
      const loginRes = await authService.login(email, newPassword);
      const token = loginRes.access_token;
      const userProfile = await authService.getMe(token);
      onLoginSuccess(loginRes, userProfile);
      onNavigate('dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired reset code.');
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
            Practice out loud,
            <br />
            get hired <em>for real</em>.
          </h1>

          <p className="auth-panel-sub">
            Pick up your voice mocks, rubric scores and roadmaps right where you left off.
          </p>

          <ul className="auth-panel-list">
            <li className="auth-panel-item">
              <span className="auth-panel-chip" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
              <span>Resume scored voice mock interviews</span>
            </li>
            <li className="auth-panel-item">
              <span className="auth-panel-chip" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
              <span>Review rubric feedback from every session</span>
            </li>
            <li className="auth-panel-item">
              <span className="auth-panel-chip" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
              <span>Continue your interview roadmap</span>
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
        {step === 'login' && (
          <div className="auth-tabs-segmented" role="tablist">
            <button type="button" className="auth-tab-segment active" role="tab" aria-selected="true">Log in</button>
            <button type="button" className="auth-tab-segment" role="tab" aria-selected="false" onClick={() => onNavigate('signup')}>Sign up</button>
          </div>
        )}

        {/* Card Header */}
        <div className="auth-card-header">
          <span className="auth-eyebrow">
            {step === 'login' && 'Welcome back'}
            {step === 'forgot_password' && 'Password reset'}
            {step === 'reset_password' && 'Set new password'}
          </span>
          <h2 className="auth-card-title">
            {step === 'login' && 'Log in to your workspace'}
            {step === 'forgot_password' && 'Reset password'}
            {step === 'reset_password' && 'New password'}
          </h2>
          {step === 'login' && (
            <p className="auth-card-subtitle">Your sessions, scores and roadmaps are waiting for you.</p>
          )}
          {step === 'forgot_password' && (
            <p className="auth-card-subtitle">Enter your email to receive a code</p>
          )}
          {step === 'reset_password' && (
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

        {step === 'login' && (
          <>
            {/* Social Logins */}
            <div className="auth-social-row">
              <button 
                type="button" 
                className="auth-social-btn" 
                onClick={() => alert('Google authentication is configured in production.')} 
                title="Continue with Google"
              >
                <GoogleLogo weight="bold" className="social-icon" style={{ color: '#EA4335' }} />
                <span>Google</span>
              </button>
              <button 
                type="button" 
                className="auth-social-btn" 
                onClick={() => alert('GitHub authentication is configured in production.')} 
                title="Continue with GitHub"
              >
                <GithubLogo weight="fill" className="social-icon" />
                <span>GitHub</span>
              </button>
              <button 
                type="button" 
                className="auth-social-btn" 
                onClick={() => alert('LinkedIn authentication is configured in production.')} 
                title="Continue with LinkedIn"
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

            <form onSubmit={handleLoginSubmit} className="auth-form">
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
                    placeholder="Password"
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

              <div className="auth-options-row">
                <label className="auth-checkbox-label">
                  <input type="checkbox" className="auth-checkbox" defaultChecked />
                  <span>Remember me</span>
                </label>
                <span 
                  className="forgot-pass-btn" 
                  onClick={() => { setStep('forgot_password'); setErrorMessage(null); setSuccessMessage(null); }}
                >
                  Forgot password?
                </span>
              </div>

              <button 
                type="submit" 
                className="auth-submit-btn"
                disabled={isLoading || !email || !password}
              >
                {isLoading ? (
                  <div className="spinner-mini" />
                ) : (
                  <>
                    <span>Log in</span>
                    <ArrowRight size={15} weight="bold" />
                  </>
                )}
              </button>
            </form>

            <div className="auth-redirect">
              <span>New here? <button type="button" onClick={() => onNavigate('signup')} className="auth-inline-link">Create an account</button></span>
            </div>
          </>
        )}

        {step === 'forgot_password' && (
          <>
            <form onSubmit={handleForgotPasswordSubmit} className="auth-form">
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

              <button 
                type="submit" 
                className="auth-submit-btn"
                disabled={isLoading || !email}
              >
                {isLoading ? (
                  <div className="spinner-mini" />
                ) : (
                  <>
                    <span>Send code</span>
                    <ArrowRight size={15} weight="bold" />
                  </>
                )}
              </button>
            </form>

            <div className="auth-redirect">
              <button 
                type="button" 
                onClick={() => { setStep('login'); setErrorMessage(null); setSuccessMessage(null); }} 
                className="auth-back-action-btn"
              >
                &larr; Back to Log in
              </button>
            </div>
          </>
        )}

        {step === 'reset_password' && (
          <>
            <form onSubmit={handleResetPasswordSubmit} className="auth-form">
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

              <div className="auth-input-group">
                <label className="auth-label">New password</label>
                <div className="input-wrapper">
                  <LockKey weight="bold" className="input-icon" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
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
                disabled={isLoading || otp.length !== 6 || !newPassword}
              >
                {isLoading ? (
                  <div className="spinner-mini" />
                ) : (
                  <>
                    <span>Reset password</span>
                    <ArrowRight size={15} weight="bold" />
                  </>
                )}
              </button>
            </form>

            <div className="auth-redirect">
              <span>Didn't receive a code? <button type="button" onClick={handleForgotPasswordSubmit} className="auth-inline-link">Resend</button></span>
              <button 
                type="button" 
                onClick={() => { setStep('login'); setErrorMessage(null); setSuccessMessage(null); }} 
                className="auth-back-action-btn"
              >
                &larr; Back to Log in
              </button>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
};

export default LoginPage;
