import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRole?: 'student' | 'teacher' | 'parent' | 'admin';
}

type TabType = 'login' | 'signup' | 'forgot' | 'confirm';

export function LoginModal({ isOpen, onClose, initialRole = 'student' }: LoginModalProps) {
  const { t } = useTranslation('landing');
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error';text: string;} | null>(null);

  // Login state
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  // Signup state
  const [signupForm, setSignupForm] = useState({
    email: '',
    username: '',
    full_name: '',
    password: '',
    confirm_password: '',
    role: initialRole.toUpperCase()
  });

  // Forgot password state
  const [forgotForm, setForgotForm] = useState({ email: '' });

  if (!isOpen) return null;

  // ============================================================================
  // LOGIN HANDLER
  // ============================================================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await login({
        username: loginForm.username,
        password: loginForm.password
      });

      setMessage({
        type: 'success',
        text: t('auth.login_success') || 'Login successful!'
      });

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('auth.login_error')
      });
      setLoading(false);
    }
  };

  // ============================================================================
  // SIGNUP HANDLER
  // ============================================================================
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (signupForm.password !== signupForm.confirm_password) {
      setMessage({
        type: 'error',
        text: t('auth.passwords_mismatch') || 'Passwords do not match'
      });
      setLoading(false);
      return;
    }

    try {
      await register({
        email: signupForm.email,
        username: signupForm.username,
        full_name: signupForm.full_name,
        password: signupForm.password,
        role: signupForm.role as 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN'
      });

      setMessage({
        type: 'success',
        text: t('auth.signup_success') || 'Account created! Redirecting...'
      });

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('auth.signup_error')
      });
      setLoading(false);
    }
  };

  // ============================================================================
  // FORGOT PASSWORD HANDLER
  // ============================================================================
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // TODO: Add forgot password endpoint
      setMessage({
        type: 'success',
        text: t('auth.reset_link_sent') || 'If email exists, reset link sent'
      });
      setForgotForm({ email: '' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Request failed'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('components_landing_loginmodal.aria_label_authentication', 'Authentication')}>
        {/* Close button */}
        <button className="modal-close" onClick={onClose} aria-label={t('components_landing_loginmodal.aria_label_close_dialog', 'Close dialog')}>×</button>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            role="tab"
            aria-selected={activeTab === 'login'}
            className={`modal-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('login');
              setMessage(null);
            }}>
            {t('auth.login_tab') || 'Login'}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'signup'}
            className={`modal-tab ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('signup');
              setMessage(null);
            }}>
            {t('auth.signup_tab') || 'Sign Up'}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'forgot'}
            className={`modal-tab ${activeTab === 'forgot' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('forgot');
              setMessage(null);
            }}>
            {t('auth.forgot_tab') || 'Forgot Password'}
          </button>
        </div>

        {/* Message */}
        {message &&
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`modal-message modal-message--${message.type}`}>
            {message.text}
          </div>
        }

        {/* LOGIN TAB */}
        {activeTab === 'login' &&
        <form onSubmit={handleLogin} className="modal-form">
            <h2>{t('auth.login_title') || 'Welcome Back'}</h2>

            <div className="form-group">
              <label htmlFor="login-email">
                {t('auth.username_label') || 'Email/Username'}
              </label>
              <input
              id="login-email"
              type="text"
              value={loginForm.username}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              placeholder={t('auth.email_placeholder') || 'you@example.com'}
              required
              disabled={loading} />
            
            </div>

            <div className="form-group">
              <label htmlFor="login-password">
                {t('auth.password_label') || 'Password'}
              </label>
              <input
              id="login-password"
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              placeholder={t('auth.password_placeholder') || '••••••••'}
              required
              disabled={loading} />
            
            </div>

            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Logging in...' : t('auth.login_btn') || 'Login'}
            </button>
          </form>
        }

        {/* SIGNUP TAB */}
        {activeTab === 'signup' &&
        <form onSubmit={handleSignup} className="modal-form">
            <h2>{t('auth.signup_title') || 'Create Account'}</h2>

            <div className="form-group">
              <label htmlFor="signup-name">
                {t('auth.fullname_label') || 'Full Name'}
              </label>
              <input
              id="signup-name"
              type="text"
              value={signupForm.full_name}
              onChange={(e) => setSignupForm({ ...signupForm, full_name: e.target.value })}
              placeholder={t('auth.fullname_placeholder') || 'John Doe'}
              required
              disabled={loading} />
            
            </div>

            <div className="form-group">
              <label htmlFor="signup-email">
                {t('auth.email_label') || 'Email'}
              </label>
              <input
              id="signup-email"
              type="email"
              value={signupForm.email}
              onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
              placeholder={t('auth.email_placeholder') || 'you@example.com'}
              required
              disabled={loading} />
            
            </div>

            <div className="form-group">
              <label htmlFor="signup-username">
                {t('auth.username_label') || 'Username'}
              </label>
              <input
              id="signup-username"
              type="text"
              value={signupForm.username}
              onChange={(e) => setSignupForm({ ...signupForm, username: e.target.value })}
              placeholder={t("landing:johndoe", "johndoe")}
              required
              disabled={loading} />
            
            </div>

            <div className="form-group">
              <label htmlFor="signup-password">
                {t('auth.password_label') || 'Password'}
              </label>
              <input
              id="signup-password"
              type="password"
              value={signupForm.password}
              onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
              placeholder={t('auth.password_placeholder') || '••••••••'}
              required
              disabled={loading} />
            
            </div>

            <div className="form-group">
              <label htmlFor="signup-confirm">
                {t('auth.confirm_password_label') || 'Confirm Password'}
              </label>
              <input
              id="signup-confirm"
              type="password"
              value={signupForm.confirm_password}
              onChange={(e) =>
              setSignupForm({ ...signupForm, confirm_password: e.target.value })
              }
              placeholder={t('auth.password_placeholder') || '••••••••'}
              required
              disabled={loading} />
            
            </div>

            <div className="form-group">
              <label htmlFor="signup-role">
                {t('auth.role_label') || 'I am a'}
              </label>
              <select
              id="signup-role"
              value={signupForm.role}
              onChange={(e) => setSignupForm({ ...signupForm, role: e.target.value })}
              disabled={loading}>
              
                <option value="STUDENT">{t('landing.role_student') || 'Student'}</option>
                <option value="TEACHER">{t('landing.role_teacher') || 'Teacher'}</option>
                <option value="PARENT">{t('landing.role_parent') || 'Parent'}</option>
              </select>
            </div>

            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Creating account...' : t('auth.signup_btn') || 'Sign Up'}
            </button>
          </form>
        }

        {/* FORGOT PASSWORD TAB */}
        {activeTab === 'forgot' &&
        <form onSubmit={handleForgotPassword} className="modal-form">
            <h2>{t('auth.forgot_title') || 'Reset Password'}</h2>
            <p className="modal-subtitle">
              {t('auth.forgot_desc') ||
            "Enter your email and we'll send you a password reset link"}
            </p>

            <div className="form-group">
              <label htmlFor="forgot-email">
                {t('auth.email_label') || 'Email'}
              </label>
              <input
              id="forgot-email"
              type="email"
              value={forgotForm.email}
              onChange={(e) => setForgotForm({ ...forgotForm, email: e.target.value })}
              placeholder={t('auth.email_placeholder') || 'you@example.com'}
              required
              disabled={loading} />
            
            </div>

            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Sending...' : t('auth.forgot_btn') || 'Send Reset Link'}
            </button>
          </form>
        }
      </div>
    </div>);

}

export default LoginModal;