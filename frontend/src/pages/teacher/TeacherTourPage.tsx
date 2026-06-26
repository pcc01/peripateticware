import { useTranslation } from 'react-i18next';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './TeacherTourPage.css';
import { PRODUCT_NAME } from '../../constants/brand';

export function TeacherTourPage(): React.ReactNode {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  return (
    <div className="ttp-page">
      {/* NAV */}
      <nav className="ttp-nav">
        <div className="ttp-nav-container">
          <h1 className="ttp-logo">
            <span style={{ marginRight: '8px' }}>📍</span>{PRODUCT_NAME}

          </h1>
          <button onClick={() => navigate('/')} className="ttp-nav-button">{t("landing:teachertourpage.back_to_home", "\u2190 Back to Home")}

          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="ttp-hero">
        <div className="ttp-container">
          <div className="ttp-hero-content">
            <span className="ttp-tagline">{t("landing:teacher_tools", "Teacher Tools")}</span>
            <h1 className="ttp-headline">{t("landing:turn_the_world_outside_into_your_lesson_", "Turn the world outside into your lesson plan")}</h1>
            <p className="ttp-intro">{t("landing:create_a_geotagged_activity_in_15_minute", "Create a geo-tagged activity in 15 minutes. Watch your class explore, capture, and reflect\u2014wherever they are.")}

            </p>
            <button className="ttp-btn-primary" onClick={() => navigate('/')}>{t("landing:start_free_for_teachers", "Start Free for Teachers")}

            </button>
          </div>
        </div>
      </section>

      {/* CORE FEATURES */}
      <section className="ttp-features">
        <div className="ttp-container">
          <h2 className="ttp-section-title">{t("landing:build_activities_in_minutes", "Build Activities in Minutes")}</h2>
          <p className="ttp-section-desc">{t("landing:seven_steps_and_youre_done_no_complicate", "Seven steps and you're done. No complicated workflows. No special training needed.")}

          </p>

          <div className="ttp-feature-grid">
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">1</div>
              <h3>{t("landing:name_your_activity", "Name your activity")}</h3>
              <p>{t("landing:observe_the_tree_over_seasons_or_documen", "\"Observe the tree over seasons\" or \"Document watershed health\"")}</p>
            </div>
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">2</div>
              <h3>{t("landing:set_the_location", "Set the location")}</h3>
              <p>{t("landing:tap_the_map_drag_the_pin_or_paste_a_latl", "Tap the map. Drag the pin. Or paste a lat/lng.")}</p>
            </div>
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">3</div>
              <h3>{t("landing:add_your_standards", "Add your standards")}</h3>
              <p>{t("landing:pick_common_core_or_your_framework_aimap", "Pick Common Core or your framework. AI-maps to taxonomy.")}</p>
            </div>
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">4</div>
              <h3>{t("landing:orient_opening_prompt", "Orient: opening prompt")}</h3>
              <p>{t("landing:what_do_you_notice_about_the_ecosystem_h", "\"What do you notice about the ecosystem here?\"")}</p>
            </div>
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">5</div>
              <h3>{t("landing:inquiry_guiding_questions", "Inquiry: guiding questions")}</h3>
              <p>{t("landing:35_openended_prompts_students_reflect_on", "3-5 open-ended prompts students reflect on as they work.")}</p>
            </div>
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">6</div>
              <h3>{t("landing:reflect_portfolio_prompts", "Reflect: portfolio prompts")}</h3>
              <p>{t("landing:what_did_this_moment_teach_you_what_woul", "\"What did this moment teach you?\" \"What would you change?\"")}</p>
            </div>
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">7</div>
              <h3>{t("landing:publish_to_your_class", "Publish to your class")}</h3>
              <p>{t("landing:students_get_it_on_their_phone_they_can_", "Students get it on their phone. They can start immediately.")}</p>
            </div>
            <div className="ttp-feature-card">
              <div className="ttp-feature-number">✓</div>
              <h3>{t("landing:no_student_app_to_download", "No student app to download")}</h3>
              <p>{t("landing:webbased_works_offline_permission_flows_", "Web-based. Works offline. Permission flows built in.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE MONITORING */}
      <section className="ttp-monitoring">
        <div className="ttp-container">
          <h2 className="ttp-section-title">{t("landing:live_map_realtime_teaching", "Live Map. Real-Time Teaching.")}</h2>

          <div className="ttp-monitoring-content">
            <div className="ttp-monitoring-text">
              <p className="ttp-monitoring-intro">{t("landing:see_your_class_in_real_time_where_they_a", "See your class in real time. Where they are. What they've captured. Who's struggling.")}

              </p>

              <div className="ttp-monitoring-list">
                <div className="ttp-monitoring-item">
                  <div className="ttp-monitoring-icon">📍</div>
                  <div>
                    <h4>{t("landing:teachertourpage.live_map", "Live map")}</h4>
                    <p>{t("landing:every_students_location_updated_in_realt", "Every student's location updated in real-time. See who's off-task or stuck.")}</p>
                  </div>
                </div>

                <div className="ttp-monitoring-item">
                  <div className="ttp-monitoring-icon">📸</div>
                  <div>
                    <h4>{t("landing:photo_stream", "Photo stream")}</h4>
                    <p>{t("landing:see_what_theyre_capturing_as_they_captur", "See what they're capturing as they capture it. Quality check on the fly.")}</p>
                  </div>
                </div>

                <div className="ttp-monitoring-item">
                  <div className="ttp-monitoring-icon">🔔</div>
                  <div>
                    <h4>{t("landing:smart_nudges", "Smart nudges")}</h4>
                    <p>{t("landing:get_alerted_if_someones_stuck_suggest_ne", "Get alerted if someone's stuck. Suggest next steps. Keep momentum going.")}</p>
                  </div>
                </div>

                <div className="ttp-monitoring-item">
                  <div className="ttp-monitoring-icon">🎯</div>
                  <div>
                    <h4>{t("landing:teachertourpage.progress_tracking", "Progress tracking")}</h4>
                    <p>{t("landing:see_whos_in_which_phase_how_much_evidenc", "See who's in which phase. How much evidence they've collected. Completion %. Submission ETA.")}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="ttp-monitoring-visual">
              <div className="ttp-map-mockup">
                <div className="ttp-map-header">{t("landing:teachertourpage.live_map", "Live Map")}</div>
                <div className="ttp-map-content">
                  <div className="ttp-map-pin" style={{ top: '25%', left: '30%' }}>📍</div>
                  <div className="ttp-map-pin" style={{ top: '45%', left: '60%' }}>📍</div>
                  <div className="ttp-map-pin" style={{ top: '55%', left: '45%' }}>📍</div>
                  <div className="ttp-map-text">{t("landing:your_class_in_the_field", "Your class in the field")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ASSESSMENT */}
      <section className="ttp-assessment">
        <div className="ttp-container">
          <h2 className="ttp-section-title">{t("landing:standardsaligned_auditready", "Standards-Aligned, Audit-Ready")}</h2>

          <div className="ttp-assessment-grid">
            <div className="ttp-assessment-card">
              <div className="ttp-assessment-icon">✅</div>
              <h3>{t("landing:maps_to_common_core", "Maps to Common Core")}</h3>
              <p>{t("landing:every_activity_automatically_tagged_agai", "Every activity automatically tagged against standards. Your framework or ours.")}</p>
            </div>

            <div className="ttp-assessment-card">
              <div className="ttp-assessment-icon">🔍</div>
              <h3>{t("landing:aigenerated_tags", "AI-Generated Tags")}</h3>
              <p>{t("landing:photos_tagged_by_subject_skill_taxonomy_", "Photos tagged by subject, skill, taxonomy. Search and sort by competency.")}</p>
            </div>

            <div className="ttp-assessment-card">
              <div className="ttp-assessment-icon">📋</div>
              <h3>{t("landing:builtin_rubrics", "Built-In Rubrics")}</h3>
              <p>{t("landing:use_ours_or_build_your_own_grade_by_rubr", "Use ours or build your own. Grade by rubric. Auto-populate reports.")}</p>
            </div>

            <div className="ttp-assessment-card">
              <div className="ttp-assessment-icon">📊</div>
              <h3>{t("landing:reports_ready", "Reports Ready")}</h3>
              <p>{t("landing:evidence_organized_by_standard_growth_ch", "Evidence organized by standard. Growth charts by competency. Share with admin.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* COMMUNICATION */}
      <section className="ttp-communication">
        <div className="ttp-container">
          <h2 className="ttp-section-title">{t("landing:parents_kids_connected", "Parents & Kids Connected")}</h2>
          <p className="ttp-section-desc">{t("landing:weekly_digests_go_to_families_parents_me", "Weekly digests go to families. Parents message you directly. No extra work. It happens automatically.")}

          </p>

          <div className="ttp-comm-features">
            <div className="ttp-comm-card">
              <div className="ttp-comm-icon">📧</div>
              <h3>{t("landing:weekly_digest", "Weekly Digest")}</h3>
              <p>{t("landing:we_send_parents_what_happened_in_your_cl", "We send parents what happened in your class: photos, skills developed, milestones achieved. \n                You don't need to lift a finger.")}


              </p>
            </div>

            <div className="ttp-comm-card">
              <div className="ttp-comm-icon">💬</div>
              <h3>{t("landing:email_messaging", "Email Messaging")}</h3>
              <p>{t("landing:parents_message_you_from_their_email_res", "Parents message you from their email. Responses land in their inbox. No portal login. \n                No app download. Frictionless.")}


              </p>
            </div>

            <div className="ttp-comm-card">
              <div className="ttp-comm-icon">🌍</div>
              <h3>{t("landing:teachertourpage.autotranslated", "Auto-Translated")}</h3>
              <p>{t("landing:digests_and_messages_translated_to_5_lan", "Digests and messages translated to 5 languages automatically. Families stay connected \n                no matter their language.")}


              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="ttp-pricing">
        <div className="ttp-container">
          <h2 className="ttp-section-title">{t("landing:pricing", "Pricing")}</h2>

          <div className="ttp-pricing-cards">
            <div className="ttp-pricing-card">
              <h3>{t("landing:free", "Free")}</h3>
              <p className="ttp-price">$0</p>
              <p className="ttp-price-desc">{t("landing:for_individual_teachers", "For individual teachers")}</p>
              <ul className="ttp-pricing-list">
                <li>{t("landing:up_to_30_students", "\u2713 Up to 30 students")}</li>
                <li>{t("landing:unlimited_activities", "\u2713 Unlimited activities")}</li>
                <li>{t("landing:offline_support", "\u2713 Offline support")}</li>
                <li>{t("landing:realtime_monitoring", "\u2713 Real-time monitoring")}</li>
              </ul>
              <button className="ttp-btn-secondary" onClick={() => navigate('/')}>{t("landing:start_free", "Start Free")}

              </button>
            </div>

            <div className="ttp-pricing-card ttp-pricing-featured">
              <div className="ttp-pricing-badge">{t("landing:most_popular", "Most Popular")}</div>
              <h3>{t("landing:school", "School")}</h3>
              <p className="ttp-price">{t("landing:custom", "Custom")}</p>
              <p className="ttp-price-desc">{t("landing:for_entire_schools", "For entire schools")}</p>
              <ul className="ttp-pricing-list">
                <li>{t("landing:unlimited_teachers", "\u2713 Unlimited teachers")}</li>
                <li>{t("landing:all_students_in_school", "\u2713 All students in school")}</li>
                <li>{t("landing:parent_portal_for_all_families", "\u2713 Parent portal for all families")}</li>
                <li>{t("landing:admin_dashboard_reports", "\u2713 Admin dashboard & reports")}</li>
              </ul>
              <button className="ttp-btn-primary" onClick={() => navigate('/')}>{t("landing:talk_to_sales", "Talk to Sales")}

              </button>
            </div>

            <div className="ttp-pricing-card">
              <h3>{t("landing:district", "District")}</h3>
              <p className="ttp-price">{t("landing:custom", "Custom")}</p>
              <p className="ttp-price-desc">{t("landing:for_districts_regions", "For districts & regions")}</p>
              <ul className="ttp-pricing-list">
                <li>{t("landing:all_schools_in_district", "\u2713 All schools in district")}</li>
                <li>{t("landing:central_admin_oversight", "\u2713 Central admin oversight")}</li>
                <li>{t("landing:professional_development", "\u2713 Professional development")}</li>
                <li>{t("landing:dedicated_support", "\u2713 Dedicated support")}</li>
              </ul>
              <button className="ttp-btn-secondary" onClick={() => navigate('/')}>{t("landing:contact_us", "Contact Us")}

              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="ttp-cta">
        <div className="ttp-container">
          <h2>{t("landing:ready_to_teach_outside", "Ready to teach outside?")}</h2>
          <p>{t("landing:build_your_first_activity_in_15_minutes_", "Build your first activity in 15 minutes. Free. No credit card.")}</p>
          <button className="ttp-btn-primary" onClick={() => navigate('/')}>{t("landing:start_building", "Start Building")}

          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ttp-footer">
        <div className="ttp-container">
          <p>{`© 2026 ${PRODUCT_NAME}. Learning happens outside.`}</p>
        </div>
      </footer>
    </div>);

}