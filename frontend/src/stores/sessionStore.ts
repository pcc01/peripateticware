// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand'
import { LearningSession, InquiryEntry, EvidenceOfLearning } from '@types/session'
import { SessionStatus } from '@/config/constants'

interface SessionStore {
  // Current session
  currentSession: LearningSession | null
  setCurrentSession: (session: LearningSession | null) => void

  // Session list
  sessions: LearningSession[]
  setSessions: (sessions: LearningSession[]) => void
  addSession: (session: LearningSession) => void
  updateSession: (session: LearningSession) => void

  // Inquiry log for current session
  inquiries: InquiryEntry[]
  addInquiry: (inquiry: InquiryEntry) => void
  updateInquiry: (index: number, inquiry: InquiryEntry) => void
  clearInquiries: () => void

  // Evidence of learning
  evidence: EvidenceOfLearning | null
  setEvidence: (evidence: EvidenceOfLearning | null) => void

  // Loading state
  isLoading: boolean
  setLoading: (isLoading: boolean) => void

  // Error handling
  error: string | null
  setError: (error: string | null) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  // Current session
  currentSession: null,
  setCurrentSession: (session) => set({ currentSession: session }),

  // Session list
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
    })),
  updateSession: (session) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.session_id === session.session_id ? session : s)),
    })),

  // Inquiry log
  inquiries: [],
  addInquiry: (inquiry) =>
    set((state) => ({
      inquiries: [...state.inquiries, inquiry],
    })),
  updateInquiry: (index, inquiry) =>
    set((state) => ({
      inquiries: state.inquiries.map((i, idx) => (idx === index ? inquiry : i)),
    })),
  clearInquiries: () => set({ inquiries: [] }),

  // Evidence
  evidence: null,
  setEvidence: (evidence) => set({ evidence }),

  // Loading
  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),

  // Error
  error: null,
  setError: (error) => set({ error }),
}))

