import { useTranslation } from 'react-i18next';
/**
 * StudentHowItWorksPage.tsx - How the Platform Works
 * With Peripateticware Design System CSS
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

const StudentHowItWorksPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  return (
    <div className="bg sihw-student">
      <div className="container py-5xl">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-5xl)' }}>
          <h1 className="h1 mb-md">{t("landing:how_peripateticware_works", "How Peripateticware Works")}</h1>
          <p className="text-xl text-muted">{t("landing:discover_how_to_participate_in_outdoor_l", "Discover how to participate in outdoor learning activities")}

          </p>
          <button
            className="btn btn-primary mt-2xl"
            onClick={() => navigate('/student')}>{t("landing:studenthowitworkspage.back_to_activities", "Back to Activities")}


          </button>
        </div>

        {/* Three Phases */}
        <div className="grid grid-3 gap-3xl mb-5xl">
          {/* Phase 1 */}
          <div className="card card-accent">
            <h2 className="h2 mb-lg">{t("landing:studenthowitworkspage.phase_1_orient", "\uD83D\uDCDA Phase 1: Orient")}</h2>
            <p className="text-base mb-xl text-muted">{t("landing:learn_about_the_topic_and_what_youll_be_", "Learn about the topic and what you'll be investigating. Ask questions and prepare for your\n              field work.")}


            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className="text-sm py-sm">{t("landing:read_about_the_topic", "\uD83D\uDCD6 Read about the topic")}</li>
              <li className="text-sm py-sm">{t("landing:ask_questions", "\u2753 Ask questions")}</li>
              <li className="text-sm py-sm">{t("landing:set_learning_goals", "\uD83C\uDFAF Set learning goals")}</li>
              <li className="text-sm py-sm">{t("landing:review_safety_guidelines", "\uD83D\uDCCB Review safety guidelines")}</li>
            </ul>
          </div>

          {/* Phase 2 */}
          <div className="card card-accent">
            <h2 className="h2 mb-lg">{t("landing:studenthowitworkspage.phase_2_inquiry", "\uD83D\uDD0D Phase 2: Inquiry")}</h2>
            <p className="text-base mb-xl text-muted">{t("landing:go_out_into_the_field_and_conduct_your_i", "Go out into the field and conduct your investigation. Observe, measure, collect data, and\n              gather evidence.")}


            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className="text-sm py-sm">{t("landing:visit_the_field_site", "\uD83D\uDCCD Visit the field site")}</li>
              <li className="text-sm py-sm">{t("landing:take_measurements", "\uD83D\uDCD0 Take measurements")}</li>
              <li className="text-sm py-sm">{t("landing:capture_photosvideo", "\uD83D\uDCF8 Capture photos/video")}</li>
              <li className="text-sm py-sm">{t("landing:record_observations", "\uD83D\uDCDD Record observations")}</li>
            </ul>
          </div>

          {/* Phase 3 */}
          <div className="card card-accent">
            <h2 className="h2 mb-lg">{t("landing:studenthowitworkspage.phase_3_reflect", "\uD83D\uDCAD Phase 3: Reflect")}</h2>
            <p className="text-base mb-xl text-muted">{t("landing:analyze_your_findings_answer_the_guiding", "Analyze your findings, answer the guiding questions, and share what you learned.")}

            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className="text-sm py-sm">{t("landing:analyze_your_data", "\uD83D\uDCCA Analyze your data")}</li>
              <li className="text-sm py-sm">{t("landing:write_reflections", "\u270D\uFE0F Write reflections")}</li>
              <li className="text-sm py-sm">{t("landing:answer_questions", "\uD83C\uDFAF Answer questions")}</li>
              <li className="text-sm py-sm">{t("landing:share_your_learning", "\uD83D\uDDE3\uFE0F Share your learning")}</li>
            </ul>
          </div>
        </div>

        {/* Features */}
        <div className="mb-5xl">
          <h2 className="h2 mb-3xl">{t("landing:tools_youll_use", "Tools You'll Use")}</h2>
          <div className="grid grid-2 gap-xl">
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:evidence_capture", "\uD83D\uDCF8 Evidence Capture")}</h3>
              <p className="text-muted">{t("landing:take_photos_record_videos_and_capture_au", "Take photos, record videos, and capture audio to document your observations and findings.")}

              </p>
            </div>
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:field_notebook", "\uD83D\uDCDD Field Notebook")}</h3>
              <p className="text-muted">{t("landing:write_notes_sketch_diagrams_and_record_d", "Write notes, sketch diagrams, and record data as you conduct your field investigation.")}

              </p>
            </div>
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:portfolio", "\uD83D\uDCDA Portfolio")}</h3>
              <p className="text-muted">{t("landing:build_a_collection_of_your_work_evidence", "Build a collection of your work, evidence, and reflections as you progress through activities.")}

              </p>
            </div>
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:collaboration", "\uD83D\uDCAC Collaboration")}</h3>
              <p className="text-muted">{t("landing:work_with_teammates_share_observations_a", "Work with teammates, share observations, and learn from each other's discoveries.")}

              </p>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="card bg-primary text-white mb-5xl">
          <h2 className="h2 mb-xl" style={{ color: 'white' }}>{t("landing:tips_for_success", "\uD83D\uDCA1 Tips for Success")}</h2>
          <div className="grid grid-2 gap-2xl">
            <div>
              <h3 className="h5 mb-md" style={{ color: 'white' }}>{t("landing:be_curious", "Be Curious")}</h3>
              <p style={{ opacity: 0.9, color: 'rgba(255,255,255,0.9)' }}>{t("landing:ask_lots_of_questions_and_explore_deeply", "Ask lots of questions and explore deeply. There are no wrong questions!")}</p>
            </div>
            <div>
              <h3 className="h5 mb-md" style={{ color: 'white' }}>{t("landing:take_detailed_notes", "Take Detailed Notes")}</h3>
              <p style={{ opacity: 0.9, color: 'rgba(255,255,255,0.9)' }}>{t("landing:write_down_what_you_observe_even_small_d", "Write down what you observe, even small details that might seem unimportant.")}</p>
            </div>
            <div>
              <h3 className="h5 mb-md" style={{ color: 'white' }}>{t("landing:collaborate", "Collaborate")}</h3>
              <p style={{ opacity: 0.9, color: 'rgba(255,255,255,0.9)' }}>{t("landing:work_with_your_teammates_and_share_your_", "Work with your teammates and share your observations and ideas.")}</p>
            </div>
            <div>
              <h3 className="h5 mb-md" style={{ color: 'white' }}>{t("landing:think_critically", "Think Critically")}</h3>
              <p style={{ opacity: 0.9, color: 'rgba(255,255,255,0.9)' }}>{t("landing:analyze_your_data_and_think_about_what_i", "Analyze your data and think about what it means and why it matters.")}</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/student')}>{t("landing:get_started_with_activities", "Get Started with Activities")}

          </button>
        </div>
      </div>

      <style>{`
        /* Scope explicit, even columns so the cards don't wrap into an
           asymmetric "2 + 1 / 3 + 1" layout inside the narrower dashboard
           content area (the global .grid-* use auto-fit minmax). */
        .sihw-student .grid-3 { grid-template-columns: repeat(3, 1fr); }
        .sihw-student .grid-2 { grid-template-columns: repeat(2, 1fr); }
        @media (max-width: 1000px) {
          .sihw-student .grid-3 { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 768px) {
          .sihw-student .grid-3 { grid-template-columns: 1fr; }
          .sihw-student .grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>);

};

export default StudentHowItWorksPage;