/**
 * Peripateticware App.tsx - COMPLETE INTEGRATION
 */

import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from './config/i18n'
import axios from 'axios'
import { useAuthStore } from './stores/auth'

import './design-system.css'
import { useSkin } from './hooks/useSkin'
import CookieConsentBanner from './components/CookieConsentBanner'
import ParentConsentPage from './pages/ParentConsentPage'
import './styles/globals.css'
import './styles/landing.css'

const DIRECTION_COLORS = {
  'field-guide': { primary: '#4a7c59', secondary: '#8b6f47', background: '#faf7f2', name: 'Field Guide' },
  'terrain':     { primary: '#d4a574', secondary: '#5bc4a0', background: '#f5f0e6', name: 'Terrain' },
  'atmosphere':  { primary: '#a89dd5', secondary: '#4a9ef0', background: '#141c17', name: 'Atmosphere' }
}

import LandingPage from './components/LandingPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import CookiePolicyPage from './pages/CookiePolicyPage'
import LoginScreen from './components/auth/LoginScreen'
import SignUpScreen from './components/auth/SignUpScreen'

import StudentDashboard from './pages/StudentDashboard'
import TeacherDashboard from './pages/TeacherDashboard'
import ParentDashboard from './pages/ParentDashboard'
import AdminDashboard from './pages/AdminDashboard'
import AdminPrivacyConfigPage from './pages/AdminPrivacyConfigPage'
import AdminAuditLogPage from './pages/AdminAuditLogPage'
import AdminAIConfigPage from './pages/admin/AdminAIConfigPage'
import OrgAIConfigPage from './pages/org/admin/OrgAIConfigPage'
import AdminHelpPage from './pages/admin/AdminHelpPage'

import ActivityListPage from './pages/teacher/ActivityListPage'
import SharedLibraryPage from './pages/teacher/SharedLibraryPage'
import TeacherClassroomPage from './pages/teacher/TeacherClassroomPage'
import TeacherClassroomsPage from './pages/teacher/TeacherClassroomsPage'
import TeacherWelcomePage from './pages/teacher/TeacherWelcomePage'
import ProjectsPage from './pages/teacher/ProjectsPage'
import ProjectDetailPage from './pages/teacher/ProjectDetailPage'
import { TeacherTourPage } from './pages/teacher/TeacherTourPage'
import ActivityManager from './components/teacher/ActivityManager'
import { TeacherSettingsPage } from './pages/TeacherSettingsPage'
import { TeacherApprovalDashboard } from './components/teacher/TeacherApprovalDashboard'
import RubricsPage from './pages/teacher/RubricsPage'
import ReflectionEditorPage from './pages/student/ReflectionEditorPage'
import PrivacyEnginePage from './pages/PrivacyEnginePage'
import PrivacyConfirmationPage from './pages/PrivacyConfirmationPage'
import PlatformShell from './layouts/PlatformShell'
import PlatformOverviewPage from './pages/platform/PlatformOverviewPage'
import PlatformOrgsPage from './pages/platform/PlatformOrgsPage'
import PlatformOrgDetailPage from './pages/platform/PlatformOrgDetailPage'
import PlatformUsagePage from './pages/platform/PlatformUsagePage'
import PlatformAuditLogPage from './pages/platform/PlatformAuditLogPage'
import PlatformAISettingsPage from './pages/platform/PlatformAISettingsPage'
import OriginStoryPage from './pages/OriginStoryPage'
import RubricBuilder from './components/teacher/RubricBuilder'
import StudentActivityPreview from './components/teacher/StudentActivityPreview'
import { FieldNoteEditor as _FieldNoteEditor } from './components/student/FieldNoteEditor'
import { SelfProjectView as _SelfProjectView } from './components/student/SelfProjectView'
import { FieldNoteReview as _FieldNoteReview } from './components/teacher/FieldNoteReview'
import TeacherSubmissionsPage from './pages/TeacherSubmissionsPage'

