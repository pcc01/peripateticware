import { useTranslation } from 'react-i18next';
/**
 * NotFoundPage.tsx - 404 Error Page
 * With Peripateticware Design System CSS
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  return (
    <div className="bg">
      <div className="container flex-center" style={{ minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
          {/* 404 Text */}
          <h1 className="h1" style={{ fontSize: 'var(--font-size-4xl)', marginBottom: 'var(--space-lg)' }}>
            404
          </h1>

          {/* Message */}
          <h2 className="h2 mb-lg">{t("landing:page_not_found", "Page Not Found")}</h2>
          <p className="text-lg text-muted mb-3xl">{t("landing:oops_the_page_youre_looking_for_doesnt_e", "Oops! The page you're looking for doesn't exist or has been moved.")}

          </p>

          {/* Actions */}
          <div className="flex gap-lg" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate(-1)}>{t("landing:go_back", "Go Back")}

            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>{t("landing:go_home", "Go Home")}

            </button>
          </div>
        </div>
      </div>
    </div>);

};

export default NotFoundPage;