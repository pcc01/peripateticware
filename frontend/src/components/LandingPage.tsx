// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import Footer from './landing/Footer';
import StorySection from './landing/StorySection';
import { PhoneCarousel } from './PhoneCarousel';
import { LocaleSwitcher } from './LocaleSwitcher';
import './PhoneCarousel.css';
import '../styles/landing.css';
import '../styles/globals.css';
import { PRODUCT_NAME } from '../constants/brand';

type HeroTab = 'student' | 'teacher' | 'parent' | 'homeschool';

interface PricingOption {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export const LandingPage: React.FC = () => {
  const { t, i18n } = useTranslation('landing');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<HeroTab>('homeschool');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);
  const [selectedTeamMember, setSelectedTeamMember] = useState<number | null>(null);

  // Team carousel auto-advance
  useEffect(() => {
    const teamInterval = setInterval(() => {
      setCurrentTeamIndex((prev) => (prev + 1) % 4);
    }, 5000);
    return () => clearInterval(teamInterval);
  }, []);

  // Testimonials carousel auto-advance
  useEffect(() => {
    const testimInterval = setInterval(() => {
      setCurrentTestimonialIndex((prev) => (prev + 1) % 5);
    }, 6000);
    return () => clearInterval(testimInterval);
  }, []);

  const handleNavigateToAuth = () => {
    navigate('/login');
  };

  const heroContent: Record<HeroTab, {headline: string;intro: string;cta: string;secondary_cta: string;image: string;}> = {
    student: {
      headline: t('student.headline'),
      intro: t('student.intro'),
      cta: t('student.cta'),
      secondary_cta: t('student.secondary_cta'),
      image: '🎓'
    },
    teacher: {
      headline: t('teacher.headline'),
      intro: t('teacher.intro'),
      cta: t('teacher.cta'),
      secondary_cta: t('teacher.secondary_cta'),
      image: '👨‍🏫'
    },
    parent: {
      headline: t('parent.headline'),
      intro: t('parent.intro'),
      cta: t('parent.cta'),
      secondary_cta: t('parent.secondary_cta'),
      image: '👨‍👩‍👧‍👦'
    },
    homeschool: {
      headline: t('homeschool.headline', 'The World Is Your Classroom.'),
      intro: t('homeschool.intro', 'Peripateticware is built for homeschool families who learn by doing. Peri — your Aristotelian AI guide — leads each child through real-world activities with structured questions that deepen understanding, not just fill in answers. Track state standards automatically, and generate portfolio reports in one click.'),
      cta: t('homeschool.cta', 'Start Free — No Credit Card'),
      secondary_cta: t('homeschool.secondary_cta', 'See a Sample Activity'),
      image: '🏡'
    }
  };

