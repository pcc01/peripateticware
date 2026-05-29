/**
 * Peripateticware App.tsx - COMPLETE INTEGRATION
 */

import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from './config/i18n'
import axios from 'axios'
import { useAuthStore } from './stores/auth'

import './design-system.css'
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

import ActivityListPage from './pages/teacher/ActivityListPage'
import ProjectsPage from './pages/teacher/ProjectsPage'
import ProjectDetailPage from './pages/teacher/ProjectDetailPage'
import { TeacherTourPage } from './pages/teacher/TeacherTourPage'
import ActivityManager from './components/teacher/ActivityManager'
import { TeacherSettingsPage } from './pages/TeacherSettingsPage'
import TeacherActivityListPage from './pages/teacher/ActivityListPage'
import TeacherSubmissionsPage from './pages/TeacherSubmissionsPage'

import StudentHowItWorksPage from './pages/student/StudentHowItWorksPage'
import SessionPage from './pages/SessionPage'
import { StudentSettingsPage } from './pages/StudentSettingsPage'
import StudentActivityDetailPage from './pages/StudentActivityDetailPage'

import ParentFeaturesPage from './pages/parent/ParentFeaturesPage'
import ParentProgressPage from './pages/ParentProgressPage'
import { ParentSettingsPage } from './pages/ParentSettingsPage'

import { AdminSettingsPage } from './pages/AdminSettingsPage'
import ComingSoonPage from './pages/ComingSoonPage'
import NotFoundPage from './pages/NotFoundPage'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface User {
  id: string
  email: string
  role: 'student' | 'teacher' | 'parent' | 'admin'
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
    const endpoints = [`${API_BASE}/api/v1/auth/login`, `${API_BASE}/api/auth/login`, `${API_BASE}/auth/login`]
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

  async signup(data: { email: string; password: string; password_confirm?: string; first_name?: string; last_name?: string; name?: string; role?: string }): Promise<AuthResponse> {
    const endpoints = [`${API_BASE}/api/v1/auth/signup`, `${API_BASE}/api/auth/signup`, `${API_BASE}/auth/signup`]
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
      navigate(role === 'teacher' ? '/teacher' : role === 'parent' ? '/parent' : role === 'admin' ? '/admin' : '/student', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Check credentials.')
    } finally { setLoading(false) }
  }

  return <LoginScreen onLogin={handleLogin} error={error} loading={loading} email={email} password={password} onEmailChange={setEmail} onPasswordChange={setPassword} />
}

const SignUpScreenWrapper: React.FC = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ email: '', password: '', password_confirm: '', first_name: '', last_name: '', role: 'student' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    if (formData.password !== formData.password_confirm) { setError('Passwords do not match'); setLoading(false); return }
    try {
      const response = await authService.signup(formData)
      const role = (response.role || formData.role).toLowerCase()
      navigate(role === 'teacher' ? '/teacher' : role === 'parent' ? '/parent' : role === 'admin' ? '/admin' : '/student', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Signup failed. Try again.')
    } finally { setLoading(false) }
  }

  return <SignUpScreen onSignup={handleSignup} error={error} loading={loading} formData={formData} onFormChange={(field, value) => setFormData(prev => ({ ...prev, [field]: value }))} />
}

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRole?: string }> = ({ children, requiredRole }) => {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />
  if (requiredRole) {
    const user = authService.getUser()
    const userRole = user?.role?.toLowerCase()
    if (userRole !== requiredRole && userRole !== 'admin') return <Navigate to="/" replace />
  }
  return <>{children}</>
}

