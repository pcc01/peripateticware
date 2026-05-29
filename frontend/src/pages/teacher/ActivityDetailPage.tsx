import { useTranslation } from 'react-i18next';
/**
 * ActivityDetailPage.tsx - Activity Builder & Editor
 * With Peripateticware Design System CSS
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const ActivityDetailPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { id } = useParams();
  const [activity, setActivity] = useState({
    title: 'Forest Ecosystem Exploration',
    description: 'Students will explore and document a local forest ecosystem',
    location: 'Local Forest Reserve',
    duration: '3 weeks',
    studentCount: 24
  });

  return (
    <div className="bg">
      <div className="container py-xl">
        {/* Header */}
        <div className="flex-between mb-3xl">
          <div>
            <button className="btn btn-text" onClick={() => navigate('/teacher/activities')}>{t("landing:activitydetailpage.back_to_activities", "\u2190 Back to Activities")}

            </button>
            <h1 className="h1 mt-md mb-md">{activity.title}</h1>
            <p className="text-lg text-muted">{t("landing:edit_and_manage_this_activity", "Edit and manage this activity")}</p>
          </div>
          <button className="btn btn-primary">{t("landing:save_changes", "Save Changes")}</button>
        </div>

        {/* Form Sections */}
        <div className="grid grid-3 gap-lg mb-3xl">
          {/* Basic Info */}
          <div className="card col-span-2">
            <h2 className="h4 mb-xl">{t("landing:basic_information", "Basic Information")}</h2>

            <div className="form-group mb-xl">
              <label>{t("landing:activitydetailpage.activity_title", "Activity Title")}</label>
              <input
                type="text"
                className="form-control"
                value={activity.title}
                onChange={(e) => setActivity({ ...activity, title: e.target.value })} />
              
            </div>

            <div className="form-group mb-xl">
              <label>{t("landing:activitydetailpage.description", "Description")}</label>
              <textarea
                className="form-control"
                rows={6}
                value={activity.description}
                onChange={(e) => setActivity({ ...activity, description: e.target.value })} />
              
            </div>

            <div className="grid grid-2 gap-lg">
              <div className="form-group">
                <label>{t("landing:activitydetailpage.location", "Location")}</label>
                <input
                  type="text"
                  className="form-control"
                  value={activity.location}
                  onChange={(e) => setActivity({ ...activity, location: e.target.value })} />
                
              </div>

              <div className="form-group">
                <label>{t("landing:activitydetailpage.duration", "Duration")}</label>
                <input
                  type="text"
                  className="form-control"
                  value={activity.duration}
                  onChange={(e) => setActivity({ ...activity, duration: e.target.value })} />
                
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="card">
            <h3 className="h5 mb-lg">{t("landing:quick_stats", "Quick Stats")}</h3>
            <div className="flex-col gap-md">
              <div>
                <p className="text-sm text-muted m-0">{t("landing:students_enrolled", "Students Enrolled")}</p>
                <p className="h4 m-0">{activity.studentCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted m-0">{t("landing:activitydetailpage.status", "Status")}</p>
                <p className="h5 m-0">
                  <span className="badge badge-success">{t("landing:published", "Published")}</span>
                </p>
              </div>
              <button className="btn btn-secondary btn-block">{t("landing:preview_activity", "Preview Activity")}</button>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="card mb-3xl">
          <h2 className="h4 mb-xl">{t("landing:activity_phases", "Activity Phases")}</h2>
          <div className="grid grid-3 gap-lg">
            <div className="card card-flat">
              <h3 className="h6 mb-md">{t("landing:activitydetailpage.phase_1_orient", "Phase 1: Orient")}</h3>
              <p className="text-sm text-muted">{t("landing:introduction_and_context_setting", "Introduction and context setting")}</p>
              <button className="btn btn-text btn-sm">{t("landing:activitydetailpage.edit", "Edit \u2192")}</button>
            </div>
            <div className="card card-flat">
              <h3 className="h6 mb-md">{t("landing:activitydetailpage.phase_2_inquiry", "Phase 2: Inquiry")}</h3>
              <p className="text-sm text-muted">{t("landing:field_work_and_investigation", "Field work and investigation")}</p>
              <button className="btn btn-text btn-sm">{t("landing:activitydetailpage.edit", "Edit \u2192")}</button>
            </div>
            <div className="card card-flat">
              <h3 className="h6 mb-md">{t("landing:activitydetailpage.phase_3_reflect", "Phase 3: Reflect")}</h3>
              <p className="text-sm text-muted">{t("landing:analysis_and_reflection", "Analysis and reflection")}</p>
              <button className="btn btn-text btn-sm">{t("landing:activitydetailpage.edit", "Edit \u2192")}</button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-lg justify-end">
          <button className="btn btn-secondary" onClick={() => navigate('/teacher/activities')}>{t("landing:cancel", "Cancel")}

          </button>
          <button className="btn btn-primary">{t("landing:save_publish", "Save & Publish")}</button>
        </div>
      </div>

      <style>{`
        .flex-col { display: flex; flex-direction: column; }
        .col-span-2 { grid-column: span 2; }
        .justify-end { justify-content: flex-end; }
      `}</style>
    </div>);

};

export default ActivityDetailPage;