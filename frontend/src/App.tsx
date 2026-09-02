/**
 * Peripateticware App.tsx - COMPLETE INTEGRATION
 */

import React, { useState, useEffect, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from './config/i18n'
import axios from 'axios'
import { useAuthStore } from './stores/auth'
import { initAnalytics, trackPageview } from './utils/analytics'

import './design-system.css'
import { useSkin } from './hooks/useSkin'
import { useGlobalPrivacyControl } from './hooks/useGlobalPrivacyControl'
import CookieConsentBanner from './components/CookieConsentBanner'
import UpgradeModal from './components/UpgradeModal'
const ParentConsentPage = React.lazy(() => import('./pages/ParentConsentPage'));
import './styles/globals.css'
import './styles/landing.css'

const DIRECTION_COLORS = {
  'field-guide': { primary: '#4a7c59', secondary: '#8b6f47', background: '#faf7f2', name: 'Field Guide' },
  'terrain':     { primary: '#d4a574', secondary: '#5bc4a0', background: '#f5f0e6', name: 'Terrain' },
  'atmosphere':  { primary: '#a89dd5', secondary: '#4a9ef0', background: '#141c17', name: 'Atmosphere' }
}

const LandingPage = React.lazy(() => import('./components/LandingPage'));
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage'));
const TermsPage = React.lazy(() => import('./pages/TermsPage'));
const CookiePolicyPage = React.lazy(() => import('./pages/CookiePolicyPage'));
const DoNotSellPage = React.lazy(() => import('./pages/DoNotSellPage'));
const BlogListPage = React.lazy(() => import('./pages/BlogListPage'));
const BlogPostPage = React.lazy(() => import('./pages/BlogPostPage'));
const LoginScreen = React.lazy(() => import('./components/auth/LoginScreen'));
const SignUpScreen = React.lazy(() => import('./components/auth/SignUpScreen'));
const RequestBetaPage = React.lazy(() => import('./components/auth/RequestBetaPage'));
const LicensingPage = React.lazy(() => import('./pages/LicensingPage'));

const StudentDashboard = React.lazy(() => import('./pages/StudentDashboard'));
const TeacherDashboard = React.lazy(() => import('./pages/TeacherDashboard'));
const ParentDashboard = React.lazy(() => import('./pages/ParentDashboard'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const AdminPrivacyConfigPage = React.lazy(() => import('./pages/AdminPrivacyConfigPage'));
const AdminAuditLogPage = React.lazy(() => import('./pages/AdminAuditLogPage'));
const OrgAIConfigPage = React.lazy(() => import('./pages/org/admin/OrgAIConfigPage'));
const AdminHelpPage = React.lazy(() => import('./pages/admin/AdminHelpPage'));

const ActivityListPage = React.lazy(() => import('./pages/teacher/ActivityListPage'));
const SharedLibraryPage = React.lazy(() => import('./pages/teacher/SharedLibraryPage'));
const TeacherClassroomPage = React.lazy(() => import('./pages/teacher/TeacherClassroomPage'));
const TeacherClassroomsPage = React.lazy(() => import('./pages/teacher/TeacherClassroomsPage'));
const TeacherMessagesPage = React.lazy(() => import('./pages/teacher/TeacherMessagesPage'));
const TeacherCalendarPage = React.lazy(() => import('./pages/teacher/TeacherCalendarPage'));
const TeacherWelcomePage = React.lazy(() => import('./pages/teacher/TeacherWelcomePage'));
const ProjectsPage = React.lazy(() => import('./pages/teacher/ProjectsPage'));
const ProjectDetailPage = React.lazy(() => import('./pages/teacher/ProjectDetailPage'));
const ProjectNewPage = React.lazy(() => import('./pages/teacher/ProjectNewPage'));
const ProjectLiveTrackingPage = React.lazy(() => import('./pages/teacher/ProjectLiveTrackingPage'));
const ProjectCompletionReportPage = React.lazy(() => import('./pages/teacher/ProjectCompletionReportPage'));
const TrackingSettingsPage = React.lazy(() => import('./pages/teacher/TrackingSettingsPage'));
const TeacherTourPage = React.lazy(() => import('./pages/teacher/TeacherTourPage').then(m => ({ default: m.TeacherTourPage })));
const ActivityManager = React.lazy(() => import('./components/teacher/ActivityManager'));
const TeacherSettingsPage = React.lazy(() => import('./pages/TeacherSettingsPage').then(m => ({ default: m.TeacherSettingsPage })));
const TeacherApprovalDashboard = React.lazy(() => import('./components/teacher/TeacherApprovalDashboard').then(m => ({ default: m.TeacherApprovalDashboard })));
const RubricsPage = React.lazy(() => import('./pages/teacher/RubricsPage'));
const ReflectionEditorPage = React.lazy(() => import('./pages/student/ReflectionEditorPage'));
const PrivacyEnginePage = React.lazy(() => import('./pages/PrivacyEnginePage'));
const PrivacyConfirmationPage = React.lazy(() => import('./pages/PrivacyConfirmationPage'));
const PlatformShell = React.lazy(() => import('./layouts/PlatformShell'));
const PlatformOverviewPage = React.lazy(() => import('./pages/platform/PlatformOverviewPage'));
const PlatformOrgsPage = React.lazy(() => import('./pages/platform/PlatformOrgsPage'));
const PlatformOrgDetailPage = React.lazy(() => import('./pages/platform/PlatformOrgDetailPage'));
const PlatformUsagePage = React.lazy(() => import('./pages/platform/PlatformUsagePage'));
const PlatformAuditLogPage = React.lazy(() => import('./pages/platform/PlatformAuditLogPage'));
const PlatformAISettingsPage = React.lazy(() => import('./pages/platform/PlatformAISettingsPage'));
const OriginStoryPage = React.lazy(() => import('./pages/OriginStoryPage'));
const RubricBuilder = React.lazy(() => import('./components/teacher/RubricBuilder'));
const StudentActivityPreview = React.lazy(() => import('./components/teacher/StudentActivityPreview'));
const _FieldNoteEditor = React.lazy(() => import('./components/student/FieldNoteEditor').then(m => ({ default: m.FieldNoteEditor })));
const _SelfProjectView = React.lazy(() => import('./components/student/SelfProjectView').then(m => ({ default: m.SelfProjectView })));
const _FieldNoteReview = React.lazy(() => import('./components/teacher/FieldNoteReview').then(m => ({ default: m.FieldNoteReview })));
const TeacherSubmissionsPage = React.lazy(() => import('./pages/TeacherSubmissionsPage'));
const ProfessorFieldworkPage = React.lazy(() => import('./pages/teacher/ProfessorFieldworkPage'));

const StudentHowItWorksPage = React.lazy(() => import('./pages/student/StudentHowItWorksPage'));
const StudentCalendarPage = React.lazy(() => import('./pages/student/StudentCalendarPage'));
const SessionPage = React.lazy(() => import('./pages/SessionPage'));
const StudentSettingsPage = React.lazy(() => import('./pages/StudentSettingsPage').then(m => ({ default: m.StudentSettingsPage })));
const FieldNotesListPage = React.lazy(() => import('./pages/student/FieldNotesListPage'));
const SelfProjectsListPage = React.lazy(() => import('./pages/student/SelfProjectsListPage'));
const PeerProjectsListPage = React.lazy(() => import('./pages/student/PeerProjectsListPage'));
const PeerProjectDetailPage = React.lazy(() => import('./pages/student/PeerProjectDetailPage'));
const ProposalsListPage = React.lazy(() => import('./pages/student/ProposalsListPage'));
const ProposalFormPage = React.lazy(() => import('./pages/student/ProposalFormPage'));
const StudentActivitiesPage = React.lazy(() => import('./pages/student/StudentActivitiesPage'));
const TeacherProposalReviewPage = React.lazy(() => import('./pages/teacher/TeacherProposalReviewPage'));
const StudentActivityDetailPage = React.lazy(() => import('./pages/StudentActivityDetailPage'));

const ParentFeaturesPage = React.lazy(() => import('./pages/parent/ParentFeaturesPage'));
const ParentCalendarPage = React.lazy(() => import('./pages/ParentCalendarPage'));
const ParentNotificationsPage = React.lazy(() => import('./pages/ParentNotificationsPage'));
const ParentReportsPage = React.lazy(() => import('./pages/ParentReportsPage'));
const LinkChildPage = React.lazy(() => import('./pages/LinkChildPage'));
const VerifyEmailPendingPage = React.lazy(() => import('./pages/auth/VerifyEmailPendingPage'));
const VerifyEmailPage = React.lazy(() => import('./pages/auth/VerifyEmailPage'));
const TeacherLayout = React.lazy(() => import('./layouts/TeacherLayout'));
const StudentLayout = React.lazy(() => import('./layouts/StudentLayout'));
const ParentLayout = React.lazy(() => import('./layouts/ParentLayout'));
const AdminLayout = React.lazy(() => import('./layouts/AdminLayout'));
const HomeschoolLayout = React.lazy(() => import('./layouts/HomeschoolLayout'));
const HomeschoolDashboard = React.lazy(() => import('./pages/homeschool/HomeschoolDashboard'));
const HomeschoolWelcomePage = React.lazy(() => import('./pages/homeschool/HomeschoolWelcomePage'));
const HomeschoolChildrenPage = React.lazy(() => import('./pages/homeschool/HomeschoolChildrenPage'));
const HomeschoolProgressPage = React.lazy(() => import('./pages/homeschool/HomeschoolProgressPage'));
const HomeschoolRequirementsPage = React.lazy(() => import('./pages/homeschool/HomeschoolRequirementsPage'));
const HomeschoolCoveragePage = React.lazy(() => import('./pages/homeschool/HomeschoolCoveragePage'));
const HomeschoolExportPage = React.lazy(() => import('./pages/homeschool/HomeschoolExportPage'));
const HomeschoolCalendarPage = React.lazy(() => import('./pages/homeschool/HomeschoolCalendarPage'));
const HomeschoolSettingsPage = React.lazy(() => import('./pages/homeschool/HomeschoolSettingsPage'));

const ForgotPasswordPage = React.lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/auth/ResetPasswordPage'));
const ParentProgressPage = React.lazy(() => import('./pages/ParentProgressPage'));
const ParentSettingsPage = React.lazy(() => import('./pages/ParentSettingsPage').then(m => ({ default: m.ParentSettingsPage })));

const AdminSettingsPage = React.lazy(() => import('./pages/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage })));
const AdminUsersPage = React.lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminClassesPage = React.lazy(() => import('./pages/admin/AdminClassesPage'));
const AdminAnalyticsPage = React.lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AdminSystemPage = React.lazy(() => import('./pages/admin/AdminSystemPage'));
const TeacherStudentsPage = React.lazy(() => import('./pages/teacher/TeacherStudentsPage'));
const RubricImportPage = React.lazy(() => import('./pages/teacher/RubricImportPage'));
const StandardsImportPage = React.lazy(() => import('./pages/teacher/StandardsImportPage'));
const TeacherStandardsPage = React.lazy(() => import('./pages/teacher/TeacherStandardsPage'));
const TeacherSessionMonitorPage = React.lazy(() => import('./pages/teacher/TeacherSessionMonitorPage'));
const CurriculumImportPage = React.lazy(() => import('./pages/admin/CurriculumImportPage'));
const AdminStandardsPage = React.lazy(() => import('./pages/admin/AdminStandardsPage'));
const AdminBlogPage = React.lazy(() => import('./pages/admin/AdminBlogPage'));
const AdminBlogEditorPage = React.lazy(() => import('./pages/admin/AdminBlogEditorPage'));
const AdminPagesPage = React.lazy(() => import('./pages/admin/AdminPagesPage'));
const AdminPageBlockEditorPage = React.lazy(() => import('./pages/admin/AdminPageBlockEditorPage'));
const ParentMessagesPage = React.lazy(() => import('./pages/ParentMessagesPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));
const MaintenancePage = React.lazy(() => import('./pages/MaintenancePage'));
const StudentJournalPage = React.lazy(() => import('./pages/student/StudentJournalPage'));

const API_BASE = '/api/v1'

interface User {
  id: string
  email: string
  role: 'student' | 'teacher' | 'parent' | 'admin' | 'homeschool'
  name?: string
  first_name?: string
  last_name?: string
  organization_id?: string
}

interface AuthResponse {
  access_token?: string
  token?: string
  user?: User
  message?: string
  role?: string
  email?: string
  user_id?: string
  // mfa_required=true means access_token is NOT a real session token --
  // it's a short-lived mfa_pending token (5 min) that must be exchanged
  // via authService.mfaLogin() along with a TOTP/backup code before it's
  // good for anything. Storing it as a real session here would be a
  // second-factor bypass, so login() below deliberately skips its usual
  // localStorage/axios-header side effects on this branch.
  mfa_required?: boolean
}

function _persistSession(data: AuthResponse) {
  const token = data.access_token || data.token
  if (!token) return
  localStorage.setItem('auth_token', token)
  localStorage.setItem('auth_user', JSON.stringify({
    id: data.user_id, email: data.email,
    role: (data.role || 'student').toLowerCase()
  }))
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

class AuthService {
  async login(email: string, password: string): Promise<AuthResponse> {
    const endpoints = [`${API_BASE}/auth/login`]
    for (const endpoint of endpoints) {
      try {
        const response = await axios.post(endpoint, { email, password })
        if (response.data?.mfa_required) {
          // Second factor still needed -- do NOT persist this token as a
          // session. Caller (LoginScreenWrapper) must prompt for a code
          // and complete the login via mfaLogin() below.
          return response.data
        }
        if (response.data?.access_token || response.data?.token) {
          _persistSession(response.data)
          return response.data
        }
      } catch (err: any) {
        if (err.response?.status === 404) continue
        throw err
      }
    }
    throw new Error('No valid auth endpoint found')
  }

  /** Second step of a login for an MFA-enabled account -- exchanges the
   * mfa_pending token (login()'s access_token when mfa_required was true)
   * plus a TOTP or backup code for a real session. */
  async mfaLogin(mfaToken: string, code: string): Promise<AuthResponse> {
    const response = await axios.post(`${API_BASE}/auth/mfa/login`, { mfa_token: mfaToken, code })
    _persistSession(response.data)
    return response.data
  }

  async signup(data: { email: string; password: string; password_confirm?: string; first_name?: string; last_name?: string; name?: string; role?: string; age_confirmed?: boolean; [key: string]: any }): Promise<AuthResponse> {
    const endpoints = [`${API_BASE}/auth/signup`]
    for (const endpoint of endpoints) {
      try {
        const response = await axios.post(endpoint, data)
        if (response.data?.access_token || response.data?.token) {
          const token = response.data.access_token || response.data.token
          localStorage.setItem('auth_token', token)
          localStorage.setItem('auth_user', JSON.stringify({
            id: response.data.user_id, email: response.data.email,
            role: (response.data.role || 'student').toLowerCase()
          }))
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
          return response.data
        }
      } catch (err: any) {
        if (err.response?.status === 404) continue
        throw err
      }
    }
    throw new Error('No valid auth endpoint found')
  }

  logout() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    delete axios.defaults.headers.common['Authorization']
  }

  getUser(): User | null {
    const u = localStorage.getItem('auth_user')
    return u ? JSON.parse(u) : null
  }

  getToken(): string | null { return localStorage.getItem('auth_token') }
  isAuthenticated(): boolean { return !!this.getToken() }
}

const authService = new AuthService()
const savedToken = authService.getToken()
if (savedToken) axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`

const LoginScreenWrapper: React.FC = () => {
  // LoginScreen manages its own form state, submission (via useAuthStore's
  // login/mfaLogin/mfaRequired), and post-login navigation internally -- it
  // accepts onLogin/email/password/etc. props but its actual <form> submit
  // handler never calls them (uses react-hook-form + the store directly).
  // This wrapper used to duplicate a whole login+MFA flow here passing
  // those dead props; removed after confirming in a real browser that
  // typing/submitting through this wrapper's fields had no effect on the
  // rendered form at all. See useAuthStore.login()/mfaLogin() in
  // stores/auth.ts and the mfaRequired branch in LoginScreen.tsx for the
  // real implementation.
  return <LoginScreen />
}

const SignUpScreenWrapper: React.FC = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ email: '', password: '', password_confirm: '', first_name: '', last_name: '', role: 'student', age_confirmed: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    if (formData.password !== formData.password_confirm) { setError('Passwords do not match'); setLoading(false); return }
    try {
      const response = await authService.signup({ ...formData, age_confirmed: true })
      const role = (response.role || formData.role).toLowerCase()
      navigate(role === 'teacher' ? '/teacher/activities' : role === 'homeschool' ? '/homeschool' : role === 'parent' ? '/parent' : role === 'admin' ? '/admin' : '/student', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Signup failed. Try again.')
    } finally { setLoading(false) }
  }

  return <SignUpScreen onSignup={handleSignup} error={error} loading={loading} formData={formData} onFormChange={(field, value) => setFormData(prev => ({ ...prev, [field]: value }))} />
}

// Gates the /signup route between the real signup form and the "Request Beta
// Access" page, based on the backend's SIGNUP_MODE config. Open mode (default)
// always shows the real form — zero behaviour change from before this existed.
// Invite-only mode shows the Request Beta page unless a ?invite=CODE param is
// present, in which case the real form is shown (and the code is validated by
// the backend on submit).
const SignupGateWrapper: React.FC = () => {
  const [signupMode, setSignupMode] = useState<'open' | 'invite_only' | 'loading'>('loading')
  const hasInviteParam = new URLSearchParams(window.location.search).has('invite')

  useEffect(() => {
    fetch('/api/v1/config/public')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setSignupMode(data?.signup_mode === 'invite_only' ? 'invite_only' : 'open'))
      .catch(() => setSignupMode('open')) // fail open — never block signup on a config-fetch hiccup
  }, [])

  if (signupMode === 'loading') return null
  if (signupMode === 'invite_only' && !hasInviteParam) return <RequestBetaPage />
  return <SignUpScreenWrapper />
}

/** Decodes the `is_content_admin` claim out of a JWT without verifying its
 *  signature (browser-side only -- same technique layouts/PlatformShell.tsx's
 *  isPlatformAdminToken() uses). Deliberately independent of role='admin' --
 *  neither required (real content editors here are role='teacher'
 *  accounts) nor sufficient on its own (role='admin' test/demo seed
 *  accounts like test_admin/admin@example.com exist with published
 *  passwords and must not automatically get content-editing access just by
 *  having that role). is_content_admin is the sole, independent gate. */
function isContentAdminToken(token: string | null): boolean {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload?.is_content_admin === true
  } catch {
    return false
  }
}

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRole?: string | string[]; requireContentAdmin?: boolean }> = ({ children, requiredRole, requireContentAdmin }) => {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />
  if (requiredRole) {
    const user = authService.getUser()
    const userRole = user?.role?.toLowerCase()
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    if (!allowed.includes(userRole ?? '') && userRole !== 'admin') return <Navigate to="/" replace />
  }
  if (requireContentAdmin && !isContentAdminToken(authService.getToken())) return <Navigate to="/" replace />
  return <>{children}</>
}


// ── Phase 7 page wrappers (components need props derived from route params) ──

const FieldNoteEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  return <_FieldNoteEditor noteId={id} />
}
const SelfProjectViewPage: React.FC = () => <_SelfProjectView />
// classId defaults to undefined → component receives || undefined → shows all classes
const FieldNoteReviewPage: React.FC = () => <_FieldNoteReview classId="" />

// Shown briefly while a route's lazy-loaded chunk downloads (see the
// React.lazy conversions above — every page/layout is now its own chunk
// instead of one ~1.65MB bundle). Deliberately minimal: this should only
// flash for a moment on a reasonable connection, so it avoids anything
// that would itself cause layout shift or feel like a "real" loading state.
const RouteLoadingFallback: React.FC = () => (
  <div
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-muted, #888)' }}
    aria-live="polite"
    aria-busy="true"
  >
    Loading…
  </div>
)

const App: React.FC = () => {
  const { skin, setSkin } = useSkin()
  // Legacy alias so any remaining DIRECTION_COLORS refs still resolve
  const direction = skin
  const setDirection = setSkin
  const location = useLocation()

  // Honour the Global Privacy Control browser signal (CPRA) — auto opt-out.
  useGlobalPrivacyControl()

  useEffect(() => { useAuthStore.getState().checkAuth() }, [])

  // GA4 — buyer-funnel analytics (marketing site + teacher/parent/admin/
  // homeschool dashboards). Guarded in utils/analytics.ts against ever
  // firing on student routes or student sessions. See that file for why.
  useEffect(() => { initAnalytics() }, [])
  useEffect(() => { trackPageview(location.pathname) }, [location.pathname])

  // RTL support — set dir attribute on <html> whenever language changes
  useEffect(() => {
    const RTL_LANGS = ['ar', 'he', 'fa', 'ur']
    const applyDir = (lng: string) => {
      if (!lng) return
      const lang = lng.split('-')[0]
      document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr'
      document.documentElement.lang = lng
    }
    applyDir(i18n.language)
    i18n.on('languageChanged', applyDir)
    return () => { i18n.off('languageChanged', applyDir) }
  }, [])

  return (
    <I18nextProvider i18n={i18n}>
      <div className="min-h-screen" style={{ backgroundColor: DIRECTION_COLORS[direction].background }}>
        <CookieConsentBanner />
        <UpgradeModal />
        <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* PUBLIC */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/privacy-engine" element={<PrivacyEnginePage />} />
          <Route path="/about/origin" element={<OriginStoryPage />} />
          <Route path="/blog" element={<BlogListPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiePolicyPage />} />
          <Route path="/do-not-sell" element={<DoNotSellPage />} />
          <Route path="/parent-consent/:token" element={<ParentConsentPage />} />
          <Route path="/login" element={<LoginScreenWrapper />} />
          <Route path="/signup" element={<SignupGateWrapper />} />
          <Route path="/request-beta" element={<RequestBetaPage />} />
          <Route path="/licensing" element={<LicensingPage />} />
          <Route path="/verify-email-pending" element={<VerifyEmailPendingPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/privacy-confirmed" element={<PrivacyConfirmationPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />

          {/* Platform super-admin routes — all wrapped in PlatformShell (back + logout header) */}
          <Route element={<PlatformShell />}>
            <Route path="/platform" element={<PlatformOverviewPage />} />
            <Route path="/platform/orgs" element={<PlatformOrgsPage />} />
            <Route path="/platform/orgs/:orgId" element={<PlatformOrgDetailPage />} />
            <Route path="/platform/usage" element={<PlatformUsagePage />} />
            <Route path="/platform/audit-log" element={<PlatformAuditLogPage />} />
            <Route path="/platform/ai-settings" element={<PlatformAISettingsPage />} />
          </Route>

          {/* STUDENT */}
          <Route path="/student" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentDashboard /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/how-it-works" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentHowItWorksPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/calendar" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentCalendarPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/settings" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentSettingsPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/field-notes" element={<ProtectedRoute requiredRole="student"><StudentLayout><FieldNotesListPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/field-notes/:id" element={<ProtectedRoute requiredRole="student"><StudentLayout><FieldNoteEditorPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/self-projects" element={<ProtectedRoute requiredRole="student"><StudentLayout><SelfProjectsListPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/self-projects/:id" element={<ProtectedRoute requiredRole="student"><StudentLayout><SelfProjectViewPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/peer-projects" element={<ProtectedRoute requiredRole="student"><StudentLayout><PeerProjectsListPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/peer-projects/:id" element={<ProtectedRoute requiredRole="student"><StudentLayout><PeerProjectDetailPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/proposals" element={<ProtectedRoute requiredRole="student"><StudentLayout><ProposalsListPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/proposals/:id" element={<ProtectedRoute requiredRole="student"><StudentLayout><ProposalFormPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/reflection/:id" element={<ProtectedRoute requiredRole="student"><StudentLayout><ReflectionEditorPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/activities" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentActivitiesPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/activities/:id" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentActivityDetailPage /></StudentLayout></ProtectedRoute>} />
          <Route path="/session/:id" element={<ProtectedRoute requiredRole="student"><SessionPage /></ProtectedRoute>} />

          {/* TEACHER */}
          <Route path="/teacher" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherDashboard /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/welcome" element={<ProtectedRoute requiredRole="teacher"><TeacherWelcomePage /></ProtectedRoute>} />
          <Route path="/teacher/projects" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ProjectsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/projects/new" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ProjectNewPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/projects/:id" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ProjectDetailPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/projects/:id/live-tracking" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ProjectLiveTrackingPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/projects/:id/report" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ProjectCompletionReportPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/tracking-settings" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TrackingSettingsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/activities" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ActivityListPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/activities/new" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ActivityManager /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/activities/:id" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ActivityManager /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/tour" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherTourPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/settings" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherSettingsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/submissions" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherSubmissionsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/field-note-review" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><FieldNoteReviewPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/peer-project-review" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherApprovalDashboard /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/proposal-review" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherProposalReviewPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/rubrics" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><RubricsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/rubrics/import" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><RubricImportPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/standards" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherStandardsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/standards/import" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><StandardsImportPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/rubrics/new" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><RubricBuilder /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/rubrics/:id" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><RubricBuilder /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/shared-library" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><SharedLibraryPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/activities/:id/student-preview" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><StudentActivityPreview /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/activities/:id/fieldwork" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ProfessorFieldworkPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/all-activities" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ActivityListPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/sessions/:id/monitor" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherSessionMonitorPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/students" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherStudentsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/classrooms" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherClassroomsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/classrooms/:id" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherClassroomPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/messages" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherMessagesPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/calendar" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherCalendarPage /></TeacherLayout></ProtectedRoute>} />

          {/* PARENT */}
          <Route path="/parent" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentDashboard /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/features" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentFeaturesPage /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/progress" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentProgressPage /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/settings" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentSettingsPage /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/link-child" element={<ProtectedRoute requiredRole="parent"><ParentLayout><LinkChildPage /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/messages" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentMessagesPage /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/calendar" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentCalendarPage /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/reports" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentReportsPage /></ParentLayout></ProtectedRoute>} />
          <Route path="/parent/notifications" element={<ProtectedRoute requiredRole="parent"><ParentLayout><ParentNotificationsPage /></ParentLayout></ProtectedRoute>} />

          {/* HOMESCHOOL */}
          <Route path="/homeschool" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolDashboard /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/welcome" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolWelcomePage /></ProtectedRoute>} />
          <Route path="/homeschool/children" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolChildrenPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/progress" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolProgressPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/activities" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><ActivityListPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/activities/new" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><ActivityManager /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/activities/:id" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><ActivityManager /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/tracking-settings" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><TrackingSettingsPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/requirements" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolRequirementsPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/coverage" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolCoveragePage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/export" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolExportPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/calendar" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolCalendarPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/settings" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolSettingsPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/rubrics" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><RubricsPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/rubrics/import" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><RubricImportPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/rubrics/new" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><RubricBuilder /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/rubrics/:id" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><RubricBuilder /></HomeschoolLayout></ProtectedRoute>} />

          {/* ADMIN */}
          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminUsersPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/classes" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminClassesPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminAnalyticsPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/system" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminSystemPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/privacy" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminPrivacyConfigPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/logs" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminAuditLogPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminSettingsPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/curriculum/import" element={<ProtectedRoute requiredRole="admin"><AdminLayout><CurriculumImportPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/standards" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminStandardsPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/blog" element={<ProtectedRoute requireContentAdmin><AdminLayout><AdminBlogPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/blog/new" element={<ProtectedRoute requireContentAdmin><AdminLayout><AdminBlogEditorPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/blog/:id" element={<ProtectedRoute requireContentAdmin><AdminLayout><AdminBlogEditorPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/pages" element={<ProtectedRoute requireContentAdmin><AdminLayout><AdminPagesPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/pages/new" element={<ProtectedRoute requireContentAdmin><AdminLayout><AdminPageBlockEditorPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/pages/:id" element={<ProtectedRoute requireContentAdmin><AdminLayout><AdminPageBlockEditorPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/ai-config" element={<ProtectedRoute requiredRole="admin"><AdminLayout><OrgAIConfigPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/rubrics" element={<ProtectedRoute requiredRole="admin"><AdminLayout><RubricsPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/rubrics/new" element={<ProtectedRoute requiredRole="admin"><AdminLayout><RubricBuilder /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/rubrics/:id" element={<ProtectedRoute requiredRole="admin"><AdminLayout><RubricBuilder /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/help" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminHelpPage /></AdminLayout></ProtectedRoute>} />

          {/* STUDENT — Journal */}
          <Route path="/student/journal" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentJournalPage /></StudentLayout></ProtectedRoute>} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </div>
    </I18nextProvider>
  )
}

const AppWithRouter: React.FC = () => (
  <Router>
    <App />
  </Router>
)

export default AppWithRouter