const App: React.FC = () => {
  const [direction, setDirection] = useState<'field-guide' | 'terrain' | 'atmosphere'>('field-guide')
  const location = useLocation()

  useEffect(() => {
    const saved = localStorage.getItem('designDirection')
    if (saved) setDirection(saved as any)
  }, [])

  useEffect(() => { useAuthStore.getState().checkAuth() }, [])

  useEffect(() => {
    const colors = DIRECTION_COLORS[direction]
    document.documentElement.style.setProperty('--color-primary', colors.primary)
    document.documentElement.style.setProperty('--color-secondary', colors.secondary)
    document.documentElement.style.setProperty('--color-background', colors.background)
    localStorage.setItem('designDirection', direction)
  }, [direction])

  // RTL support — set dir attribute on <html> whenever language changes
  useEffect(() => {
    const RTL_LANGS = ['ar', 'he', 'fa', 'ur']
    const applyDir = (lng: string) => {
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
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiePolicyPage />} />
          <Route path="/login" element={<LoginScreenWrapper />} />
          <Route path="/signup" element={<SignUpScreenWrapper />} />

          {/* STUDENT */}
          <Route path="/student" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/how-it-works" element={<ProtectedRoute requiredRole="student"><StudentHowItWorksPage /></ProtectedRoute>} />
          <Route path="/student/settings" element={<ProtectedRoute requiredRole="student"><StudentSettingsPage /></ProtectedRoute>} />
          <Route path="/student/activities" element={<ProtectedRoute requiredRole="student"><Navigate to="/student" replace /></ProtectedRoute>} />
          <Route path="/student/activities/:id" element={<ProtectedRoute requiredRole="student"><StudentActivityDetailPage /></ProtectedRoute>} />
          <Route path="/session/:id" element={<ProtectedRoute requiredRole="student"><SessionPage /></ProtectedRoute>} />

          {/* TEACHER */}
          <Route path="/teacher" element={<ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/teacher/projects" element={<ProtectedRoute requiredRole="teacher"><ProjectsPage /></ProtectedRoute>} />
          <Route path="/teacher/projects/:id" element={<ProtectedRoute requiredRole="teacher"><ProjectDetailPage /></ProtectedRoute>} />
          <Route path="/teacher/activities" element={<ProtectedRoute requiredRole="teacher"><ActivityListPage /></ProtectedRoute>} />
          <Route path="/teacher/activities/new" element={<ProtectedRoute requiredRole="teacher"><ActivityManager /></ProtectedRoute>} />
          <Route path="/teacher/activities/:id" element={<ProtectedRoute requiredRole="teacher"><ActivityManager /></ProtectedRoute>} />
          <Route path="/teacher/tour" element={<ProtectedRoute requiredRole="teacher"><TeacherTourPage /></ProtectedRoute>} />
          <Route path="/teacher/settings" element={<ProtectedRoute requiredRole="teacher"><TeacherSettingsPage /></ProtectedRoute>} />
          <Route path="/teacher/submissions" element={<ProtectedRoute requiredRole="teacher"><TeacherSubmissionsPage /></ProtectedRoute>} />
          <Route path="/teacher/all-activities" element={<ProtectedRoute requiredRole="teacher"><TeacherActivityListPage /></ProtectedRoute>} />
          <Route path="/teacher/students" element={<ProtectedRoute requiredRole="teacher"><ComingSoonPage feature="Student Management" returnTo="/teacher" /></ProtectedRoute>} />

          {/* PARENT */}
          <Route path="/parent" element={<ProtectedRoute requiredRole="parent"><ParentDashboard /></ProtectedRoute>} />
          <Route path="/parent/features" element={<ProtectedRoute requiredRole="parent"><ParentFeaturesPage /></ProtectedRoute>} />
          <Route path="/parent/progress" element={<ProtectedRoute requiredRole="parent"><ParentProgressPage /></ProtectedRoute>} />
          <Route path="/parent/settings" element={<ProtectedRoute requiredRole="parent"><ParentSettingsPage /></ProtectedRoute>} />
          <Route path="/parent/messages" element={<ProtectedRoute requiredRole="parent"><ComingSoonPage feature="Messages" returnTo="/parent" /></ProtectedRoute>} />
          <Route path="/parent/calendar" element={<ProtectedRoute requiredRole="parent"><ComingSoonPage feature="Calendar" returnTo="/parent" /></ProtectedRoute>} />
          <Route path="/parent/reports" element={<ProtectedRoute requiredRole="parent"><ComingSoonPage feature="Reports" returnTo="/parent" /></ProtectedRoute>} />
          <Route path="/parent/notifications" element={<ProtectedRoute requiredRole="parent"><ComingSoonPage feature="Notifications" returnTo="/parent" /></ProtectedRoute>} />

          {/* ADMIN */}
          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/privacy" element={<ProtectedRoute requiredRole="admin"><AdminPrivacyConfigPage /></ProtectedRoute>} />
          <Route path="/admin/logs" element={<ProtectedRoute requiredRole="admin"><AdminAuditLogPage /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminSettingsPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><ComingSoonPage feature="User Management" returnTo="/admin" /></ProtectedRoute>} />
          <Route path="/admin/classes" element={<ProtectedRoute requiredRole="admin"><ComingSoonPage feature="Class Management" returnTo="/admin" /></ProtectedRoute>} />
          <Route path="/admin/system" element={<ProtectedRoute requiredRole="admin"><ComingSoonPage feature="System Settings" returnTo="/admin" /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="admin"><ComingSoonPage feature="Analytics" returnTo="/admin" /></ProtectedRoute>} />
          <Route path="/admin/help" element={<ProtectedRoute requiredRole="admin"><ComingSoonPage feature="Help Center" returnTo="/admin" /></ProtectedRoute>} />

          {/* ERRORS */}
          <Route path="/404" element={<NotFoundPage />} />
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
