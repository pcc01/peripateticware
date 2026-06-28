import { useTranslation } from 'react-i18next';
/**
 * Peripateticware — Role Dashboards
 * Customized dashboard experiences for Student, Teacher, Parent, Admin
 */

import React, { useState } from 'react';
import type { Tokens } from '../design/tokens';
import { PRODUCT_NAME } from '../constants/brand';
import {
  Button,
  Card,
  StatTile,
  Avatar,
  ProgressBar,
  Badge,
  SidebarLayout,
  SidebarItem,
  Topbar,
  MainContent,
  Grid } from
'../components';

// ─────────────────────────────────────────────────────────────────
// STUDENT DASHBOARD
// ─────────────────────────────────────────────────────────────────

export const StudentDashboard: React.FC<{d: Tokens;}> = ({ d }) => {
  const { t } = useTranslation('landing');
  const [activeTab, setActiveTab] = useState('dashboard');

  const sidebarItems = [
  { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
  { id: 'activities', label: '🌿 Activities', icon: '🌿' },
  { id: 'progress', label: '📈 Progress', icon: '📈' },
  { id: 'reflections', label: '💭 Reflections', icon: '💭' },
  { id: 'evidence', label: '📸 Evidence', icon: '📸' }];


  return (
    <SidebarLayout
      d={d}
      brand={
      <>
          <div
          style={{
            width: 40,
            height: 40,
            borderRadius: d.radius,
            background: d.accent,
            color: d.accentText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold'
          }}>
          
            🌿
          </div>
          <div>
            <div style={{ fontWeight: 700, color: d.text, fontSize: d.textSm }}>{PRODUCT_NAME}

          </div>
            <div style={{ fontSize: d.textXs, color: d.textMuted }}>{t("landing:index.student", "Student")}</div>
          </div>
        </>
      }
      nav={
      <div>
          {sidebarItems.map((item) =>
        <SidebarItem
          key={item.id}
          d={d}
          label={item.label}
          active={activeTab === item.id}
          onClick={() => setActiveTab(item.id)} />

        )}
        </div>
      }
      footer={
      <Avatar d={d} initials="ER" size="md" />
      }>
      
      <Topbar
        d={d}
        title={
        activeTab === 'dashboard' ?
        'Today\'s Learning' :
        activeTab === 'activities' ?
        'My Activities' :
        activeTab === 'progress' ?
        'My Progress' :
        activeTab === 'reflections' ?
        'My Reflections' :
        'Evidence'
        }
        subtitle="Emma Reyes · Grade 7" />
      
      <MainContent d={d}>
        {activeTab === 'dashboard' &&
        <div>
            <Grid d={d} cols={3} gap={d.space6}>
              <StatTile d={d} label="Hours Active" value="4.2" sub="This week" trend="up" />
              <StatTile d={d} label="Competencies Advancing" value="5" sub="Of 12 tracked" />
              <StatTile d={d} label="Reflections Complete" value="8/10" sub="This week" />
            </Grid>

            <Card
            d={d}
            style={{
              marginTop: d.space6,
              background: d.accentLight,
              border: `1px solid ${d.accent}`
            }}>
            
              <h3
              style={{
                fontFamily: d.fontHead,
                fontSize: d.textLg,
                fontWeight: 700,
                color: d.accent,
                marginBottom: d.space3
              }}>{t("landing:todays_focus", "\uD83C\uDFAF Today's Focus")}


            </h3>
              <p style={{ fontSize: d.textMd, color: d.text, marginBottom: d.space4 }}>{t("landing:observing_native_plants_in_field_session", "Observing native plants in field session at Riverside State Park")}

            </p>
              <ProgressBar d={d} value={65} label="Session progress" />
              <div
              style={{
                display: 'flex',
                gap: d.space3,
                marginTop: d.space4
              }}>
              
                <Button d={d} variant="primary" size="sm">{t("landing:resume_activity", "Resume Activity")}

              </Button>
                <Button d={d} variant="secondary" size="sm">{t("landing:view_details", "View Details")}

              </Button>
              </div>
            </Card>

            <Card
            d={d}
            style={{
              marginTop: d.space6
            }}>
            
              <h3
              style={{
                fontFamily: d.fontHead,
                fontSize: d.textLg,
                fontWeight: 700,
                color: d.text,
                marginBottom: d.space4
              }}>{t("landing:recent_feedback", "\uD83D\uDCDA Recent Feedback")}


            </h3>
              <div
              style={{
                background: d.surfaceAlt,
                padding: d.space4,
                borderRadius: d.radius,
                borderLeft: `4px solid ${d.success}`
              }}>
              
                <p style={{ color: d.text, fontSize: d.textMd, margin: 0 }}>{t("landing:great_observation_notes_today_your_detai", "\\\"Great observation notes today! Your detail about leaf morphology shows real\n                  botanical thinking.\\\" \u2014 Ms. Santos")}


              </p>
              </div>
            </Card>
          </div>
        }

        {activeTab === 'activities' &&
        <Grid d={d} cols={2}>
            {[1, 2, 3, 4].map((n) =>
          <Card
            key={n}
            d={d}
            style={{
              cursor: 'pointer',
              transition: `all ${d.durFast}`
            }}>
            
                <div style={{ fontWeight: 700, color: d.text, marginBottom: d.space2 }}>{t("landing:index.activity", "Activity #")}
              {n}
                </div>
                <p style={{ color: d.textMuted, fontSize: d.textSm, margin: 0 }}>{t("landing:field_observation_task", "Field observation task")}

            </p>
              </Card>
          )}
          </Grid>
        }

        {activeTab === 'progress' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space6
            }}>{t("landing:competency_progress", "Competency Progress")}


          </h3>
            {[
          'Scientific Observation',
          'Critical Thinking',
          'Communication',
          'Collaboration'].
          map((comp, i) =>
          <div key={i} style={{ marginBottom: d.space6 }}>
                <ProgressBar d={d} value={60 + i * 10} label={comp} />
              </div>
          )}
          </Card>
        }

        {activeTab === 'reflections' &&
        <div>
            <p style={{ color: d.textMuted, marginBottom: d.space6 }}>{t("landing:no_reflections_yet_this_week", "No reflections yet this week.")}

          </p>
          </div>
        }

        {activeTab === 'evidence' &&
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: d.space4 }}>
            {[1, 2, 3, 4, 5, 6].map((n) =>
          <div
            key={n}
            style={{
              aspectRatio: '1',
              background: d.surfaceAlt,
              borderRadius: d.radius,
              border: `1px solid ${d.border}`
            }} />

          )}
          </div>
        }
      </MainContent>
    </SidebarLayout>);

};

