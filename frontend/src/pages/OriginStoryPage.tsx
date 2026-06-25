// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * OriginStoryPage  —  /about/origin
 *
 * The full origin story of Peripateticware: from a 2007 white paper written
 * at McGraw-Hill to a working platform in 2026.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function OriginStoryPage() {
  const { t } = useTranslation('landing');
  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
      <Link
        to="/#about"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '2.5rem' }}>
        <ArrowLeft size={16} /> Back
      </Link>

      {/* Header */}
      <header style={{ marginBottom: '3rem' }}>
        <span style={{ display: 'inline-block', background: 'var(--primary-muted)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: '999px', marginBottom: '1rem' }}>
          Origin Story
        </span>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginBottom: '1rem' }}>{t('pages_originstorypage.from_a_white_paper_to_a_working_platform', 'From a White Paper to a Working Platform: Peripateticware 2007–2026')}</h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          In February 2007, a document circulated internally at McGraw-Hill Education. It was titled
          <em> "Peripateticware: Education for Mobile Devices."</em> It proposed something that didn't
          exist yet and couldn't: a software category that used GPS location as a core teaching tool,
          superimposed the virtual world over the physical, and let students follow their curiosity
          through real places rather than sitting still while knowledge was delivered to them.
          The document was filed away. The ideas weren't.
        </p>
      </header>

      {/* Section 1 */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>{t('pages_originstorypage.the_insight_aristotle_was_right', 'The Insight: Aristotle Was Right')}</h2>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>
          The name came first. <em>Peripateticware</em> — from the Greek <em>peripatein</em>, to walk
          about — refers to Aristotle's method of teaching. Aristotle walked with his students through
          the Lyceum, teaching through movement, observation, and dialogue. He believed that the act
          of moving through space was itself a form of thinking, that knowledge gained in context
          stuck in a way that knowledge delivered from a lectern did not.
        </p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>
          The 2007 document made a simple argument: mobile devices were about to become ubiquitous,
          and that ubiquity was an educational opportunity that publishers and schools had not yet
          understood. The paper described "mediascapes" — GPS-triggered multimedia experiences
          overlaid on physical locations. It described a math product that would activate when a
          student stood inside a cathedral and start a conversation about the arch, not with
          equations, but with the question: <em>Why doesn't it fall?</em>
        </p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8 }}>{t('pages_originstorypage.the_paper_was_written_at_a_moment_when_3', 'The paper was written at a moment when 3G hadn\'t fully rolled out, the iPhone was months away from launch, and "app" wasn\'t yet a common word. Its predictions — that cell phones would become 1-for-1 classroom devices, that mobile networks would reach remote regions, that GPS would become cheap enough to put in every student\'s pocket — all came true. The products the paper called for did not.')}</p>
      </section>

      {/* Section 2 */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>{t('pages_originstorypage.the_problem_that_remained_unsolved', 'The Problem That Remained Unsolved')}</h2>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.the_2007_document_named_one_obstacle_it_', 'The 2007 document named one obstacle it couldn\'t solve:')}</p>
        <blockquote style={{ borderLeft: '4px solid var(--primary)', paddingLeft: '1.25rem', margin: '1.5rem 0', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.8 }}>
          "Assessment is clearly the most difficult part of 'unleashed education.' A quantitative
          analysis of qualitative education is the problem educational publishers will need to address.
          I can't think of an easy answer but I do see this as a major obstacle."
        </blockquote>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.if_students_follow_their_curiosity_throu', 'If students follow their curiosity through real places, learning about arches, barrels, and celestial navigation because they\'re standing near a cathedral or a harbour, how do you assess what they\'ve learned in a way that satisfies curriculum requirements? How do you produce the spreadsheet of numbers the principal wants while also honouring the complexity of what the student actually understood?')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8 }}>{t('pages_originstorypage.the_document_left_that_question_open_the', 'The document left that question open. The school system didn\'t solve it either. For nearly two decades, "outdoor learning" remained either a vague aspiration or a logistical nightmare — teachers with clipboards, activities that produced no artifact, experiences that disappeared the moment students came back inside.')}</p>
      </section>

      {/* Section 3 */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>{t('pages_originstorypage.the_2026_answer_ai_did_what_spreadsheets', 'The 2026 Answer: AI Did What Spreadsheets Couldn\'t')}</h2>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.the_assessment_problem_turned_out_to_hav', 'The assessment problem turned out to have two parts. The first was capturing evidence — what did the student actually observe, and can you prove it? The second was evaluating it — did their thinking deepen, or did they just describe what they saw?')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.the_first_part_was_solved_by_smartphones', 'The first part was solved by smartphones. Photo, audio, GPS coordinates, timestamps — a student at a creek bank can capture more evidence in ten minutes than a field trip clipboard could hold in a day. What remained was the second part: structured inquiry that didn\'t just document experience but deepened it.')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.thats_where_peri_comes_in_peri_is_peripa', 'That\'s where Peri comes in. Peri is Peripateticware\'s AI guide — named, like the software, after the Aristotelian method. Peri doesn\'t answer questions. It asks them. It follows the five-phase inquiry sequence — Engage, Observe, Analyse, Explain, Apply — that Aristotle used in the Lyceum and that cognitive science has since validated as a path to genuine understanding, not just retention. Peri takes a student\'s observation and asks the next right question. When the student gets it right, Peri tests the implication. When the student is vague, Peri asks for evidence.')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8 }}>{t('pages_originstorypage.the_result_is_an_artifact_a_field_journa', 'The result is an artifact: a field journal entry with captures, extended analysis, and a record of the inquiry itself. Teachers can see not just what a student concluded but how they got there. Rubrics aligned to Bloom\'s taxonomy and standards frameworks — CCSS, NGSS, TEKS, or your own — make the assessment legible to any curriculum coordinator. The spreadsheet and the real learning finally occupy the same document.')}</p>
      </section>

      {/* Section 4 */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>{t('pages_originstorypage.choose_your_own_adventure', 'Choose Your Own Adventure')}</h2>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.the_2007_paper_described_a_choose_your_o', 'The 2007 paper described a "choose your own adventure" model of learning — one where students follow tangents, pursue what interests them, and encounter core curriculum concepts through the side doors of genuine curiosity rather than the front door of instruction. The paper acknowledged this was "somewhat chaotic" and that it would require new kinds of instructional design, new assessment tools, and teachers willing to trade some control for authentic engagement.')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.peripateticware_doesnt_fully_solve_the_c', 'Peripateticware doesn\'t fully solve the chaos — that tension is real and probably permanent. What it does is give teachers enough structure to stay sane (designed activities, learning targets, completion phases, teacher approval workflows) while giving students enough freedom to actually go somewhere (GPS-triggered content, student-proposed activities, self-directed field notes, peer projects).')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8 }}>{t('pages_originstorypage.the_reverse_scavenger_hunt_where_student', 'The reverse scavenger hunt — where students propose an activity based on something they found — is the closest thing in the platform to that 2007 vision. A student finds a peculiar rock formation. They propose it as an activity. The teacher approves it. Other students go look. Questions emerge that no curriculum document anticipated. Learning moves.')}</p>
      </section>

      {/* Section 5 */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>{t('pages_originstorypage.why_this_took_until_2026', 'Why This Took Until 2026')}</h2>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.the_short_answer_is_that_most_of_the_ena', 'The short answer is that most of the enabling technology wasn\'t ready in 2007. GPS in every pocket came first (2010–2015). Then high-quality mobile cameras. Then cloud APIs cheap enough for schools. Then local AI models (Ollama, llama.cpp) that can run on a teacher\'s home server without a $10,000/month inference bill. The 2007 paper was right about the destination; it couldn\'t have known how long the road would be.')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: '1rem' }}>{t('pages_originstorypage.the_longer_answer_is_that_educational_te', 'The longer answer is that educational technology spent those years solving the wrong problem. EdTech iterated on the classroom — better LMS, better video, better quiz tools. It made the existing model more efficient. Peripateticware doesn\'t try to make the classroom more efficient. It tries to replace the classroom, at least occasionally, with the world.')}</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8 }}>{t('pages_originstorypage.thats_a_harder_sell_schools_are_riskaver', 'That\'s a harder sell. Schools are risk-averse. Outdoor learning has a liability optic. "The world is your classroom" sounds like a marketing line until you\'ve watched a ten-year-old explain sediment transport to a crow-shaped AI guide while standing in a creek bed, and then read the field journal entry they wrote that afternoon, and understood that they understood.')}</p>
      </section>

      {/* Footer CTA */}
      <section style={{ background: 'var(--primary-muted)', border: '1px solid var(--primary)', borderRadius: '1rem', padding: '2rem', textAlign: 'center', marginTop: '3rem' }}>
        <p style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>{t('pages_originstorypage.the_white_paper_is_still_online', 'The white paper is still online.')}</p>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>{t('pages_originstorypage.you_can_read_the_original_2007_document_', 'You can read the original 2007 document, written while the iPhone was still a rumour, at the link below. The vocabulary is dated. The argument isn\'t.')}</p>
        <a
          href="https://thewordinbits.com/2010/02/22/66/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', background: 'var(--primary)', color: '#fff', padding: '0.75rem 1.75rem', borderRadius: '0.6rem', textDecoration: 'none', fontWeight: 600, fontSize: '0.95rem' }}>
          Read the Original 2007 Paper →
        </a>
      </section>
    </div>
  );
}