import StudentHowItWorksPage from './pages/student/StudentHowItWorksPage'
import SessionPage from './pages/SessionPage'
import { StudentSettingsPage } from './pages/StudentSettingsPage'
import FieldNotesListPage from './pages/student/FieldNotesListPage'
import SelfProjectsListPage from './pages/student/SelfProjectsListPage'
import PeerProjectsListPage from './pages/student/PeerProjectsListPage'
import PeerProjectDetailPage from './pages/student/PeerProjectDetailPage'
import ProposalsListPage from './pages/student/ProposalsListPage'
import ProposalFormPage from './pages/student/ProposalFormPage'
import StudentActivitiesPage from './pages/student/StudentActivitiesPage'
import TeacherProposalReviewPage from './pages/teacher/TeacherProposalReviewPage'
import StudentActivityDetailPage from './pages/StudentActivityDetailPage'

import ParentFeaturesPage from './pages/parent/ParentFeaturesPage'
import ParentCalendarPage from './pages/ParentCalendarPage'
import ParentNotificationsPage from './pages/ParentNotificationsPage'
import ParentReportsPage from './pages/ParentReportsPage'
import LinkChildPage from './pages/LinkChildPage'
import VerifyEmailPendingPage from './pages/auth/VerifyEmailPendingPage'
import VerifyEmailPage from './pages/auth/VerifyEmailPage'
import TeacherLayout from './layouts/TeacherLayout'
import StudentLayout from './layouts/StudentLayout'
import ParentLayout from './layouts/ParentLayout'
import AdminLayout from './layouts/AdminLayout'
import HomeschoolLayout from './layouts/HomeschoolLayout'
import HomeschoolDashboard from './pages/homeschool/HomeschoolDashboard'
import HomeschoolWelcomePage from './pages/homeschool/HomeschoolWelcomePage'
import HomeschoolChildrenPage from './pages/homeschool/HomeschoolChildrenPage'
import HomeschoolProgressPage from './pages/homeschool/HomeschoolProgressPage'
import HomeschoolRequirementsPage from './pages/homeschool/HomeschoolRequirementsPage'
import HomeschoolCoveragePage from './pages/homeschool/HomeschoolCoveragePage'
import HomeschoolExportPage from './pages/homeschool/HomeschoolExportPage'
import HomeschoolSettingsPage from './pages/homeschool/HomeschoolSettingsPage'

import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import ParentProgressPage from './pages/ParentProgressPage'
import { ParentSettingsPage } from './pages/ParentSettingsPage'

import { AdminSettingsPage } from './pages/AdminSettingsPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminClassesPage from './pages/admin/AdminClassesPage'
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage'
import AdminSystemPage from './pages/admin/AdminSystemPage'
import TeacherStudentsPage from './pages/teacher/TeacherStudentsPage'
import RubricImportPage from './pages/teacher/RubricImportPage'
import StandardsImportPage from './pages/teacher/StandardsImportPage'
import TeacherStandardsPage from './pages/teacher/TeacherStandardsPage'
import TeacherSessionMonitorPage from './pages/teacher/TeacherSessionMonitorPage'
import CurriculumImportPage from './pages/admin/CurriculumImportPage'
import AdminStandardsPage from './pages/admin/AdminStandardsPage'
import ComingSoonPage from './pages/ComingSoonPage'
import ParentMessagesPage from './pages/ParentMessagesPage'
import NotFoundPage from './pages/NotFoundPage'
import StudentJournalPage from './pages/student/StudentJournalPage'

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
}

