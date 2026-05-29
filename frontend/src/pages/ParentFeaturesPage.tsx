import { useTranslation } from 'react-i18next';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneCarousel, CarouselScreen } from '../components/PhoneCarousel';
import './ParentFeaturesPage.css';

const parentScreens: CarouselScreen[] = [
{
  emoji: '📧',
  title: 'Weekly Digest',
  subtitle: 'What they learned this week',
  backgroundColor: '#eaf2ec',
  prompt: 'What did your child capture?',
  response: '12 photos, 2 videos, 3 new skills earned this week'
},
{
  emoji: '📊',
  title: 'Progress & Badges',
  subtitle: 'Skills and achievements',
  backgroundColor: '#eaf2ec',
  prompt: 'What badges did they earn?',
  response: 'Field Observation Mastery, Critical Thinking, Collaboration'
},
{
  emoji: '💬',
  title: 'Connect with Teacher',
  subtitle: 'Message directly from email',
  backgroundColor: '#eaf2ec',
  prompt: 'How can you support their learning?',
  response: 'Send message, get response, no portal needed'
}];


export function ParentFeaturesPage(): React.ReactNode {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  return (
    <div className="pfp-page">
      {/* NAV */}
      <nav className="pfp-nav">
        <div className="pfp-nav-container">
          <h1 className="pfp-logo">
            <span style={{ marginRight: '8px' }}>📍</span>{t("landing:peripateticware", "Peripateticware")}

          </h1>
          <button onClick={() => navigate('/')} className="pfp-nav-button">{t("landing:parentfeaturespage.back_to_home", "\u2190 Back to Home")}

          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="pfp-hero">
        <div className="pfp-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
          <div className="pfp-hero-content">
            <span className="pfp-tagline">{t("landing:family_portal", "Family Portal")}</span>
            <h1 className="pfp-headline">{t("landing:see_what_your_kid_is_actually_learning", "See what your kid is actually learning")}</h1>
            <p className="pfp-intro">{t("landing:realtime_snapshots_of_field_learning_con", "Real-time snapshots of field learning. Conversation starters at dinner. Proof of growth week to week.")}

            </p>
            <button className="pfp-btn-primary" onClick={() => navigate('/')}>{t("landing:get_started", "Get Started")}

            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PhoneCarousel screens={parentScreens} personaColor="#f0ece3" />
          </div>
        </div>
      </section>

      {/* KEY FEATURES */}
      <section className="pfp-features">
        <div className="pfp-container">
          <h2 className="pfp-section-title">{t("landing:what_you_get", "What You Get")}</h2>

          <div className="pfp-feature-grid">
            <div className="pfp-feature-card">
              <div className="pfp-feature-icon">📧</div>
              <h3>{t("landing:weekly_digest", "Weekly Digest")}</h3>
              <p>{t("landing:every_sunday_a_summary_of_what_your_chil", "Every Sunday: a summary of what your child captured, learned, and achieved during the week. No email overload.")}

              </p>
              <ul className="pfp-feature-list">
                <li>{t("landing:photos_videos_captured", "\u2713 Photos & videos captured")}</li>
                <li>{t("landing:skills_developed", "\u2713 Skills developed")}</li>
                <li>{t("landing:growth_milestones", "\u2713 Growth milestones")}</li>
              </ul>
            </div>

            <div className="pfp-feature-card">
              <div className="pfp-feature-icon">💬</div>
              <h3>{t("landing:frictionless_messaging", "Frictionless Messaging")}</h3>
              <p>{t("landing:message_the_teacher_directly_from_your_e", "Message the teacher directly from your email. No portal login needed. Responses in their inbox too.")}

              </p>
              <ul className="pfp-feature-list">
                <li>{t("landing:emailbased_messaging", "\u2713 Email-based messaging")}</li>
                <li>{t("landing:timebound_conversations", "\u2713 Time-bound conversations")}</li>
                <li>{t("landing:parentfeaturespage.autotranslated", "\u2713 Auto-translated")}</li>
              </ul>
            </div>

            <div className="pfp-feature-card">
              <div className="pfp-feature-icon">📸</div>
              <h3>{t("landing:evidence_gallery", "Evidence Gallery")}</h3>
              <p>{t("landing:every_photo_and_video_your_child_capture", "Every photo and video your child captured in the field. Their permission. Your copy. Yours to keep.")}

              </p>
              <ul className="pfp-feature-list">
                <li>{t("landing:all_evidence_organized", "\u2713 All evidence organized")}</li>
                <li>{t("landing:download_anytime", "\u2713 Download anytime")}</li>
                <li>{t("landing:privacy_protected", "\u2713 Privacy protected")}</li>
              </ul>
            </div>

            <div className="pfp-feature-card">
              <div className="pfp-feature-icon">🔗</div>
              <h3>{t("landing:connect_locally", "Connect Locally")}</h3>
              <p>{t("landing:link_to_your_childs_class_by_code_see_th", "Link to your child's class by code. See their class teacher. Understand the learning context.")}

              </p>
              <ul className="pfp-feature-list">
                <li>{t("landing:classlevel_access", "\u2713 Class-level access")}</li>
                <li>{t("landing:teacher_contact_info", "\u2713 Teacher contact info")}</li>
                <li>{t("landing:activity_schedules", "\u2713 Activity schedules")}</li>
              </ul>
            </div>

            <div className="pfp-feature-card">
              <div className="pfp-feature-icon">🗣️</div>
              <h3>{t("landing:conversation_starters", "Conversation Starters")}</h3>
              <p>{t("landing:not_sure_what_to_ask_at_dinner_we_provid", "Not sure what to ask at dinner? We provide the prompts. \"Tell me about the moment in this photo.\"")}

              </p>
              <ul className="pfp-feature-list">
                <li>{t("landing:guided_reflections", "\u2713 Guided reflections")}</li>
                <li>{t("landing:ageappropriate", "\u2713 Age-appropriate")}</li>
                <li>{t("landing:deepen_connection", "\u2713 Deepen connection")}</li>
              </ul>
            </div>

            <div className="pfp-feature-card">
              <div className="pfp-feature-icon">📊</div>
              <h3>{t("landing:progress_dashboard", "Progress Dashboard")}</h3>
              <p>{t("landing:see_your_childs_growth_across_subjects_a", "See your child's growth across subjects and skills. Badges earned. Streaks built. Real achievement.")}

              </p>
              <ul className="pfp-feature-list">
                <li>{t("landing:skill_tracking", "\u2713 Skill tracking")}</li>
                <li>{t("landing:badge_collection", "\u2713 Badge collection")}</li>
                <li>{t("landing:parentfeaturespage.growth_over_time", "\u2713 Growth over time")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="pfp-how-it-works">
        <div className="pfp-container">
          <h2 className="pfp-section-title">{t("landing:how_it_works", "How It Works")}</h2>

          <div className="pfp-steps">
            <div className="pfp-step">
              <div className="pfp-step-number">1</div>
              <h3>{t("landing:your_child_joins_a_class", "Your child joins a class")}</h3>
              <p>{t("landing:teacher_gives_a_class_code_your_child_en", "Teacher gives a class code. Your child enters it into Peripateticware.")}</p>
            </div>

            <div className="pfp-step">
              <div className="pfp-step-number">2</div>
              <h3>{t("landing:you_get_a_link", "You get a link")}</h3>
              <p>{t("landing:teacher_sends_you_the_family_portal_link", "Teacher sends you the family portal link. You set a password. You're in.")}</p>
            </div>

            <div className="pfp-step">
              <div className="pfp-step-number">3</div>
              <h3>{t("landing:weekly_digest_lands", "Weekly digest lands")}</h3>
              <p>{t("landing:every_sunday_email_with_the_weeks_photos", "Every Sunday, email with the week's photos, skills, and growth.")}</p>
            </div>

            <div className="pfp-step">
              <div className="pfp-step-number">4</div>
              <h3>{t("landing:you_engage", "You engage")}</h3>
              <p>{t("landing:ask_questions_share_the_moments_at_dinne", "Ask questions. Share the moments at dinner. Message the teacher. Support growth.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRIVACY */}
      <section className="pfp-privacy">
        <div className="pfp-container">
          <h2 className="pfp-section-title">{t("landing:built_with_privacy_first", "Built With Privacy First")}</h2>

          <div className="pfp-privacy-grid">
            <div className="pfp-privacy-card">
              <div className="pfp-privacy-icon">🔒</div>
              <h3>{t("landing:your_data_is_yours", "Your data is yours")}</h3>
              <p>{t("landing:download_evidence_anytime_no_lockin_were", "Download evidence anytime. No lock-in. We're never in the middle of your family's data.")}</p>
            </div>

            <div className="pfp-privacy-card">
              <div className="pfp-privacy-icon">👤</div>
              <h3>{t("landing:your_child_controls_access", "Your child controls access")}</h3>
              <p>{t("landing:they_approve_what_parents_see_they_decid", "They approve what parents see. They decide who gets invites. Respect boundaries.")}</p>
            </div>

            <div className="pfp-privacy-card">
              <div className="pfp-privacy-icon">🌍</div>
              <h3>{t("landing:coppa_gdpr_ccpa_compliant", "COPPA, GDPR, CCPA compliant")}</h3>
              <p>{t("landing:works_across_5_continents_we_handle_the_", "Works across 5 continents. We handle the legal complexity. You handle the learning.")}</p>
            </div>

            <div className="pfp-privacy-card">
              <div className="pfp-privacy-icon">🔄</div>
              <h3>{t("landing:5_languages", "5 languages")}</h3>
              <p>{t("landing:interface_and_weekly_digests_translated_", "Interface and weekly digests translated. Auto-translated messaging. No language barriers.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pfp-cta">
        <div className="pfp-container">
          <h2>{t("landing:connect_to_your_childs_class", "Connect to your child's class")}</h2>
          <p>{t("landing:get_the_family_portal_see_their_learning", "Get the family portal. See their learning. Deepen your connection.")}</p>
          <button className="pfp-btn-primary" onClick={() => navigate('/parent/dashboard')}>{t("landing:enter_family_portal", "Enter Family Portal")}

          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="pfp-footer">
        <div className="pfp-container">
          <p>{t('parentfeaturespage.copy_2026_peripateticware_learning_happe', '&copy; 2026 Peripateticware. Learning happens outside.')}</p>
        </div>
      </footer>
    </div>);

}