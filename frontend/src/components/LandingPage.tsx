// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Footer from './landing/Footer';
import StorySection from './landing/StorySection';
import { PhoneCarousel } from './PhoneCarousel';
import { LocaleSwitcher } from './LocaleSwitcher';
import './PhoneCarousel.css';
import '../styles/landing.css';
import '../styles/globals.css';

type HeroTab = 'student' | 'teacher' | 'parent';

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
  const [activeTab, setActiveTab] = useState<HeroTab>('student');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

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
    }
  };

  const personaCarousels = {
    student: [
    {
      title: t('student.mockup_title'),
      prompt: t('student.coach_prompt'),
      emoji: '📱',
      backgroundColor: '#eaf2ec'
    }],

    teacher: [
    {
      title: t('teacher.mockup_title'),
      prompt: t('teacher.coach_prompt'),
      emoji: '📱',
      backgroundColor: '#eef2ff'
    }],

    parent: [
    {
      title: t('parent.mockup_title'),
      prompt: t('parent.coach_prompt'),
      emoji: '📱',
      backgroundColor: '#fef3c7'
    }]

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
    { icon: '🔔', title: t('parent.feature_3_title'), desc: t('parent.feature_3_desc') }]

  };

  const teamMembers = [
  { name: t('team_1_name'), role: t('team_1_role'), avatar: t('team_1_initial') },
  { name: t('team_2_name'), role: t('team_2_role'), avatar: t('team_2_initial') },
  { name: t('team_3_name'), role: t('team_3_role'), avatar: t('team_3_initial') },
  { name: t('team_4_name'), role: t('team_4_role'), avatar: t('team_4_initial') }];


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
            <span>🧭</span>{t("landing:peripateticware", "Peripateticware")}

          </h1>

          <div style={{ display: 'flex', gap: '32px' }} className="md-nav-links">
            <a href="#features" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("landing:features", "Features")}</a>
            <a href="#pricing" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("landing:pricing", "Pricing")}</a>
            <a href="#about" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("landing:about", "About")}</a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* FIX 2: LocaleSwitcher was imported but never rendered */}
            <LocaleSwitcher />

            <button
              onClick={handleNavigateToAuth}
              className="btn btn--primary">
              {t("landing:login", "Login")}
            </button>

            <button
              onClick={() => navigate('/signup')}
              className="btn btn--ghost">
              {t("landing:sign_up", "Sign Up")}
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                display: 'flex',
                padding: '8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.5rem'
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
            <button onClick={handleNavigateToAuth} className="btn btn--primary" style={{ width: '100%', marginTop: '16px' }}>{t("landing:login", "Login")}</button>
            <button onClick={() => navigate('/signup')} className="btn btn--ghost" style={{ width: '100%', marginTop: '8px' }}>{t("landing:sign_up", "Sign Up")}</button>
          </div>
        }
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-inner">
          {/* Role Tabs */}
          <div className="persona-tabs" style={{ justifyContent: 'center', marginBottom: '48px' }}>
            {(['student', 'teacher', 'parent'] as const).map((tab) =>
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`persona-tab ${activeTab === tab ? 'active' : ''}`}
              style={{ textTransform: 'capitalize' }}>
              
                {tab}
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
                <button className="btn btn--ghost btn--lg">
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

      {/* Value Prop / Features Section */}
      <section id="features" className="features-section">
        <div className="features-inner">
          <h2 className="h-section text-center">{t("landing:why", "Why")}
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}{t("landing:s_choose_peripateticware", "s Choose Peripateticware")}
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

      {/* Team Section */}
      <section id="about" className="team-section">
        <div className="team-inner">
          <h2 className="h-section text-center">
            {t('team_title')}
          </h2>
          <div className="team-carousel">
            {teamMembers.map((member, idx) =>
            <div
              key={idx}
              className="team-card"
              style={{ opacity: idx === currentTeamIndex ? 1 : 0.5, transition: 'opacity 300ms ease' }}>
              
                <div className="team-avatar">{member.avatar}</div>
                <h4 className="h-card">{member.name}</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{member.role}</p>
              </div>
            )}
          </div>
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
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  background: idx === currentTestimonialIndex ? 'var(--accent)' : '#ccc',
                  transition: 'background-color 0.3s ease'
                }}
                aria-label={`Go to testimonial ${idx + 1}`} />

              )}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pricing-section">
        <div className="pricing-inner">
          <h2 className="h-section text-center">{t("landing:simple_transparent_pricing", "Simple, Transparent Pricing")}

          </h2>

          <div className="pricing-grid">
            {pricingOptions.map((option) =>
            <div
              key={option.id}
              className="pricing-card"
              style={{
                border: option.featured ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: option.featured ? 'var(--surface-alt)' : 'var(--surface)',
                transform: option.featured ? 'scale(1.05)' : 'scale(1)'
              }}>
              
                <div style={{ padding: '32px' }}>
                  <h3 className="h-card">{option.title}</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '16px' }}>{option.subtitle}</p>

                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>{option.price}</div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '8px' }}>{option.description}</p>
                  </div>

                  <ul style={{ listStyle: 'none', marginBottom: '32px' }}>
                    {option.features.map((feature, idx) =>
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 'bold', marginTop: '2px' }}>✓</span>
                        <span style={{ color: 'var(--text-muted)' }}>{feature}</span>
                      </li>
                  )}
                  </ul>

                  <button
                  onClick={handleNavigateToAuth}
                  className={option.featured ? 'btn btn--primary btn--lg' : 'btn btn--ghost btn--lg'}
                  style={{ width: '100%' }}>
                  
                    {option.cta}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Privacy & Footer */}
      <section className="privacy-section">
        <div className="privacy-inner">
          <h2 className="h-section">{t("landing:privacy_first", "Privacy First")}</h2>
          <p className="body" style={{ maxWidth: '800px', marginTop: '16px' }}>{t("landing:your_data_is_yours_we_collect_minimal_in", "Your data is yours. We collect minimal information and never sell it. Peripateticware uses encrypted connections, anonymous aggregation, and transparent data practices. You control what data is shared, with whom, and for how long.")}

          </p>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>);

};

export default LandingPage;