  const personaCarousels = {
    student: [
      {
        title: 'Field Journal — Wetlands Visit',
        prompt: "What patterns do you notice in how the plants are arranged near the water's edge?",
        emoji: '🌿',
        backgroundColor: '#eaf2ec',
        badge: 'Observation',
        location: 'Maplewood Wetlands'
      },
      {
        title: 'Peri asks a question',
        prompt: "You found three different insects. What do they have in common, and what makes each one different?",
        emoji: '🦋',
        backgroundColor: '#f0fdf4',
        badge: 'Inquiry',
        location: 'School Garden'
      },
      {
        title: 'Evidence Captured',
        prompt: "Great observation! Now — what do you think caused the leaves to change colour on this side of the tree?",
        emoji: '📸',
        backgroundColor: '#ecfdf5',
        badge: 'Analyze',
        location: 'City Park'
      },
    ],
    teacher: [
      {
        title: 'Create Activity — River Study',
        prompt: "Set location, objectives, and cognitive level. Peri generates guiding questions automatically.",
        emoji: '🗺️',
        backgroundColor: '#eef2ff',
        badge: 'Setup',
        location: 'Activity Builder'
      },
      {
        title: 'Live Session Monitor',
        prompt: "14 students active · 3 field notes submitted · 2 waiting for your feedback",
        emoji: '📊',
        backgroundColor: '#f5f3ff',
        badge: 'Monitoring',
        location: 'Sessions Dashboard'
      },
      {
        title: 'Peri AI Suggestions',
        prompt: "Based on your subject and location, here are 4 Bloom's-aligned activity ideas…",
        emoji: '✨',
        backgroundColor: '#faf5ff',
        badge: 'AI Assist',
        location: 'Activity Builder'
      },
    ],

    parent: [
      {
        emoji: '📈',
        backgroundColor: '#fef9ec',
        title: "Emma's Progress",
        subtitle: 'Grade 4 · Spring 2026',
        badge: 'On Track',
        badgeColor: '#4a7c59',
        location: 'Parent Dashboard',
        stats: [
          { label: 'Activities', value: '12' },
          { label: 'This Week', value: '3h' },
          { label: 'Badges', value: '5' },
        ],
        tasks: [
          { text: 'Science — Ecosystem unit ✓', done: true },
          { text: 'Math — Geometry field trip ✓', done: true },
          { text: 'History — Capitol visit', done: false },
          { text: 'Portfolio export ready', done: true },
        ],
      },
      {
        emoji: '📊',
        backgroundColor: '#fef9ec',
        title: 'Weekly Progress',
        subtitle: 'Emma · Week of May 26',
        badge: 'On Track',
        badgeColor: '#4a7c59',
        location: 'Progress',
        stats: [
          { label: 'Activities', value: '3' },
          { label: 'Hours', value: '4.5h' },
          { label: 'Engagement', value: '92%' },
        ],
        tasks: [
          { text: 'Ecosystem observation ✓', done: true },
          { text: 'Water cycle lab ✓', done: true },
          { text: 'Capitol visit — pending', done: false },
        ],
      },
      {
        emoji: '🔔',
        backgroundColor: '#fff7ed',
        title: 'Recent Updates',
        subtitle: 'From Ms. Smith · Today',
        badge: '2 New',
        badgeColor: '#d97706',
        location: 'Dashboard',
        prompt: '"Emma showed great initiative identifying native plants. Field sketch portfolio approved."',
        stats: [
          { label: 'This Week', value: '2' },
          { label: 'This Month', value: '8' },
          { label: 'Portfolio', value: 'Ready' },
        ],
      },
    ],

    homeschool: [
      {
        emoji: '🏕️',
        backgroundColor: '#dceedd',
        title: 'Today\'s Activity',
        subtitle: 'Earth Science · Emma & Lucas',
        badge: '● Active',
        badgeColor: '#16a34a',
        location: 'Barton Creek Greenbelt',
        tasks: [
          { text: 'Identify rock types at outcrop', done: true },
          { text: 'Measure stream flow rate', done: true },
          { text: 'Photograph erosion evidence', done: false },
          { text: 'Complete observation log', done: false },
        ],
      },
      {
        emoji: '📋',
        backgroundColor: '#f0fdf4',
        title: 'Standards Coverage',
        subtitle: 'Texas Homeschool Requirements',
        badge: '68% Met',
        badgeColor: '#16a34a',
        location: 'Coverage Dashboard',
        stats: [
          { label: 'Met', value: '17' },
          { label: 'Partial', value: '5' },
          { label: 'Gaps', value: '3' },
        ],
        tasks: [
          { text: 'Science — Earth Systems ✓', done: true },
          { text: 'Math — Measurement ✓', done: true },
          { text: 'History — Texas Geography', done: false },
          { text: 'Language Arts — Research', done: false },
        ],
      },
      {
        emoji: '📄',
        backgroundColor: '#ecfdf5',
        title: 'Portfolio Ready',
        subtitle: 'Spring 2026 · Emma Rivera',
        badge: 'Export Ready',
        badgeColor: '#16a34a',
        location: 'Export',
        stats: [
          { label: 'Activities', value: '24' },
          { label: 'Evidence', value: '61' },
          { label: 'Pages', value: '18' },
        ],
        tasks: [
          { text: 'Cover page ✓', done: true },
          { text: 'Activity log ✓', done: true },
          { text: 'Standards coverage ✓', done: true },
          { text: 'Evidence thumbnails ✓', done: true },
        ],
        prompt: 'PDF portfolio is ready. Includes all required TX state reporting fields.',
      },
    ],

  };