// ─────────────────────────────────────────────────────────────────
// TEACHER DASHBOARD
// ─────────────────────────────────────────────────────────────────

export const TeacherDashboard: React.FC<{d: Tokens;}> = ({ d }) => {
  const { t } = useTranslation('landing');
  const [activeTab, setActiveTab] = useState('dashboard');

  const sidebarItems = [
  { id: 'dashboard', label: '🧭 Dashboard', icon: '🧭' },
  { id: 'sessions', label: '📍 Sessions', icon: '📍' },
  { id: 'review', label: '✅ Review Queue', icon: '✅' },
  { id: 'students', label: '👥 Students', icon: '👥' },
  { id: 'activities', label: '🎨 Activities', icon: '🎨' }];


  return (
    <SidebarLayout
      d={d}
      brand={
      <>
          <div
          style={{
            width: 40,
            height: 40,
            borderRadius: d.radius,
            background: d.accent,
            color: d.accentText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold'
          }}>
          
            🧭
          </div>
          <div>
            <div style={{ fontWeight: 700, color: d.text, fontSize: d.textSm }}>{PRODUCT_NAME}

          </div>
            <div style={{ fontSize: d.textXs, color: d.textMuted }}>{t("landing:index.teacher", "Teacher")}</div>
          </div>
        </>
      }
      nav={
      <div>
          {sidebarItems.map((item) =>
        <SidebarItem
          key={item.id}
          d={d}
          label={item.label}
          active={activeTab === item.id}
          onClick={() => setActiveTab(item.id)} />

        )}
        </div>
      }
      footer={
      <Avatar d={d} initials="MS" size="md" />
      }>
      
      <Topbar
        d={d}
        title={
        activeTab === 'dashboard' ?
        'Class Overview' :
        activeTab === 'sessions' ?
        'Field Sessions' :
        activeTab === 'review' ?
        'Review Queue' :
        activeTab === 'students' ?
        'Students' :
        'Activity Library'
        }
        subtitle="Ms. Santos · Period 3 Biology" />
      
      <MainContent d={d}>
        {activeTab === 'dashboard' &&
        <div>
            <Grid d={d} cols={4} gap={d.space6}>
              <StatTile d={d} label="Class Size" value="28" />
              <StatTile d={d} label="Pending Review" value="12" trend="up" />
              <StatTile d={d} label="Active Session" value="1" />
              <StatTile d={d} label="This Week Avg." value="4.3h" />
            </Grid>

            <Card
            d={d}
            style={{
              marginTop: d.space6,
              background: d.accentLight,
              border: `1px solid ${d.accent}`
            }}>
            
              <h3
              style={{
                fontFamily: d.fontHead,
                fontSize: d.textLg,
                fontWeight: 700,
                color: d.accent,
                marginBottom: d.space4
              }}>{t("landing:live_session_field_observation", "\uD83D\uDD34 Live Session: Field Observation")}


            </h3>
              <p style={{ fontSize: d.textMd, color: d.text, marginBottom: d.space4 }}>{t("landing:riverside_state_park_24_students_present", "Riverside State Park \xB7 24 students present \xB7 45 min elapsed")}

            </p>
              <div style={{ display: 'flex', gap: d.space3 }}>
                <Button d={d} variant="primary" size="sm">{t("landing:monitor_live", "Monitor Live")}

              </Button>
                <Button d={d} variant="secondary" size="sm">{t("landing:broadcast_message", "Broadcast Message")}

              </Button>
              </div>
            </Card>

            <Card d={d} style={{ marginTop: d.space6 }}>
              <h3
              style={{
                fontFamily: d.fontHead,
                fontSize: d.textLg,
                fontWeight: 700,
                color: d.text,
                marginBottom: d.space4
              }}>{t("landing:recent_submissions_12", "\uD83D\uDCCB Recent Submissions (12)")}


            </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: d.space3 }}>
                {[1, 2, 3].map((n) =>
              <div
                key={n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: d.space3,
                  background: d.surfaceAlt,
                  borderRadius: d.radius
                }}>
                
                    <div style={{ display: 'flex', alignItems: 'center', gap: d.space3 }}>
                      <Avatar d={d} initials={`S${n}`} size="sm" />
                      <div>
                        <div style={{ fontWeight: 600, color: d.text }}>{t("landing:index.student", "Student")}{n}</div>
                        <div style={{ fontSize: d.textXs, color: d.textMuted }}>{t("landing:5_min_ago", "5 min ago")}

                    </div>
                      </div>
                    </div>
                    <Badge d={d} variant="warn">{t("landing:needs_review", "Needs Review")}

                </Badge>
                  </div>
              )}
              </div>
            </Card>
          </div>
        }

        {activeTab === 'sessions' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:index.upcoming_sessions", "Upcoming Sessions")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:no_sessions_scheduled", "No sessions scheduled.")}</p>
          </Card>
        }

        {activeTab === 'review' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:queue", "Queue")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:12_submissions_awaiting_review", "12 submissions awaiting review.")}</p>
          </Card>
        }

        {activeTab === 'students' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:student_list", "Student List")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:28_students_in_this_class", "28 students in this class.")}</p>
          </Card>
        }

        {activeTab === 'activities' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:activity_library", "Activity Library")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:create_edit_and_assign_activities", "Create, edit, and assign activities.")}</p>
          </Card>
        }
      </MainContent>
    </SidebarLayout>);

};

