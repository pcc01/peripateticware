import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function DoNotSellPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/dsr/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, scope: 'all' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Request failed');
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
        Do Not Sell or Share My Personal Information
      </h1>
      <p style={{ color: '#555', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA),
        California residents have the right to opt out of the sale or sharing of their personal information.
        Peripateticware does not sell personal data, but you may submit this request to formally record
        your preference.
      </p>

      {submitted ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '1.5rem' }}>
          <h2 style={{ color: '#166534', marginBottom: '0.5rem' }}>✓ Preference Recorded</h2>
          <p style={{ color: '#166534' }}>
            Your opt-out preference has been recorded. We will not sell or share your personal information.
          </p>
          <Link to="/" style={{ color: '#166534', fontWeight: 600 }}>← Back to home</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              display: 'block', width: '100%', padding: '0.625rem 0.75rem',
              border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem',
              marginBottom: '1rem', boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#1d4ed8', color: '#fff', border: 'none',
              borderRadius: 6, padding: '0.625rem 1.5rem', fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Submitting…' : 'Submit Opt-Out Request'}
          </button>
          <p style={{ marginTop: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
            Already have an account? <Link to="/login">Log in</Link> for a more complete opt-out.
          </p>
        </form>
      )}

      <hr style={{ margin: '2rem 0', borderColor: '#e5e7eb' }} />
      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
        For questions about this request, contact{' '}
        <a href="mailto:privacy@peripateticware.com" style={{ color: '#1d4ed8' }}>
          privacy@peripateticware.com
        </a>.
        See our <Link to="/privacy" style={{ color: '#1d4ed8' }}>Privacy Policy</Link> for more.
      </p>
    </div>
  );
}
