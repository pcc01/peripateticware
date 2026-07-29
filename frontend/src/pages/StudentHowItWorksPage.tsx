import { useTranslation } from 'react-i18next';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneCarousel, CarouselScreen } from '../components/PhoneCarousel';
import './StudentHowItWorksPage.css';
import { PRODUCT_NAME } from '../constants/brand';

const studentScreens: CarouselScreen[] = [
{
  emoji: '🗺️',
  title: 'Discover Activities',
  subtitle: 'Find outdoor learning near you',
  backgroundColor: '#eaf2ec',
  prompt: 'What activities are available in my area?',
  response: '3 activities within 1 mile: Tree Observation, Water Quality, Urban Ecology'
},
{
  emoji: '📸',
  title: 'Capture Evidence',
  subtitle: 'Photo, sketch, video, or voice notes',
  backgroundColor: '#eaf2ec',
  prompt: 'What details surprised you about this moment?',
  response: 'User takes photo, adds caption, records observation'
},
{
  emoji: '✨',
  title: 'Reflect & Portfolio',
  subtitle: 'Build your learning journal',
  backgroundColor: '#eaf2ec',
  prompt: 'What did you learn from this activity?',
  response: 'User earns badge, updates portfolio with evidence'
}];


export function StudentHowItWorksPage(): React.ReactNode {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  return (
    <div className="sihw-page">
      {/* NAV */}
      <nav className="sihw-nav">
        <div className="sihw-nav-container">
          <h1 className="sihw-logo">
            <span style={{ marginRight: '8px' }}>📍</span>{PRODUCT_NAME}

          </h1>
          <button onClick={() => navigate('/')} className="sihw-nav-button">{t("landing:studenthowitworkspage.back_to_home", "\u2190 Back to Home")}

          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="sihw-hero">
        <div className="sihw-container">
          <div className="sihw-hero-content">
            <span className="sihw-tagline">{t("landing:how_it_works", "How It Works")}</span>
            <h1 className="sihw-headline">{t("landing:capture_learning_reflect_grow", "Capture learning. Reflect. Grow.")}</h1>
            <p className="sihw-intro">{t("landing:peripateticware_turns_outdoor_learning_i", "Peripateticware turns outdoor learning into evidence. Every photo, every sketch, every question becomes part of your learning journey.")}

            </p>
          </div>

          <div className="sihw-hero-visual">
            <PhoneCarousel screens={studentScreens} personaColor="#e8f5e9" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="sihw-features">
        <div className="sihw-container">
          <h2 className="sihw-section-title">{t("landing:the_threephase_flow", "The Three-Phase Flow")}</h2>
          <p className="sihw-section-desc">{t("landing:every_activity_follows_the_same_structur", "Every activity follows the same structure: Orient \u2192 Inquiry \u2192 Reflect. This rhythm becomes invisible, letting you focus on learning.")}

          </p>

          <div className="sihw-feature-grid">
            {/* Phase 1 */}
            <div className="sihw-feature-card">
              <div className="sihw-feature-number">01</div>
              <h3 className="sihw-feature-title">{t("landing:orient", "Orient")}</h3>
              <p className="sihw-feature-desc">{t("landing:read_the_activity_goal_see_where_you_are", "Read the activity goal. See where you are on the map. Get oriented to what you're about to explore.")}

              </p>
              <ul className="sihw-feature-list">
                <li>{t("landing:location_context", "\uD83D\uDCCD Location context")}</li>
                <li>{t("landing:clear_objectives", "\uD83C\uDFAF Clear objectives")}</li>
                <li>{t("landing:time_estimates", "\u23F1\uFE0F Time estimates")}</li>
              </ul>
            </div>

            {/* Phase 2 */}
            <div className="sihw-feature-card">
              <div className="sihw-feature-number">02</div>
              <h3 className="sihw-feature-title">{t("landing:inquiry", "Inquiry")}</h3>
              <p className="sihw-feature-desc">{t("landing:capture_evidence_take_photos_record_vide", "Capture evidence. Take photos. Record video. Draw what you see. Answer prompts. Ask Peri when you're stuck.")}

              </p>
              <ul className="sihw-feature-list">
                <li>{t("landing:studenthowitworkspage.capture_tools", "\uD83D\uDCF8 Capture tools")}</li>
                <li>{t("landing:aristotelian_prompts", "\uD83D\uDCAC Aristotelian prompts")}</li>
                <li>{t("landing:ai_thinking_partner", "\uD83E\uDD16 AI thinking partner")}</li>
              </ul>
            </div>

            {/* Phase 3 */}
            <div className="sihw-feature-card">
              <div className="sihw-feature-number">03</div>
              <h3 className="sihw-feature-title">{t("landing:reflect", "Reflect")}</h3>
              <p className="sihw-feature-desc">{t("landing:review_what_you_captured_answer_reflecti", "Review what you captured. Answer reflection questions. Build your portfolio. Earn badges.")}

              </p>
              <ul className="sihw-feature-list">
                <li>{t("landing:build_your_portfolio", "\u2728 Build your portfolio")}</li>
                <li>{t("landing:earn_badges", "\uD83C\uDFC6 Earn badges")}</li>
                <li>{t("landing:track_growth", "\uD83D\uDCCA Track growth")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* TOOLS */}
      <section className="sihw-tools">
        <div className="sihw-container">
          <h2 className="sihw-section-title">{t("landing:studenthowitworkspage.capture_tools", "Capture Tools")}</h2>
          <p className="sihw-section-desc">{t("landing:capture_evidence_the_way_that_makes_sens", "Capture evidence the way that makes sense. Photos, sketches, voice notes, video\u2014whatever tells the story.")}

          </p>

          <div className="sihw-tools-grid">
            <div className="sihw-tool-card">
              <div className="sihw-tool-icon">📸</div>
              <h3>{t("landing:photo", "Photo")}</h3>
              <p>{t("landing:geotagged_and_timestamped_add_captions_a", "Geo-tagged and timestamped. Add captions. Annotate.")}</p>
            </div>
            <div className="sihw-tool-card">
              <div className="sihw-tool-icon">🎥</div>
              <h3>{t("landing:video", "Video")}</h3>
              <p>{t("landing:record_up_to_60_seconds_add_context_work", "Record up to 60 seconds. Add context. Works offline.")}</p>
            </div>
            <div className="sihw-tool-card">
              <div className="sihw-tool-icon">✏️</div>
              <h3>{t("landing:drawing", "Drawing")}</h3>
              <p>{t("landing:sketch_directly_inapp_handwriting_captur", "Sketch directly in-app. Handwriting captured too.")}</p>
            </div>
            <div className="sihw-tool-card">
              <div className="sihw-tool-icon">🎤</div>
              <h3>{t("landing:audio", "Audio")}</h3>
              <p>{t("landing:voice_notes_and_explanations_autotranscr", "Voice notes and explanations. Auto-transcribed.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* AI COACH */}
      <section className="sihw-ai-coach">
        <div className="sihw-container">
          <h2 className="sihw-section-title">{t("landing:meet_peri.badge", "Meet Peri")}</h2>
          <p className="sihw-section-desc">{t("landing:your_ai_thinking_partner_when_youre_stuc", "Your AI thinking partner. When you're stuck, ask Peri. She'll never give you the answer\u2014just ask the next question.")}

          </p>

          <div className="sihw-ai-showcase">
            <div className="sihw-ai-bubble">
              <div className="sihw-ai-example">
                <div className="sihw-chat-msg user">{t("landing:what_does_photosynthesis_do", "What does photosynthesis do?")}</div>
                <div className="sihw-chat-msg ai">{t("landing:i_see_youre_thinking_about_how_plants_ma", "I see you're thinking about how plants make food. What do you think happens to the sunlight they capture?")}</div>
              </div>
            </div>

            <div className="sihw-ai-benefits">
              <h3>{t("landing:aristotelian_learning", "Aristotelian Learning")}</h3>
              <ul>
                <li>{t("landing:questions_not_answers", "\u2713 Questions, not answers")}</li>
                <li>{t("landing:your_reasoning_your_pace", "\u2713 Your reasoning, your pace")}</li>
                <li>{t("landing:available_247", "\u2713 Available 24/7")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PORTFOLIO */}
      <section className="sihw-portfolio">
        <div className="sihw-container">
          <h2 className="sihw-section-title">{t("landing:your_learning_portfolio", "Your Learning Portfolio")}</h2>
          <p className="sihw-section-desc">{t("landing:every_activity_every_capture_every_refle", "Every activity, every capture, every reflection builds your portfolio. See your growth over time.")}

          </p>

          <div className="sihw-portfolio-features">
            <div className="sihw-portfolio-item">
              <div className="sihw-portfolio-icon">📚</div>
              <h3>{t("landing:journal", "Journal")}</h3>
              <p>{t("landing:all_your_evidence_in_one_place_chronolog", "All your evidence in one place. Chronological or by activity.")}</p>
            </div>
            <div className="sihw-portfolio-item">
              <div className="sihw-portfolio-icon">🏆</div>
              <h3>{t("landing:badges", "Badges")}</h3>
              <p>{t("landing:earn_competency_badges_build_streaks_cel", "Earn competency badges. Build streaks. Celebrate progress.")}</p>
            </div>
            <div className="sihw-portfolio-item">
              <div className="sihw-portfolio-icon">📊</div>
              <h3>{t("landing:studenthowitworkspage.progress", "Progress")}</h3>
              <p>{t("landing:track_your_growth_across_skills_see_what", "Track your growth across skills. See what you've mastered.")}</p>
            </div>
            <div className="sihw-portfolio-item">
              <div className="sihw-portfolio-icon">🔗</div>
              <h3>{t("landing:shareable", "Shareable")}</h3>
              <p>{t("landing:share_your_portfolio_with_teachers_paren", "Share your portfolio with teachers, parents, schools.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="sihw-cta">
        <div className="sihw-container">
          <h2>{t("landing:ready_to_start_learning_outside", "Ready to start learning outside?")}</h2>
          <p>{t("landing:get_started_today_free_for_students", "Get started today. Free for students.")}</p>
          <button className="sihw-btn-primary" onClick={() => navigate('/')}>{t("landing:open_the_app", "Open the App")}

          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="sihw-footer">
        <div className="sihw-container">
          <p>{`© 2026 ${PRODUCT_NAME}. Learning happens outside.`}</p>
        </div>
      </footer>
    </div>);

}