  const valuePropsByRole: Record<HeroTab, {icon: string;title: string;desc: string;}[]> = {
    student: [
    { icon: '📸', title: t('student.feature_1_title'), desc: t('student.feature_1_desc') },
    { icon: '🎯', title: t('student.feature_2_title'), desc: t('student.feature_2_desc') },
    { icon: '📊', title: t('student.feature_3_title'), desc: t('student.feature_3_desc') }],

    teacher: [
    { icon: '✏️', title: t('teacher.feature_1_title'), desc: t('teacher.feature_1_desc') },
    { icon: '👥', title: t('teacher.feature_2_title'), desc: t('teacher.feature_2_desc') },
    { icon: '📈', title: t('teacher.feature_3_title'), desc: t('teacher.feature_3_desc') }],

    parent: [
    { icon: '👁️', title: t('parent.feature_1_title'), desc: t('parent.feature_1_desc') },
    { icon: '📧', title: t('parent.feature_2_title'), desc: t('parent.feature_2_desc') },
    { icon: '🔔', title: t('parent.feature_3_title'), desc: t('parent.feature_3_desc') }],

    homeschool: [
    { icon: '🧭', title: t('homeschool.feature_1_title', 'Peri Guides Every Activity'), desc: t('homeschool.feature_1_desc', 'Peri is your child\'s AI learning companion — not a chatbot that answers for them, but a guide that asks the right question at the right moment. Inquiry, analysis, and evidence lead to real understanding.') },
    { icon: '📋', title: t('homeschool.feature_2_title', 'State Standards — Handled'), desc: t('homeschool.feature_2_desc', 'Peripateticware tracks coverage against your state\'s requirements as your children complete activities. Know exactly what\'s met, what\'s partial, and what\'s missing — without a single spreadsheet.') },
    { icon: '📄', title: t('homeschool.feature_3_title', 'Portfolio Ready in One Click'), desc: t('homeschool.feature_3_desc', 'Generate a complete PDF portfolio with activity logs, evidence, and standards coverage for state filings or co-op reviews. No formatting, no manual assembly.') }]

  };

  const teamMembers = [
  { name: t('team_1_name'), role: t('team_1_role'), avatar: t('team_1_initial'), bio: t('team_1_bio') },
  { name: t('team_2_name'), role: t('team_2_role'), avatar: t('team_2_initial'), bio: t('team_2_bio') },
  { name: t('team_3_name'), role: t('team_3_role'), avatar: t('team_3_initial'), bio: t('team_3_bio') },
  { name: t('team_4_name'), role: t('team_4_role'), avatar: t('team_4_initial'), bio: t('team_4_bio') }];


  const testimonials = [
  { quote: t('testimonial_1_text'), author: t('testimonial_1_author'), avatar: '👨‍🎓' },
  { quote: t('testimonial_2_text'), author: t('testimonial_2_author'), avatar: '👩‍🏫' },
  { quote: t('testimonial_3_text'), author: t('testimonial_3_author'), avatar: '👨‍👩‍👧' },
  { quote: t('testimonial_4_text'), author: t('testimonial_4_author'), avatar: '👨‍🏫' },
  { quote: t('testimonial_5_text'), author: t('testimonial_5_author'), avatar: '👩‍🎓' }];


  const pricingOptions: PricingOption[] = [
  {
    id: 'personal',
    title: 'Personal',
    subtitle: 'For individual students',
    price: 'Free',
    description: 'Get started with outdoor learning',
    features: ['Geo-tagged observations', 'AI-powered reflection prompts', 'Progress tracking'],
    cta: 'Start Free'
  },
  {
    id: 'school',
    title: 'School',
    subtitle: 'For teachers & classrooms',
    price: '$99/mo',
    description: 'Full classroom management',
    features: ['Activity builder', 'Student management', 'Assessment rubrics', 'Parent portal'],
    cta: 'Contact Sales',
    featured: true
  },
  {
    id: 'district',
    title: 'District',
    subtitle: 'For entire districts',
    price: 'Custom',
    description: 'Enterprise features & support',
    features: ['Unlimited teachers & students', 'Custom integrations', 'Dedicated support', 'Privacy compliance', 'Advanced analytics'],
    cta: 'Contact Sales'
  }];