// ─────────────────────────────────────────────────────────────────
// PARENT DASHBOARD
// ─────────────────────────────────────────────────────────────────

export const ParentDashboard: React.FC<{d: Tokens;}> = ({ d }) => {
  const { t } = useTranslation('landing');
  const [activeTab, setActiveTab] = useState('dashboard');

  const sidebarItems = [
  { id: 'dashboard', label: '🪶 Home', icon: '🪶' },
  { id: 'child', label: '👧 Child\'s Work', icon: '👧' },
  { id: 'messages', label: '💬 Messages', icon: '💬' },
  { id: 'progress', label: '📊 Progress', icon: '📊' },
  { id: 'settings', label: '⚙️ Settings', icon: '⚙️' }];


  return (
    <SidebarLayout
      d={d}
      brand={
      <>
          <div
          style={{
            width: 40,
            height: 40,
            borderRadius: d.radius,
            background: d.accent,
            color: d.accentText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold'
          }}>
          
            🪶
          </div>
          <div>
            <div style={{ fontWeight: 700, color: d.text, fontSize: d.textSm }}>{PRODUCT_NAME}

          </div>
            <div style={{ fontSize: d.textXs, color: d.textMuted }}>{t("landing:index.parent", "Parent")}</div>
          </div>
        </>
      }
      nav={
      <div>
          {sidebarItems.map((item) =>
        <SidebarItem
          key={item.id}
          d={d}
          label={item.label}
          active={activeTab === item.id}
          onClick={() => setActiveTab(item.id)} />

        )}
        </div>
      }
      footer={
      <Avatar d={d} initials="SR" size="md" />
      }>
      
      <Topbar
        d={d}
        title={
        activeTab === 'dashboard' ?
        'Welcome Back' :
        activeTab === 'child' ?
        'Emma\'s Work' :
        activeTab === 'messages' ?
        'Teachers' :
        activeTab === 'progress' ?
        'Progress Report' :
        'Settings'
        }
        subtitle="Sarah Reyes · Parent of Emma" />
      
      <MainContent d={d}>
        {activeTab === 'dashboard' &&
        <div>
            <Card
            d={d}
            style={{
              background: d.accentLight,
              border: `1px solid ${d.accent}`,
              marginBottom: d.space6
            }}>
            
              <h3
              style={{
                fontFamily: d.fontHead,
                fontSize: d.text2xl,
                fontWeight: 700,
                color: d.accent,
                margin: 0
              }}>{t("landing:emma_is_excelling", "\uD83C\uDF89 Emma is excelling!")}


            </h3>
              <p
              style={{
                color: d.text,
                fontSize: d.textMd,
                marginTop: d.space3,
                marginBottom: 0
              }}>{t("landing:she_advanced_in_3_competencies_this_week", "She advanced in 3 competencies this week.")}


            </p>
            </Card>

            <Grid d={d} cols={2} gap={d.space6}>
              <Card d={d}>
                <div style={{ fontWeight: 700, color: d.text, marginBottom: d.space4 }}>{t("landing:latest_evidence", "\uD83D\uDCF8 Latest Evidence")}

              </div>
                <div
                style={{
                  aspectRatio: '3/2',
                  background: d.surfaceAlt,
                  borderRadius: d.radius,
                  marginBottom: d.space4
                }} />
              
                <p style={{ fontSize: d.textSm, color: d.textMuted, margin: 0 }}>{t("landing:field_observation_riverside_park", "Field observation \xB7 Riverside Park")}

              </p>
              </Card>

              <Card d={d}>
                <div style={{ fontWeight: 700, color: d.text, marginBottom: d.space4 }}>{t("landing:latest_reflection", "\uD83D\uDCAD Latest Reflection")}

              </div>
                <p style={{ fontSize: d.textMd, color: d.text, marginBottom: d.space3 }}>{t("landing:i_noticed_how_different_plants_adapt_to_", "\"I noticed how different plants adapt to shade...\"")}

              </p>
                <div style={{ display: 'flex', gap: d.space2 }}>
                  <Badge d={d} variant="success">{t("landing:well_articulated", "Well Articulated")}

                </Badge>
                </div>
              </Card>
            </Grid>

            <Card d={d} style={{ marginTop: d.space6 }}>
              <h3
              style={{
                fontFamily: d.fontHead,
                fontSize: d.textLg,
                fontWeight: 700,
                color: d.text,
                marginBottom: d.space4
              }}>{t("landing:talk_tonight_prompts", "\uD83D\uDCAC Talk Tonight Prompts")}


            </h3>
              <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: d.space3
              }}>
              
                {[
              'What surprised you about shade plants?',
              'How did you feel when you found the first specimen?',
              'What would you do differently next time?'].
              map((prompt, i) =>
              <li
                key={i}
                style={{
                  padding: d.space3,
                  background: d.surfaceAlt,
                  borderRadius: d.radius,
                  color: d.text
                }}>
                
                    {prompt}
                  </li>
              )}
              </ul>
            </Card>
          </div>
        }

        {activeTab === 'child' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:emmas_recent_work", "Emma's Recent Work")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:view_evidence_and_reflections_here", "View evidence and reflections here.")}</p>
          </Card>
        }

        {activeTab === 'messages' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:messages_with_teachers", "Messages with Teachers")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:no_messages_yet", "No messages yet.")}</p>
          </Card>
        }

        {activeTab === 'progress' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space6
            }}>{t("landing:index.growth_over_time", "Growth Over Time")}


          </h3>
            {['Scientific Thinking', 'Communication', 'Collaboration'].map((comp, i) =>
          <div key={i} style={{ marginBottom: d.space6 }}>
                <ProgressBar d={d} value={50 + i * 15} label={comp} />
              </div>
          )}
          </Card>
        }

        {activeTab === 'settings' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:account_settings", "Account Settings")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:manage_your_preferences_here", "Manage your preferences here.")}</p>
          </Card>
        }
      </MainContent>
    </SidebarLayout>);

};

