import { useTranslation } from 'react-i18next';
/**
 * ParentFeaturesPage.tsx - Parent Features Overview
 * With Peripateticware Design System CSS
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

const ParentFeaturesPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  return (
    <div className="bg">
      <div className="container py-5xl">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-5xl)' }}>
          <h1 className="h1 mb-md">{t("landing:parent_features", "Parent Features")}</h1>
          <p className="text-xl text-muted">{t("landing:stay_connected_with_your_childs_outdoor_", "Stay connected with your child's outdoor learning journey")}

          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-2 gap-3xl mb-5xl">
          {/* Feature 1 */}
          <div className="card">
            <h3 className="h3 mb-lg">{t("landing:parentfeaturespage.progress_tracking", "\uD83D\uDCCA Progress Tracking")}</h3>
            <p className="text-base text-muted mb-xl">{t("landing:monitor_your_childs_progress_through_act", "Monitor your child's progress through activities, see completed tasks, and celebrate achievements\n              in real-time.")}


            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className="text-sm py-sm">{t("landing:activity_completion_status", "\u2713 Activity completion status")}</li>
              <li className="text-sm py-sm">{t("landing:skill_development_tracking", "\u2713 Skill development tracking")}</li>
              <li className="text-sm py-sm">{t("landing:achievement_badges", "\u2713 Achievement badges")}</li>
              <li className="text-sm py-sm">{t("landing:parentfeaturespage.progress_reports", "\u2713 Progress reports")}</li>
            </ul>
          </div>

          {/* Feature 2 */}
          <div className="card">
            <h3 className="h3 mb-lg">{t("landing:communication", "\uD83D\uDCAC Communication")}</h3>
            <p className="text-base text-muted mb-xl">{t("landing:stay_in_touch_with_your_childs_teachers_", "Stay in touch with your child's teachers to discuss progress, ask questions, and provide feedback.")}

            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className="text-sm py-sm">{t("landing:direct_teacher_messaging", "\u2713 Direct teacher messaging")}</li>
              <li className="text-sm py-sm">{t("landing:progress_discussions", "\u2713 Progress discussions")}</li>
              <li className="text-sm py-sm">{t("landing:event_notifications", "\u2713 Event notifications")}</li>
              <li className="text-sm py-sm">{t("landing:learning_updates", "\u2713 Learning updates")}</li>
            </ul>
          </div>

          {/* Feature 3 */}
          <div className="card">
            <h3 className="h3 mb-lg">{t("landing:learning_insights", "\uD83C\uDF93 Learning Insights")}</h3>
            <p className="text-base text-muted mb-xl">{t("landing:understand_what_your_child_is_learning_t", "Understand what your child is learning, the skills they're developing, and how outdoor learning supports\n              their education.")}


            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className="text-sm py-sm">{t("landing:activity_descriptions", "\u2713 Activity descriptions")}</li>
              <li className="text-sm py-sm">{t("landing:skills_being_developed", "\u2713 Skills being developed")}</li>
              <li className="text-sm py-sm">{t("landing:learning_outcomes", "\u2713 Learning outcomes")}</li>
              <li className="text-sm py-sm">{t("landing:educational_standards", "\u2713 Educational standards")}</li>
            </ul>
          </div>

          {/* Feature 4 */}
          <div className="card">
            <h3 className="h3 mb-lg">{t("landing:parentfeaturespage.evidence_portfolio", "\uD83D\uDCF7 Evidence Portfolio")}</h3>
            <p className="text-base text-muted mb-xl">{t("landing:view_photos_videos_and_notes_from_your_c", "View photos, videos, and notes from your child's outdoor learning activities and field work.")}

            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li className="text-sm py-sm">{t("landing:photo_gallery", "\u2713 Photo gallery")}</li>
              <li className="text-sm py-sm">{t("landing:video_recordings", "\u2713 Video recordings")}</li>
              <li className="text-sm py-sm">{t("landing:parentfeaturespage.field_notes", "\u2713 Field notes")}</li>
              <li className="text-sm py-sm">{t("landing:reflections", "\u2713 Reflections")}</li>
            </ul>
          </div>
        </div>

        {/* How It Works */}
        <div className="card bg-primary text-white mb-5xl">
          <h2 className="h2 mb-xl" style={{ color: 'white' }}>{t("landing:how_outdoor_learning_works", "How Outdoor Learning Works")}</h2>
          <div className="grid grid-3 gap-2xl">
            <div>
              <h3 className="h4 mb-lg" style={{ color: 'white' }}>{t("landing:parentfeaturespage.phase_1_orient", "Phase 1: Orient")}</h3>
              <p style={{ opacity: 0.9 }}>{t("landing:students_learn_about_the_topic_ask_quest", "Students learn about the topic, ask questions, and prepare for field work")}

              </p>
            </div>
            <div>
              <h3 className="h4 mb-lg" style={{ color: 'white' }}>{t("landing:parentfeaturespage.phase_2_inquiry", "Phase 2: Inquiry")}</h3>
              <p style={{ opacity: 0.9 }}>{t("landing:students_conduct_field_observations_coll", "Students conduct field observations, collect data, and gather evidence")}

              </p>
            </div>
            <div>
              <h3 className="h4 mb-lg" style={{ color: 'white' }}>{t("landing:parentfeaturespage.phase_3_reflect", "Phase 3: Reflect")}</h3>
              <p style={{ opacity: 0.9 }}>{t("landing:students_analyze_findings_draw_conclusio", "Students analyze findings, draw conclusions, and share their learning")}

              </p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-5xl">
          <h2 className="h2 mb-3xl">{t("landing:benefits_of_outdoor_learning", "Benefits of Outdoor Learning")}</h2>
          <div className="grid grid-2 gap-xl">
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:cognitive_development", "\uD83E\uDDE0 Cognitive Development")}</h3>
              <p className="text-muted">{t("landing:handson_outdoor_learning_enhances_critic", "Hands-on outdoor learning enhances critical thinking, problem-solving, and scientific reasoning.")}

              </p>
            </div>
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:physical_health", "\uD83C\uDFC3 Physical Health")}</h3>
              <p className="text-muted">{t("landing:outdoor_activities_promote_physical_fitn", "Outdoor activities promote physical fitness, motor skills, and overall wellbeing.")}

              </p>
            </div>
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:social_skills", "\uD83E\uDD1D Social Skills")}</h3>
              <p className="text-muted">{t("landing:collaborative_field_work_develops_teamwo", "Collaborative field work develops teamwork, communication, and interpersonal skills.")}

              </p>
            </div>
            <div className="card">
              <h3 className="h5 mb-lg">{t("landing:environmental_awareness", "\uD83C\uDF0D Environmental Awareness")}</h3>
              <p className="text-muted">{t("landing:direct_experience_with_nature_fosters_en", "Direct experience with nature fosters environmental stewardship and ecological understanding.")}

              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/parent')}>{t("landing:view_your_childs_progress", "View Your Child's Progress")}

          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .grid-3 { grid-template-columns: 1fr; }
          .grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>);

};

export default ParentFeaturesPage;