  const currentHero = heroContent[activeTab];
  const currentCarousel = personaCarousels[activeTab];

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="sticky top-0 z-50" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--section-x)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧭</span>{PRODUCT_NAME}

          </h1>

          <div style={{ display: 'flex', gap: '32px' }} className="md-nav-links">
            <button onClick={() => setActiveTab('homeschool')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none', padding: 0 }}>🏡 Homeschool</button>
            <a href="#features" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("landing:features", "Features")}</a>
            <a href="#pricing" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("landing:pricing", "Pricing")}</a>
            <a href="#about" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("landing:about", "About")}</a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <LocaleSwitcher />

            <button
              onClick={handleNavigateToAuth}
              className="btn btn--primary"
              style={{ padding: '8px 14px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              {t("landing:login", "Login")}
            </button>

            <button
              onClick={() => navigate('/signup')}
              className="btn btn--ghost"
              style={{ padding: '8px 14px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              {t("landing:sign_up", "Sign Up")}
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                display: 'flex',
                padding: '6px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.25rem',
                lineHeight: 1,
              }}>
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen &&
        <div style={{ background: 'var(--surface)', padding: 'var(--section-x)', borderTop: '1px solid var(--border)' }}>
            <a href="#features" style={{ display: 'block', color: 'var(--text)', padding: '12px 0', textDecoration: 'none' }}>{t("landing:features", "Features")}</a>
            <a href="#pricing" style={{ display: 'block', color: 'var(--text)', padding: '12px 0', textDecoration: 'none' }}>{t("landing:pricing", "Pricing")}</a>
            <a href="#about" style={{ display: 'block', color: 'var(--text)', padding: '12px 0', textDecoration: 'none' }}>{t("landing:about", "About")}</a>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={handleNavigateToAuth} className="btn btn--primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>{t("landing:login", "Login")}</button>
              <button onClick={() => navigate('/signup')} className="btn btn--ghost" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>{t("landing:sign_up", "Sign Up")}</button>
            </div>
          </div>
        }
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-inner">
          {/* Role Tabs */}
          <div className="persona-tabs" style={{ justifyContent: 'center', marginBottom: '48px' }}>
            {(['homeschool', 'student', 'teacher', 'parent'] as const).map((tab) =>
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`persona-tab ${activeTab === tab ? 'active' : ''}`}
              style={{ textTransform: 'capitalize' }}>
                {tab === 'homeschool' ? '🏡 Homeschool' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            )}
          </div>

          <div className="hero-container">
            <div className="hero-text">
              <h2 className="h-display">
                {currentHero.headline}
              </h2>
              <p className="lead">
                {currentHero.intro}
              </p>
              <div className="hero-ctas">
                <button
                  onClick={handleNavigateToAuth}
                  className="btn btn--primary btn--lg">
                  
                  {currentHero.cta} →
                </button>
                <button
                  className="btn btn--ghost btn--lg"
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                  {currentHero.secondary_cta}
                </button>
              </div>
            </div>

            <div className="hero-mockup">
              <PhoneCarousel screens={currentCarousel} personaColor="var(--accent)" />
            </div>
          </div>
        </div>
      </section>

      {/* Homeschool — How Peri Works (shown only on homeschool tab) */}
      {activeTab === 'homeschool' && (
        <section id="tools" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '4rem var(--section-x, 1.5rem)' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <span style={{ display: 'inline-block', background: 'var(--primary-muted)', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: '999px', marginBottom: '12px' }}>
                Meet Peri
              </span>
              <h2 className="h-section" style={{ marginBottom: '0.5rem' }}>{t('components_landingpage.guided_inquiry_that_leads_to_real_knowle', 'Guided inquiry that leads to real knowledge')}</h2>
              <p className="body" style={{ color: 'var(--text-muted)', maxWidth: '620px', margin: '0 auto' }}>
                Peri isn't a search engine or a homework helper. It leads your child through a structured inquiry — observation, analysis, and evidence — until they can explain the <em>why</em>, not just the <em>what</em>. Peri's questions are curated by educators using Aristotle's inquiry method; when a local AI model (Ollama) is running, Peri responds dynamically to your child's specific answers.
              </p>
            </div>

            {/* Step-by-step flow */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
              {[
                { step: '1', phase: 'Engage', icon: '👀', desc: 'Peri sets the scene and asks your child what they notice. No right answer yet — just looking.' },
                { step: '2', phase: 'Observe', icon: '🔍', desc: 'Your child records what they see, hear, or measure. Peri prompts for specifics if the answer is vague.' },
                { step: '3', phase: 'Analyse', icon: '⚖️', desc: 'Peri asks comparison and classification questions. What\'s similar? What\'s different? What pattern do you see?' },
                { step: '4', phase: 'Explain', icon: '💡', desc: 'Your child proposes a cause or mechanism. Peri tests it with evidence questions, not hints.' },
                { step: '5', phase: 'Apply', icon: '🛠️', desc: 'Peri asks what this means for a new situation. Knowledge becomes portable.' },
              ].map(({ step, phase, icon, desc }) => (
                <div key={step} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</span>
                    <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                    <strong style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>{phase}</strong>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>{desc}</p>
                </div>
              ))}
            </div>

            {/* Sample exchange */}
            <div style={{ background: 'var(--primary-muted)', border: '1px solid var(--primary)', borderRadius: '14px', padding: '1.75rem', maxWidth: '720px', margin: '0 auto' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem' }}>{t('components_landingpage.sample_exchange_creek_study_grade_5', 'Sample exchange — Creek Study, Grade 5')}</p>
              {[
                { from: 'Peri', text: 'You\'re at the creek bank. Before we measure anything — what\'s the first thing you notice about the water right here versus ten feet upstream?' },
                { from: 'Emma', text: 'It\'s slower here and there\'s more mud on the bottom.' },
                { from: 'Peri', text: 'Good observation. Why do you think the mud settled here and not upstream where the water is faster?' },
                { from: 'Emma', text: 'Maybe slower water can\'t carry as much stuff?' },
                { from: 'Peri', text: 'That\'s the right direction. What could you measure or photograph here to support that idea?' },
              ].map((msg, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexDirection: msg.from === 'Peri' ? 'row' : 'row-reverse' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: msg.from === 'Peri' ? 'var(--primary)' : '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: msg.from === 'Peri' ? '#fff' : 'var(--primary)', flexShrink: 0 }}>
                    {msg.from === 'Peri' ? '🧭' : 'E'}
                  </div>
                  <div style={{ background: msg.from === 'Peri' ? '#fff' : '#d1fae5', borderRadius: '10px', padding: '10px 14px', fontSize: '0.875rem', color: 'var(--text)', maxWidth: '80%', lineHeight: 1.5 }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', textAlign: 'center', fontStyle: 'italic' }}>{t('components_landingpage.peri_never_gives_the_answer_it_asks_the_', 'Peri never gives the answer. It asks the next right question. — Questions are drawn from a curated bank; AI responses require Ollama running locally or an Anthropic API key.')}</p>
            </div>
          </div>
        </section>
      )}

      {/* Value Prop / Features Section */}
      <section id="features" className="features-section">
        <div className="features-inner">
          <h2 className="h-section text-center">
            {activeTab === 'homeschool'
              ? t('homeschool.features_title', 'Everything a Homeschool Family Needs')
              : `${t("landing:why", "Why")} ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}s ${`Choose ${PRODUCT_NAME}`}`}
          </h2>

          <div className="features-grid">
            {valuePropsByRole[activeTab].map((item, idx) =>
            <div key={idx} className="feature-card">
                <div className="feature-icon">{item.icon}</div>
                <h3 className="h-card">{item.title}</h3>
                <p className="body">{item.desc}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Story Section */}
      <StorySection />

      {/* About / Origin Story Section */}
      <section id="about" style={{ background: 'var(--surface)', padding: '5rem var(--section-x, 1.5rem)', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <span style={{ display: 'inline-block', background: 'var(--primary-muted)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: '999px', marginBottom: '1rem' }}>
              Origin Story
            </span>
            <h2 className="h-section" style={{ marginBottom: '1rem' }}>{t('components_landingpage.built_from_a_2007_idea_that_took_until_2', 'Built from a 2007 idea that took until 2026 to be possible')}</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('components_landingpage.peripateticware_began_as_a_white_paper_w', 'Peripateticware began as a white paper written inside McGraw-Hill Education. It argued that GPS-enabled mobile devices would transform learning — that students walking through real places, guided by structured inquiry, could learn in a way textbooks never allowed.')}</p>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '1.5rem' }}>{t('components_landingpage.the_paper_named_one_problem_it_couldnt_s', 'The paper named one problem it couldn\'t solve: assessment. How do you evaluate learning that happens in a creek bed, or at a cathedral arch, or in a city park? In 2026, AI finally gave us the answer.')}</p>
            <Link
              to="/about/origin"
              style={{ display: 'inline-block', background: 'var(--primary)', color: '#fff', padding: '0.7rem 1.5rem', borderRadius: '0.6rem', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>
              Read the full origin story →
            </Link>
          </div>
          <div style={{ background: 'var(--primary-muted)', borderRadius: '1.25rem', padding: '2rem', border: '1px solid var(--primary)' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem' }}>{t('components_landingpage.from_the_original_2007_paper', 'From the original 2007 paper')}</p>
            <blockquote style={{ fontSize: '1rem', color: 'var(--text)', lineHeight: 1.75, fontStyle: 'italic', borderLeft: '3px solid var(--primary)', paddingLeft: '1rem', margin: 0 }}>
              "What if a math product presented a discussion of the arch when a student stood inside
              a cathedral? What if the student could learn the history of the church, the biography
              of the architect, and the role religion played in founding the United States — and this
              ignited their passion to understand the mathematics of weight distribution?"
            </blockquote>
            <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              — Paul Christopher Cerda, <em>Peripateticware: Education for Mobile Devices</em>, 2007
            </p>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="team-section">
        <div className="team-inner">
          <h2 className="h-section text-center">
            {t('team_title')}
          </h2>
          <div className="team-carousel">
            {teamMembers.map((member, idx) =>
            <div
              key={idx}
              className="team-card"
              onClick={() => setSelectedTeamMember(idx)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTeamMember(idx); } }}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              style={{ opacity: idx === currentTeamIndex ? 1 : 0.5, transition: 'opacity 300ms ease', cursor: 'pointer' }}>

                <div className="team-avatar">{member.avatar}</div>
                <h4 className="h-card">{member.name}</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{member.role}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Team member bio popup */}
      {selectedTeamMember !== null &&
      <div
        onClick={() => setSelectedTeamMember(null)}
        role="presentation"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '1.5rem',
        }}>
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={teamMembers[selectedTeamMember].name}
          style={{
            background: 'var(--surface)', borderRadius: '0.75rem',
            maxWidth: '420px', width: '100%', padding: '2rem',
            position: 'relative', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
          <button
            onClick={() => setSelectedTeamMember(null)}
            aria-label="Close"
            style={{
              position: 'absolute', top: '0.75rem', right: '0.75rem',
              background: 'none', border: 'none', fontSize: '1.5rem',
              lineHeight: 1, cursor: 'pointer', color: 'var(--text-muted)',
            }}>
            ×
          </button>
          <div className="team-avatar" style={{ margin: '0 auto 1rem' }}>
            {teamMembers[selectedTeamMember].avatar}
          </div>
          <h3 className="h-card" style={{ marginBottom: '0.25rem' }}>
            {teamMembers[selectedTeamMember].name}
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {teamMembers[selectedTeamMember].role}
          </p>
          <p className="body" style={{ lineHeight: 1.6, color: 'var(--text)' }}>
            {teamMembers[selectedTeamMember].bio}
          </p>
        </div>
      </div>
      }

      {/* 14i.1 — Privacy First / Trust Badges section */}
      <section style={{ background: 'var(--primary-muted)', padding: '5rem var(--section-x, 1.5rem)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span style={{ display: 'inline-block', background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: '999px', marginBottom: '1rem' }}>
              Privacy &amp; Compliance
            </span>
            <h2 className="h-section" style={{ color: 'var(--primary)', marginBottom: '0.75rem' }}>
              {t('privacy_first_title', 'Built for Privacy from Day One')}
            </h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: '640px', margin: '0 auto', fontSize: '1rem', lineHeight: 1.65 }}>
              {t('privacy_first_desc', 'Peripateticware meets the highest privacy standards for K–12 education in the US, EU, Canada, and Brazil.')}
            </p>
          </div>

          {/* Compliance badge grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { acronym: 'FERPA', name: 'Family Educational Rights and Privacy Act', region: 'United States' },
              { acronym: 'COPPA', name: 'Children\'s Online Privacy Protection Act', region: 'United States' },
              { acronym: 'GDPR', name: 'General Data Protection Regulation', region: 'European Union' },
              { acronym: 'CCPA', name: 'California Consumer Privacy Act', region: 'California, US' },
              { acronym: 'LGPD', name: 'Lei Geral de Proteção de Dados', region: 'Brazil' },
              { acronym: 'PIPEDA', name: 'Personal Information Protection and Electronic Documents Act', region: 'Canada' },
            ].map(({ acronym, name, region }) => (
              <div key={acronym} style={{
                background: 'var(--surface)',
                borderRadius: '0.75rem',
                padding: '1rem 1.25rem',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)', letterSpacing: '0.02em' }}>
                  {acronym}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text)', lineHeight: 1.4 }}>
                  {name}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                  {region}
                </span>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
            {t('no_ads_no_tracking', 'No ads. No tracking. No selling student data. Ever.')}
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials-section">
        <div className="testimonials-inner">
          <h2 className="h-section text-center">
            {t('testimonials_title')}
          </h2>
          <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ position: 'relative', minHeight: '300px' }}>
              {testimonials.map((testimonial, idx) =>
              <div
                key={idx}
                style={{
                  opacity: idx === currentTestimonialIndex ? 1 : 0,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transition: 'opacity 300ms ease-in-out'
                }}>
                
                  <div className="testimonial-card">
                    <p className="body" style={{ fontStyle: 'italic', marginBottom: '16px' }}>
                      "{testimonial.quote}"
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: '2rem' }}>{testimonial.avatar}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{testimonial.author}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
              {testimonials.map((_, idx) =>
              <button
                key={idx}
                onClick={() => setCurrentTestimonialIndex(idx)}
                style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: idx === currentTestimonialIndex ? 'var(--primary)' : 'var(--border)',
                  border: 'none', cursor: 'pointer', padding: 0,
                }} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ background: 'var(--bg)', padding: '5rem var(--section-x, 1.5rem)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.9rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>{t('components_landingpage.simple_honest_pricing', 'Pricing')}</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1rem' }}>{t('components_landingpage.free_for_one_classroom_no_credit_card_re', 'Plans for classrooms, schools, districts, and homeschool families.')}</p>

          {/* Tier cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
            {[
              { name: 'Personal', highlight: false,
                features: ['Individual classrooms', 'Core activity types', 'Peri AI', 'Evidence capture', 'Portfolio view'] },
              { name: 'School', highlight: true,
                features: ['Multiple classrooms', 'Multi-admin', 'Org analytics', 'Priority support'] },
              { name: 'District', highlight: false,
                features: ['District-wide deployment', 'Custom integrations', 'Dedicated onboarding', 'Priority + SLA support'] },
              { name: 'Homeschool', highlight: false,
                features: ['Family accounts', 'Portfolio PDF export', 'State compliance reports', 'Standards mapping'] },
            ].map(tier => (
              <div key={tier.name} style={{
                background: tier.highlight ? 'var(--primary)' : 'var(--surface)',
                border: tier.highlight ? 'none' : '1px solid var(--border)',
                borderRadius: '0.6rem', padding: '1.5rem',
                boxShadow: tier.highlight ? '0 4px 24px rgba(27,67,50,0.2)' : 'none',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ marginBottom: '0.25rem', fontWeight: 700, fontSize: '1rem', color: tier.highlight ? '#fff' : 'var(--text)' }}>
                  {tier.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: tier.highlight ? '#fff' : 'var(--text)' }}>
                    Contact us for pricing
                  </span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem', flex: 1 }}>
                  {tier.features.map(f => (
                    <li key={f} style={{
                      fontSize: '0.82rem', padding: '0.2rem 0',
                      color: tier.highlight ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)',
                      display: 'flex', gap: '0.4rem',
                    }}>
                      <span style={{ color: tier.highlight ? '#a7f3d0' : 'var(--primary)', flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:hello@peripateticware.com"
                  style={{
                    display: 'inline-block', textAlign: 'center',
                    padding: '0.55rem 1rem', borderRadius: '0.4rem', fontWeight: 600,
                    fontSize: '0.85rem', cursor: 'pointer', border: 'none', textDecoration: 'none',
                    background: tier.highlight ? '#fff' : 'var(--primary)',
                    color: tier.highlight ? 'var(--primary)' : '#fff',
                  }}
                >
                  Contact Team
                </a>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1.5rem' }}>
            Contact our team for pricing details and to find the right plan — <a href="mailto:hello@peripateticware.com" style={{ color: 'var(--primary)' }}>contact us</a>.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'var(--primary)', padding: '4rem var(--section-x, 1.5rem)', textAlign: 'center' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h2 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem' }}>
            {t('cta_title', 'Ready to take learning outside?')}
          </h2>
          <button
            onClick={handleNavigateToAuth}
            style={{ background: '#fff', color: 'var(--primary)', border: 'none', borderRadius: '0.6rem', padding: '0.85rem 2rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
            {t('cta_btn', 'Get Started Free')} →
          </button>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginTop: '1.25rem' }}>
            {t('cta_privacy_note', 'FERPA and COPPA compliant. Student data is never sold or shared.')}
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default LandingPage;
