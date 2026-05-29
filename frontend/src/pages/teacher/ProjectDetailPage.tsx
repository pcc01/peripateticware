import { useTranslation } from 'react-i18next';
/**
 * ProjectDetailPage.tsx - Project Details & Management
 * With Peripateticware Design System CSS
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const ProjectDetailPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div className="bg">
      <div className="container py-xl">
        {/* Header */}
        <div className="flex-between mb-3xl">
          <div>
            <button className="btn btn-text" onClick={() => navigate('/teacher/projects')}>{t("landing:back_to_projects", "\u2190 Back to Projects")}

            </button>
            <h1 className="h1 mt-md">{t("landing:spring_ecology_studies", "Spring Ecology Studies")}</h1>
            <p className="text-lg text-muted">{t("landing:comprehensive_ecological_field_studies_f", "Comprehensive ecological field studies for spring semester")}</p>
          </div>
          <button className="btn btn-primary">{t("landing:edit_project", "Edit Project")}</button>
        </div>

        {/* Project Overview */}
        <div className="grid grid-3 gap-lg mb-3xl">
          <div className="card">
            <h3 className="h6 mb-md">{t("landing:students_enrolled", "Students Enrolled")}</h3>
            <p className="h3 m-0">24</p>
          </div>
          <div className="card">
            <h3 className="h6 mb-md">{t("landing:projectdetailpage.activities", "Activities")}</h3>
            <p className="h3 m-0">5</p>
          </div>
          <div className="card">
            <h3 className="h6 mb-md">{t("landing:projectdetailpage.status", "Status")}</h3>
            <p className="m-0">
              <span className="badge badge-success">{t("landing:active", "Active")}</span>
            </p>
          </div>
        </div>

        {/* Project Content */}
        <div className="grid grid-3 gap-lg mb-3xl">
          <div className="card col-span-2">
            <h2 className="h4 mb-lg">{t("landing:project_description", "Project Description")}</h2>
            <p className="text-base mb-md">{t("landing:this_comprehensive_project_guides_studen", "This comprehensive project guides students through a semester-long exploration of local ecosystems.\n              Students will conduct field observations, collect data, and develop an understanding of ecological\n              principles through hands-on experience.")}



            </p>
            <p className="text-base text-muted">{t("landing:duration_3_months_location_multiple_fiel", "Duration: 3 months | Location: Multiple field sites | Grade: 9-12")}

            </p>
          </div>

          <div className="card">
            <h3 className="h5 mb-lg">{t("landing:quick_actions", "Quick Actions")}</h3>
            <div className="flex-col gap-sm">
              <button className="btn btn-secondary btn-block">{t("landing:view_students", "View Students")}</button>
              <button className="btn btn-secondary btn-block">{t("landing:view_activities", "View Activities")}</button>
              <button className="btn btn-secondary btn-block">{t("landing:session_monitor", "Session Monitor")}</button>
            </div>
          </div>
        </div>

        {/* Activities */}
        <div className="card mb-3xl">
          <h2 className="h4 mb-xl">{t("landing:projectdetailpage.project_activities", "Project Activities")}</h2>
          <div className="flex-col gap-md">
            {[1, 2, 3].map((i) =>
            <div key={i} className="border-bottom" style={{ paddingBottom: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                <div className="flex-between mb-md">
                  <h3 className="h5 m-0">{t("landing:projectdetailpage.activity", "Activity")}{i}</h3>
                  <span className="badge badge-success">{t("landing:published", "Published")}</span>
                </div>
                <p className="text-sm text-muted m-0">{t("landing:lorem_ipsum_dolor_sit_amet_consectetur", "Lorem ipsum dolor sit amet consectetur")}</p>
              </div>
            )}
          </div>
          <button className="btn btn-secondary">{t("landing:add_activity", "+ Add Activity")}</button>
        </div>

        {/* Actions */}
        <div className="flex gap-lg" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/teacher/projects')}>{t("landing:projectdetailpage.back", "Back")}

          </button>
          <button className="btn btn-primary">{t("landing:save_changes", "Save Changes")}</button>
        </div>
      </div>

      <style>{`
        .flex-col { display: flex; flex-direction: column; }
        .col-span-2 { grid-column: span 2; }
        .border-bottom { border-bottom: 1px solid var(--border); }
      `}</style>
    </div>);

};

export default ProjectDetailPage;