import React from 'react'
import { useTranslation } from 'react-i18next'

const LoginPage: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1>{t('auth:login')}</h1>
        <p>{t('common:loading')}</p>
      </div>
    </div>
  )
}

export default LoginPage