class AuthService {
  async login(email: string, password: string): Promise<AuthResponse> {
    const endpoints = [`${API_BASE}/auth/login`]
    for (const endpoint of endpoints) {
      try {
        const response = await axios.post(endpoint, { email, password })
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
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const response = await authService.login(email, password)
      const role = (response.role || 'student').toLowerCase()
      navigate(role === 'teacher' ? '/teacher/activities' : role === 'homeschool' ? '/homeschool' : role === 'parent' ? '/parent' : role === 'admin' ? '/admin' : '/student', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Check credentials.')
    } finally { setLoading(false) }
  }

  return <LoginScreen onLogin={handleLogin} error={error} loading={loading} email={email} password={password} onEmailChange={setEmail} onPasswordChange={setPassword} />
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

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRole?: string | string[] }> = ({ children, requiredRole }) => {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />
  if (requiredRole) {
    const user = authService.getUser()
    const userRole = user?.role?.toLowerCase()
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    if (!allowed.includes(userRole ?? '') && userRole !== 'admin') return <Navigate to="/" replace />
  }
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

const App: React.FC = () => {
  const { skin, setSkin } = useSkin()
  // Legacy alias so any remaining DIRECTION_COLORS refs still resolve
  const direction = skin
  const setDirection = setSkin
  const location = useLocation()

  useEffect(() => { useAuthStore.getState().checkAuth() }, [])

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
        <Routes>
          {/* PUBLIC */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/privacy-engine" element={<PrivacyEnginePage />} />
          <Route path="/about/origin" element={<OriginStoryPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiePolicyPage />} />
          <Route path="/parent-consent/:token" element={<ParentConsentPage />} />
          <Route path="/login" element={<LoginScreenWrapper />} />
          <Route path="/signup" element={<SignUpScreenWrapper />} />
          <Route path="/verify-email-pending" element={<VerifyEmailPendingPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/privacy-confirmed" element={<PrivacyConfirmationPage />} />

          {/* Platform super-admin routes — all wrapped in PlatformShell (back + logout header) */}
          <Route element={<PlatformShell />}>
            <Route path="/platform" element={<PlatformOverviewPage />} />
            <Route path="/platform/orgs" element={<PlatformOrgsPage />} />
            <Route path="/platform/orgs/:orgId" element={<PlatformOrgDetailPage />} />
            <Route path="/platform/usage" element={<PlatformUsagePage />} />
            <Route path="/platform/audit-log" element={<PlatformAuditLogPage />} />
            <Route path="/platform/ai-settings" element={<AdminAIConfigPage />} />
          </Route>

          {/* STUDENT */}
          <Route path="/student" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentDashboard /></StudentLayout></ProtectedRoute>} />
          <Route path="/student/how-it-works" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentHowItWorksPage /></StudentLayout></ProtectedRoute>} />
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
          <Route path="/teacher/projects/:id" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ProjectDetailPage /></TeacherLayout></ProtectedRoute>} />
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
          <Route path="/teacher/all-activities" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><ActivityListPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/sessions/:id/monitor" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherSessionMonitorPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/students" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherStudentsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/classrooms" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherClassroomsPage /></TeacherLayout></ProtectedRoute>} />
          <Route path="/teacher/classrooms/:id" element={<ProtectedRoute requiredRole="teacher"><TeacherLayout><TeacherClassroomPage /></TeacherLayout></ProtectedRoute>} />

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
          <Route path="/homeschool/requirements" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolRequirementsPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/coverage" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolCoveragePage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/export" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolExportPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/settings" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><HomeschoolSettingsPage /></HomeschoolLayout></ProtectedRoute>} />
          <Route path="/homeschool/rubrics" element={<ProtectedRoute requiredRole="homeschool"><HomeschoolLayout><RubricsPage /></HomeschoolLayout></ProtectedRoute>} />

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
          <Route path="/admin/ai-config" element={<ProtectedRoute requiredRole="admin"><AdminLayout><OrgAIConfigPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/rubrics" element={<ProtectedRoute requiredRole="admin"><AdminLayout><RubricsPage /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/rubrics/new" element={<ProtectedRoute requiredRole="admin"><AdminLayout><RubricBuilder /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/rubrics/:id" element={<ProtectedRoute requiredRole="admin"><AdminLayout><RubricBuilder /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/help" element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminHelpPage /></AdminLayout></ProtectedRoute>} />

          {/* STUDENT — Journal */}
          <Route path="/student/journal" element={<ProtectedRoute requiredRole="student"><StudentLayout><StudentJournalPage /></StudentLayout></ProtectedRoute>} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
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
