import React from 'react';
import { useTranslation } from 'react-i18next';

export function StorySection() {
  const { t } = useTranslation('landing');
  return (
    <section className="story-section">
      <div className="story-inner">
        <div className="story-container">
          <div className="story-image">
            <img src="/forest-walker.svg" alt={t('components_landing_storysection.alt_a_student_walking_through_the_forest_wit', 'A student walking through the forest with a mobile device')} className="story-forest" />
          </div>

          <div className="story-text">
            <h2 className="h-section">{t('story_title')}</h2>
            <p className="lead">{t('story_text_1')}</p>
            <p className="body">{t('story_text_2')}</p>
          </div>
        </div>

        {/* Field Journal Section */}
        <div className="field-journal-container" id="field-journal">
          <div className="field-journal-image">
            <img src="/images/DigitalJournal.svg" alt={t("landing:digital_journal", "Digital journal")} />
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