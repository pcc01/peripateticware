// src/api/passwordReset.ts
// Password-reset request — hits the same public endpoint the web app's
// ForgotPasswordPage / HomeschoolSettingsPage already use
// (backend/routes/reset.py: POST /api/v1/public/password/forgot).
//
// The actual "set a new password" step happens on the web (the reset
// email links to FRONTEND_URL/reset-password?token=..., see
// backend/services/email_service.py's send_password_reset_email) —
// there's no in-app token-entry screen here, this only triggers the
// email. That matches how the web app's own logged-in Settings page
// (HomeschoolSettingsPage) handles it too: request the link, finish on
// the web.
//
// No auth required — usable from the logged-out login screen AND from
// the logged-in Settings screen (which just passes the current user's
// own email).

import { apiFetch } from './client';

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  email: string;
}

export async function requestPasswordReset(email: string): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>('/api/v1/public/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
