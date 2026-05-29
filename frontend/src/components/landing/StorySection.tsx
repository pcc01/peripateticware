import React from 'react';
import { useTranslation } from 'react-i18next';

export function StorySection() {
  const { t } = useTranslation('landing');
  return (
    <section className="story-section">
      <div className="story-inner">
        <div className="story-container">
          <div className="story-image">
            <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" className="story-forest">
              {/* Forest illustration */}
              {/* Tree 1 - Light */}
              <circle cx="80" cy="180" r="35" fill="#d4a574" />
              <polygon points="80,120 50,180 110,180" fill="#4a7c59" />
              <polygon points="80,140 45,190 115,190" fill="#5a8c69" />
              <polygon points="80,160 40,200 120,200" fill="#2d5037" />

              {/* Tree 2 - Dark (right) */}
              <circle cx="320" cy="170" r="40" fill="#c9956f" />
              <polygon points="320,100 280,170 360,170" fill="#1e4620" />
              <polygon points="320,125 275,185 365,185" fill="#2d5037" />
              <polygon points="320,150 270,200 370,200" fill="#1a3a1f" />

              {/* Tree 3 - Medium (center) */}
              <circle cx="200" cy="185" r="32" fill="#d9a878" />
              <polygon points="200,130 170,185 230,185" fill="#4a7c59" />
              <polygon points="200,150 165,195 235,195" fill="#3d6847" />
              <polygon points="200,170 160,205 240,205" fill="#2d5037" />

              {/* Person figure (small) */}
              <circle cx="200" cy="230" r="6" fill="#4a4a4a" />
              <rect x="196" y="238" width="8" height="15" fill="#4a4a4a" />
              <rect x="186" y="242" width="8" height="10" fill="#4a4a4a" />
              <rect x="206" y="242" width="8" height="10" fill="#4a4a4a" />

              {/* Ground */}
              <rect x="0" y="250" width="400" height="50" fill="#8b9b7a" opacity="0.3" />

              {/* Sky gradient effect */}
              <rect x="0" y="0" width="400" height="100" fill="#c5dace" opacity="0.4" />
            </svg>
          </div>

          <div className="story-text">
            <h2 className="h-section">{t('story_title')}</h2>
            <p className="lead">{t('story_text_1')}</p>
            <p className="body">{t('story_text_2')}</p>
          </div>
        </div>

        {/* Field Journal Section */}
        <div className="field-journal-container">
          <div className="field-journal-image">
            <img src="/images/DigitalJournal.png" alt={t("landing:digital_journal", "Digital journal")} />
          </div>

          <div className="field-journal-text">
            <h3 className="h-card">{t('field_journal_title')}</h3>
            <p className="body">{t('field_journal_desc')}</p>
            <ul className="feature-list">
              <li>{t('field_journal_feature_1')}</li>
              <li>{t('field_journal_feature_2')}</li>
              <li>{t('field_journal_feature_3')}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>);

}

export default StorySection;