// ─────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────

export const AdminDashboard: React.FC<{d: Tokens;}> = ({ d }) => {
  const { t } = useTranslation('landing');
  const [activeTab, setActiveTab] = useState('dashboard');

  const sidebarItems = [
  { id: 'dashboard', label: '⌂ Overview', icon: '⌂' },
  { id: 'users', label: '👥 Users', icon: '👥' },
  { id: 'schools', label: '🏫 Schools', icon: '🏫' },
  { id: 'content', label: '📚 Content', icon: '📚' },
  { id: 'analytics', label: '📊 Analytics', icon: '📊' }];


  return (
    <SidebarLayout
      d={d}
      brand={
      <>
          <div
          style={{
            width: 40,
            height: 40,
            borderRadius: d.radius,
            background: d.accent,
            color: d.accentText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold'
          }}>
          
            ⌂
          </div>
          <div>
            <div style={{ fontWeight: 700, color: d.text, fontSize: d.textSm }}>{PRODUCT_NAME}

          </div>
            <div style={{ fontSize: d.textXs, color: d.textMuted }}>{t("landing:admin", "Admin")}</div>
          </div>
        </>
      }
      nav={
      <div>
          {sidebarItems.map((item) =>
        <SidebarItem
          key={item.id}
          d={d}
          label={item.label}
          active={activeTab === item.id}
          onClick={() => setActiveTab(item.id)} />

        )}
        </div>
      }
      footer={
      <Avatar d={d} initials="IT" size="md" />
      }>
      
      <Topbar
        d={d}
        title={
        activeTab === 'dashboard' ?
        'System Overview' :
        activeTab === 'users' ?
        'User Management' :
        activeTab === 'schools' ?
        'Schools & Districts' :
        activeTab === 'content' ?
        'Content Management' :
        'Analytics'
        }
        subtitle="IT Admin · Riverside Unified" />
      
      <MainContent d={d}>
        {activeTab === 'dashboard' &&
        <div>
            <Grid d={d} cols={4} gap={d.space6}>
              <StatTile d={d} label="Total Users" value="1,242" trend="up" />
              <StatTile d={d} label="Active Schools" value="12" />
              <StatTile d={d} label="System Health" value="99.8%" />
              <StatTile d={d} label="API Uptime" value="99.9%" />
            </Grid>

            <Card d={d} style={{ marginTop: d.space6 }}>
              <h3
              style={{
                fontFamily: d.fontHead,
                fontSize: d.textLg,
                fontWeight: 700,
                color: d.text,
                marginBottom: d.space4
              }}>{t("landing:system_status", "System Status")}


            </h3>
              <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: d.space3
              }}>
              
                {[
              { name: 'Database', status: 'operational' },
              { name: 'API Server', status: 'operational' },
              { name: 'Storage', status: 'operational' }].
              map((item) =>
              <div
                key={item.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: d.space3,
                  background: d.surfaceAlt,
                  borderRadius: d.radius
                }}>
                
                    <span style={{ color: d.text, fontWeight: 500 }}>{item.name}</span>
                    <Badge d={d} variant="success">
                      {item.status}
                    </Badge>
                  </div>
              )}
              </div>
            </Card>
          </div>
        }

        {activeTab === 'users' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:index.user_management", "User Management")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:manage_all_system_users_and_permissions", "Manage all system users and permissions.")}</p>
          </Card>
        }

        {activeTab === 'schools' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:schools_districts", "Schools & Districts")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:manage_district_and_school_configuration", "Manage district and school configurations.")}</p>
          </Card>
        }

        {activeTab === 'content' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:content_management", "Content Management")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:manage_activities_standards_and_resource", "Manage activities, standards, and resources.")}</p>
          </Card>
        }

        {activeTab === 'analytics' &&
        <Card d={d}>
            <h3
            style={{
              fontFamily: d.fontHead,
              fontSize: d.textLg,
              fontWeight: 700,
              color: d.text,
              marginBottom: d.space4
            }}>{t("landing:system_analytics", "System Analytics")}


          </h3>
            <p style={{ color: d.textMuted }}>{t("landing:view_usage_statistics_and_trends", "View usage statistics and trends.")}</p>
          </Card>
        }
      </MainContent>
    </SidebarLayout>);

};

export default {
  StudentDashboard,
  TeacherDashboard,
  ParentDashboard,
  AdminDashboard
};