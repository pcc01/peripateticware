import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next';

interface ComingSoonPageProps {
  feature?: string
  returnTo?: string
}

const ComingSoonPage: React.FC<ComingSoonPageProps> = ({
  feature = 'This feature',
  returnTo = '/'
}) => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#faf7f2',
      gap: '1rem'
    }}>
      <div style={{ fontSize: '3rem' }}>🚧</div>
      <h1 style={{ color: '#4a7c59', margin: 0 }}>{feature}</h1>
      <p style={{ color: '#666', margin: 0 }}>{t('comingsoonpage.this_page_is_coming_soon', 'This page is coming soon.')}</p>
      <button
        onClick={() => navigate(returnTo)}
        style={{
          marginTop: '1rem',
          padding: '0.6rem 1.4rem',
          backgroundColor: '#4a7c59',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
      >
        {t('comingsoonpage.go_back', '← Go Back')}
      </button>
    </div>
  )
}

export default ComingSoonPage
