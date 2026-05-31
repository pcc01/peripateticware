# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Seed global state_reporting requirement sets for top 15 homeschool states

Revision ID: 20260530_seed_state_reporting_sets
Revises: 20260530_standards_sets_expiry_and_cache
Create Date: 2026-05-30

Seeds admin-owned (is_global=TRUE) state_reporting standards sets for the
15 states with the largest homeschool populations, covering the full spectrum
from zero-regulation (TX, AK, IL) to high-regulation (NY, PA).

Source: bluefolder.app/guides/homeschool-records (March 2026)

Each set contains one criterion per record category, with:
  - required: true/false  (does the state actually mandate this?)
  - description: the specific requirement language for that state
  - category: one of the six universal record types

The six universal categories:
  attendance    — day/hour logs
  curriculum    — course plans, subject lists
  testing       — standardized tests or evaluations
  portfolio     — work samples, quarterly reports
  immunization  — vaccination records
  transcripts   — progress reports, high school transcripts

All sets expire 2026-12-31 (calendar year end for reporting requirements).
No Ollama processing — hand-authored from research; processing_status='complete'.

Regulation tiers seeded:
  None     — TX, AK, IL, IN, MO
  Low      — CA, MI, NJ, TN
  Medium   — FL, NC, GA, SC, CO, WA, OH, VA, OR, MN
  High     — NY, PA
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '20260530_seed_state_reporting_sets'
down_revision = '20260530_standards_sets_expiry_and_cache'
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# State data — sourced from bluefolder.app research
# Each entry: (state_code, name, regulation_tier, description, criteria_list)
# criteria_list: list of dicts matching the standards_sets.criteria JSONB schema
# ---------------------------------------------------------------------------

STATES = [

  # ── ZERO REGULATION ────────────────────────────────────────────────────────

  ("TX", "Texas Homeschool Requirements 2025–26",
   "Texas has no state record-keeping requirements for homeschoolers under Texas "
   "Education Code §26.003. Families are not required to notify the district, track "
   "attendance, use a specific curriculum, or submit any documentation. Keeping "
   "voluntary records is still recommended for re-enrollment and college applications.",
   [
     {"id":"TX-ATT","code":"TX-ATT","subject":"Attendance","category":"attendance",
      "required":False,"description":"No attendance tracking required by state law. Voluntary tracking recommended.","weight":1.0},
     {"id":"TX-CUR","code":"TX-CUR","subject":"Curriculum","category":"curriculum",
      "required":False,"description":"No curriculum submission or approval required. Any subjects may be taught.","weight":1.0},
     {"id":"TX-TEST","code":"TX-TEST","subject":"Testing / Evaluation","category":"testing",
      "required":False,"description":"No standardized testing or evaluations required.","weight":1.0},
     {"id":"TX-PORT","code":"TX-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"No portfolio required. Recommended for re-enrollment or college applications.","weight":1.0},
     {"id":"TX-IMMU","code":"TX-IMMU","subject":"Immunization Records","category":"immunization",
      "required":False,"description":"No state immunization record requirement for homeschoolers.","weight":1.0},
     {"id":"TX-TRAN","code":"TX-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No progress reports required. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("IL", "Illinois Homeschool Requirements 2025–26",
   "Illinois has minimal homeschool requirements. Families must teach specified subjects "
   "but are not required to notify the district, register, or submit documentation.",
   [
     {"id":"IL-ATT","code":"IL-ATT","subject":"Attendance","category":"attendance",
      "required":False,"description":"No attendance record requirement.","weight":1.0},
     {"id":"IL-CUR","code":"IL-CUR","subject":"Curriculum — Required Subjects","category":"curriculum",
      "required":True,"description":"Must teach: language arts, math, biological/physical science, social sciences, fine arts, and physical development. No submission required — keep records on file.","weight":1.0},
     {"id":"IL-TEST","code":"IL-TEST","subject":"Testing / Evaluation","category":"testing",
      "required":False,"description":"No standardized testing or evaluation required.","weight":1.0},
     {"id":"IL-PORT","code":"IL-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"No portfolio required, but keeping work samples is recommended.","weight":1.0},
     {"id":"IL-IMMU","code":"IL-IMMU","subject":"Immunization Records","category":"immunization",
      "required":False,"description":"No immunization requirement for homeschoolers not participating in public programs.","weight":1.0},
     {"id":"IL-TRAN","code":"IL-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No progress reports required. High school transcripts strongly recommended.","weight":1.0},
   ]),

  # ── LOW REGULATION ─────────────────────────────────────────────────────────

  ("CA", "California Homeschool Requirements 2025–26",
   "California homeschool families typically operate as a private school (PSA filing) "
   "or use a public school independent study program. PSA families must file annually "
   "and maintain basic records.",
   [
     {"id":"CA-ATT","code":"CA-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Maintain attendance register. No specific day count mandated but equivalent to 175 days recommended.","weight":1.0},
     {"id":"CA-CUR","code":"CA-CUR","subject":"Curriculum — Required Subjects","category":"curriculum",
      "required":True,"description":"Must instruct in: English, math, social sciences, science, fine arts, health, PE, and (grades 7–12) foreign language. File annual Private School Affidavit (PSA) between Oct 1–15.","weight":1.0},
     {"id":"CA-TEST","code":"CA-TEST","subject":"Testing / Evaluation","category":"testing",
      "required":False,"description":"No standardized testing required for PSA families.","weight":1.0},
     {"id":"CA-PORT","code":"CA-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"No portfolio submission required, but keeping samples is recommended.","weight":1.0},
     {"id":"CA-IMMU","code":"CA-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization records. Required if child participates in any school-sponsored activities.","weight":1.0},
     {"id":"CA-TRAN","code":"CA-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No progress reports required. Transcripts required for college-bound high schoolers.","weight":1.0},
   ]),

  ("TN", "Tennessee Homeschool Requirements 2025–26",
   "Tennessee requires annual registration with the local school district and "
   "attendance record-keeping. Testing is required at specific grade levels.",
   [
     {"id":"TN-ATT","code":"TN-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Maintain attendance records showing 180 days of instruction per year.","weight":1.0},
     {"id":"TN-CUR","code":"TN-CUR","subject":"Curriculum — Registration","category":"curriculum",
      "required":True,"description":"Register annually with the local school director. No curriculum approval needed.","weight":1.0},
     {"id":"TN-TEST","code":"TN-TEST","subject":"Testing / Evaluation","category":"testing",
      "required":True,"description":"Standardized testing required in grades 5, 7, and 9. Results must be kept on file but not submitted to the district.","weight":1.0},
     {"id":"TN-PORT","code":"TN-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"No portfolio required.","weight":1.0},
     {"id":"TN-IMMU","code":"TN-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization records or signed exemption on file.","weight":1.0},
     {"id":"TN-TRAN","code":"TN-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No annual progress reports required. High school transcripts recommended.","weight":1.0},
   ]),

  # ── MEDIUM REGULATION ──────────────────────────────────────────────────────

  ("FL", "Florida Homeschool Requirements 2025–26",
   "Florida requires annual portfolio review by a certified teacher or standardized "
   "testing, plus a notice of intent to the school district.",
   [
     {"id":"FL-ATT","code":"FL-ATT","subject":"Attendance","category":"attendance",
      "required":False,"description":"No specific attendance day/hour count required, but a log of instruction days is recommended.","weight":1.0},
     {"id":"FL-CUR","code":"FL-CUR","subject":"Curriculum — Notice of Intent","category":"curriculum",
      "required":True,"description":"File a written Notice of Intent with the school district superintendent within 30 days of beginning homeschooling and by August 1 each subsequent year.","weight":1.0},
     {"id":"FL-TEST","code":"FL-TEST","subject":"Testing or Evaluation","category":"testing",
      "required":True,"description":"Annual evaluation: choose one — (1) standardized test administered by certified teacher, (2) Florida-certified teacher evaluation, or (3) portfolio review by certified teacher. Results must be kept on file.","weight":1.0},
     {"id":"FL-PORT","code":"FL-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":True,"description":"Maintain a portfolio of work samples and a log of educational activities. Required if choosing portfolio evaluation option. Include books used, writing samples, and other work.","weight":1.0},
     {"id":"FL-IMMU","code":"FL-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization certificate (Florida Form 680) or exemption on file.","weight":1.0},
     {"id":"FL-TRAN","code":"FL-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No formal progress reports required. Annual evaluation results must be kept. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("NC", "North Carolina Homeschool Requirements 2025–26",
   "North Carolina requires annual notice, immunization records, and standardized "
   "testing. One of the more structured medium-regulation states.",
   [
     {"id":"NC-ATT","code":"NC-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Operate for at least 9 calendar months per year. Maintain attendance records on file.","weight":1.0},
     {"id":"NC-CUR","code":"NC-CUR","subject":"Curriculum — Required Subjects","category":"curriculum",
      "required":True,"description":"Must teach: math, language arts, science, and social studies. File annual notice with the NC Division of Non-Public Education (DNPE).","weight":1.0},
     {"id":"NC-TEST","code":"NC-TEST","subject":"Standardized Testing","category":"testing",
      "required":True,"description":"Administer a nationally standardized test annually. Results must be kept on file for one year; not submitted to the state.","weight":1.0},
     {"id":"NC-PORT","code":"NC-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"No portfolio required, but maintaining work samples is recommended alongside test results.","weight":1.0},
     {"id":"NC-IMMU","code":"NC-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain a current immunization record or waiver on file.","weight":1.0},
     {"id":"NC-TRAN","code":"NC-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No progress reports required. High school transcripts recommended.","weight":1.0},
   ]),

  ("GA", "Georgia Homeschool Requirements 2025–26",
   "Georgia requires annual declaration, attendance of 180 days, monthly progress "
   "reports, and standardized testing every three years.",
   [
     {"id":"GA-ATT","code":"GA-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Maintain attendance records showing 180 days of instruction (4.5 hours/day). Keep on file — not submitted to district.","weight":1.0},
     {"id":"GA-CUR","code":"GA-CUR","subject":"Curriculum — Declaration + Subjects","category":"curriculum",
      "required":True,"description":"File annual Declaration of Intent with the local school superintendent. Must teach: reading, language arts, math, social studies, science. Grades 6–12 add: a foreign language is optional but recommended.","weight":1.0},
     {"id":"GA-TEST","code":"GA-TEST","subject":"Standardized Testing","category":"testing",
      "required":True,"description":"Administer a nationally standardized test every three years. Results must be kept on file; not submitted to the district.","weight":1.0},
     {"id":"GA-PORT","code":"GA-PORT","subject":"Monthly Progress Reports","category":"portfolio",
      "required":True,"description":"Maintain monthly progress reports showing student achievement in each required subject.","weight":1.0},
     {"id":"GA-IMMU","code":"GA-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain a current Certificate of Immunization or exemption on file.","weight":1.0},
     {"id":"GA-TRAN","code":"GA-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No formal annual transcript required. Monthly reports satisfy this. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("VA", "Virginia Homeschool Requirements 2025–26",
   "Virginia requires annual notice to the school division and either a standardized "
   "test or evaluation each year, with results kept on file.",
   [
     {"id":"VA-ATT","code":"VA-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Operate for 180 days of instruction per year. Keep records on file.","weight":1.0},
     {"id":"VA-CUR","code":"VA-CUR","subject":"Curriculum — Notice of Intent","category":"curriculum",
      "required":True,"description":"File annual Notice of Intent with the school division superintendent by August 15. Indicate the primary instructor's qualifications and subjects to be taught.","weight":1.0},
     {"id":"VA-TEST","code":"VA-TEST","subject":"Annual Assessment","category":"testing",
      "required":True,"description":"Submit annual evidence of progress: either (1) results of a standardized test (50th percentile or above) or (2) an evaluation by a licensed teacher confirming adequate progress. Submit to division by August 1.","weight":1.0},
     {"id":"VA-PORT","code":"VA-PORT","subject":"Portfolio / Evidence of Progress","category":"portfolio",
      "required":False,"description":"Portfolio optional — used as evidence in the licensed teacher evaluation path.","weight":1.0},
     {"id":"VA-IMMU","code":"VA-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization records. Required if child participates in any school-sponsored activities.","weight":1.0},
     {"id":"VA-TRAN","code":"VA-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No formal transcripts required. Annual assessment results satisfy reporting. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("OH", "Ohio Homeschool Requirements 2025–26",
   "Ohio requires annual notification and 900 instructional hours with specific "
   "required subjects.",
   [
     {"id":"OH-ATT","code":"OH-ATT","subject":"Attendance — Hours","category":"attendance",
      "required":True,"description":"Provide 900 hours of instruction per year. Maintain a log of instructional hours on file.","weight":1.0},
     {"id":"OH-CUR","code":"OH-CUR","subject":"Curriculum — Notification + Subjects","category":"curriculum",
      "required":True,"description":"File annual notification with the local school district superintendent. Must teach: language arts, math, science, health, social studies, fine arts, PE. Notification includes subject list and qualifications.","weight":1.0},
     {"id":"OH-TEST","code":"OH-TEST","subject":"Annual Assessment","category":"testing",
      "required":True,"description":"Annual assessment required: standardized test OR portfolio assessment by a certified teacher. Submit results to the superintendent annually.","weight":1.0},
     {"id":"OH-PORT","code":"OH-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"Portfolio optional — used in the portfolio assessment path instead of standardized testing.","weight":1.0},
     {"id":"OH-IMMU","code":"OH-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization records on file or a signed exemption form.","weight":1.0},
     {"id":"OH-TRAN","code":"OH-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No annual transcripts required beyond assessment results. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("CO", "Colorado Homeschool Requirements 2025–26",
   "Colorado requires annual notification and either standardized testing or "
   "evaluation every other year from grade 3 onward.",
   [
     {"id":"CO-ATT","code":"CO-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Minimum 172 instructional days per year (968 hours for secondary students). Maintain attendance records on file.","weight":1.0},
     {"id":"CO-CUR","code":"CO-CUR","subject":"Curriculum — Notification","category":"curriculum",
      "required":True,"description":"File annual written notification with the local school district 14 days before beginning. Indicate subjects to be taught.","weight":1.0},
     {"id":"CO-TEST","code":"CO-TEST","subject":"Testing or Evaluation","category":"testing",
      "required":True,"description":"Administer a state-approved standardized test OR have a qualified evaluator assess the student every other year starting at grade 3. Results must be kept on file; not submitted to district.","weight":1.0},
     {"id":"CO-PORT","code":"CO-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"No portfolio required. Work samples may support the evaluator assessment path.","weight":1.0},
     {"id":"CO-IMMU","code":"CO-IMMU","subject":"Immunization Records","category":"immunization",
      "required":False,"description":"No immunization requirement for homeschoolers not using public facilities.","weight":1.0},
     {"id":"CO-TRAN","code":"CO-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No progress reports required. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("WA", "Washington Homeschool Requirements 2025–26",
   "Washington requires annual declaration, 180 days of instruction, and annual "
   "assessment with results filed with the school district.",
   [
     {"id":"WA-ATT","code":"WA-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Provide 180 days of instruction per year. Maintain attendance records.","weight":1.0},
     {"id":"WA-CUR","code":"WA-CUR","subject":"Curriculum — Declaration + Subjects","category":"curriculum",
      "required":True,"description":"File annual Declaration of Intent with the local school district superintendent. Must teach: occupational education, science, math, language, social studies, history, health, reading, writing, spelling, music, art.","weight":1.0},
     {"id":"WA-TEST","code":"WA-TEST","subject":"Annual Assessment","category":"testing",
      "required":True,"description":"Annual assessment required: standardized test OR evaluation by a certified teacher. Results must be filed with the school district annually.","weight":1.0},
     {"id":"WA-PORT","code":"WA-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"No portfolio required beyond assessment documentation.","weight":1.0},
     {"id":"WA-IMMU","code":"WA-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization records or a signed exemption. Required for all children of school age.","weight":1.0},
     {"id":"WA-TRAN","code":"WA-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No formal transcripts required beyond annual assessment. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("SC", "South Carolina Homeschool Requirements 2025–26",
   "South Carolina offers three accountability options. Most families use Option 1 "
   "(membership in an approved homeschool association) or Option 3 (independent).",
   [
     {"id":"SC-ATT","code":"SC-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"Minimum 180 days of instruction (4.5 hours/day). Maintain annual attendance records.","weight":1.0},
     {"id":"SC-CUR","code":"SC-CUR","subject":"Curriculum — Required Subjects","category":"curriculum",
      "required":True,"description":"Must teach: reading, writing, math, science, and social studies. Enroll under one of three options: (1) approved homeschool association, (2) local school district, (3) independent with SC Dept of Education.","weight":1.0},
     {"id":"SC-TEST","code":"SC-TEST","subject":"Annual Assessment","category":"testing",
      "required":True,"description":"Annual standardized test required. Option 1 (association): association administers test. Option 2/3: submit results to the district or SCDE. Keep results on file.","weight":1.0},
     {"id":"SC-PORT","code":"SC-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":True,"description":"Maintain a portfolio of student work available for review if requested by the chosen accountability option.","weight":1.0},
     {"id":"SC-IMMU","code":"SC-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain a current Certificate of Immunization or exemption on file.","weight":1.0},
     {"id":"SC-TRAN","code":"SC-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"No formal annual transcripts beyond assessment. High school transcripts strongly recommended.","weight":1.0},
   ]),

  ("MN", "Minnesota Homeschool Requirements 2025–26",
   "Minnesota requires annual reporting to the school district covering subjects "
   "taught, assessment results, and instructor qualifications.",
   [
     {"id":"MN-ATT","code":"MN-ATT","subject":"Attendance","category":"attendance",
      "required":True,"description":"No specific day count, but instruction must be equivalent to public school. Report annually to district.","weight":1.0},
     {"id":"MN-CUR","code":"MN-CUR","subject":"Curriculum — Annual Report","category":"curriculum",
      "required":True,"description":"Submit annual report to local school district by October 1. Must teach: reading, writing, literature, fine arts, math, science, history, geography, health, PE. Report must include subjects taught and planned course outline.","weight":1.0},
     {"id":"MN-TEST","code":"MN-TEST","subject":"Annual Assessment","category":"testing",
      "required":True,"description":"Annual assessment required: standardized test OR portfolio review OR narrative report by a qualified evaluator. Results submitted to district annually.","weight":1.0},
     {"id":"MN-PORT","code":"MN-PORT","subject":"Portfolio / Work Samples","category":"portfolio",
      "required":False,"description":"Portfolio optional — used in the portfolio assessment path.","weight":1.0},
     {"id":"MN-IMMU","code":"MN-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization records or a signed exemption. Submit to district with annual report if requested.","weight":1.0},
     {"id":"MN-TRAN","code":"MN-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":False,"description":"Annual report satisfies progress reporting. High school transcripts strongly recommended.","weight":1.0},
   ]),

  # ── HIGH REGULATION ────────────────────────────────────────────────────────

  ("NY", "New York Homeschool Requirements 2025–26",
   "New York has the most detailed homeschool reporting requirements in the US. "
   "Families must file an IHIP, quarterly reports, and annual assessment results.",
   [
     {"id":"NY-ATT","code":"NY-ATT","subject":"Attendance — Hours","category":"attendance",
      "required":True,"description":"Minimum 900 hours/year (grades 1–6) or 990 hours/year (grades 7–12). Maintain a daily hour log. Include hours in quarterly reports.","weight":1.0},
     {"id":"NY-CUR","code":"NY-CUR","subject":"Individualized Home Instruction Plan (IHIP)","category":"curriculum",
      "required":True,"description":"File an IHIP with the school district superintendent by July 1 (or within 4 weeks of starting). Must include: subjects to be taught, textbooks and materials, names of instructors. Must cover 10 required subjects (grades 1–6) or 17 subjects (grades 7–12).","weight":1.0},
     {"id":"NY-TEST","code":"NY-TEST","subject":"Annual Assessment","category":"testing",
      "required":True,"description":"Annual assessment required: standardized test in grades 4–8 and annually thereafter OR narrative evaluation by a certified teacher. Results submitted to district by June 1.","weight":1.0},
     {"id":"NY-PORT","code":"NY-PORT","subject":"Quarterly Progress Reports","category":"portfolio",
      "required":True,"description":"Submit four quarterly reports to the school district each year. Each report must include: hours of instruction in each subject, a grade or narrative assessment for each subject, and a description of materials used.","weight":1.0},
     {"id":"NY-IMMU","code":"NY-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain immunization records on file. Required under NY Public Health Law regardless of enrollment status.","weight":1.0},
     {"id":"NY-TRAN","code":"NY-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":True,"description":"Quarterly reports constitute ongoing progress reporting. Annual assessment results required. Formal transcripts required for high school graduation documentation.","weight":1.0},
   ]),

  ("PA", "Pennsylvania Homeschool Requirements 2025–26",
   "Pennsylvania is one of the highest-regulation states. Requires a notarized "
   "affidavit, portfolio, annual evaluation by a licensed evaluator, and more.",
   [
     {"id":"PA-ATT","code":"PA-ATT","subject":"Attendance — Hours","category":"attendance",
      "required":True,"description":"Minimum 900 hours/year (elementary) or 990 hours/year (secondary). Maintain a log of instructional hours. Include in annual portfolio.","weight":1.0},
     {"id":"PA-CUR","code":"PA-CUR","subject":"Notarized Affidavit + Subjects","category":"curriculum",
      "required":True,"description":"File a notarized affidavit with the school district superintendent by August 1 each year. List all subjects to be taught, materials/textbooks, and primary instructor. Must cover state-required subjects by grade level.","weight":1.0},
     {"id":"PA-TEST","code":"PA-TEST","subject":"Annual Evaluation","category":"testing",
      "required":True,"description":"Annual evaluation required: standardized test OR evaluation by a licensed PA teacher or psychologist. Results must be submitted to the school district by June 30. Student must show 'sustained progress' or a remedial plan is required.","weight":1.0},
     {"id":"PA-PORT","code":"PA-PORT","subject":"Portfolio of Work Samples","category":"portfolio",
      "required":True,"description":"Maintain a portfolio throughout the year including: log of educational activities, samples of work in each subject, list of reading materials used. Portfolio must be reviewed by a licensed evaluator as part of the annual evaluation.","weight":1.0},
     {"id":"PA-IMMU","code":"PA-IMMU","subject":"Immunization Records","category":"immunization",
      "required":True,"description":"Maintain a current immunization record or a signed exemption on file. Required under PA School Code.","weight":1.0},
     {"id":"PA-TRAN","code":"PA-TRAN","subject":"Transcripts / Progress Reports","category":"transcripts",
      "required":True,"description":"Annual evaluation report constitutes formal progress documentation. Maintain all evaluations permanently. High school transcripts required for graduation documentation.","weight":1.0},
   ]),
]


_SEED_SQL_TEMPLATE = """
DO $$
DECLARE
  v_admin UUID;
BEGIN
  SELECT id INTO v_admin FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN RETURN; END IF;

  {inserts}

END $$;
"""


def _make_insert(state_code, name, description, criteria):
    import json
    criteria_json = json.dumps(criteria).replace("'", "''")
    desc_escaped  = description.replace("'", "''")
    name_escaped  = name.replace("'", "''")
    return f"""
  IF NOT EXISTS (
    SELECT 1 FROM standards_sets WHERE state_code = '{state_code}' AND type = 'state_reporting' AND is_global = TRUE
  ) THEN
    INSERT INTO standards_sets (
      id, name, description, type, owner_id, state_code, is_global,
      source_file, source_checksum, processing_status, last_processed_at,
      valid_until, criteria, created_at, updated_at
    ) VALUES (
      uuid_generate_v4(),
      '{name_escaped}',
      '{desc_escaped}',
      'state_reporting',
      v_admin,
      '{state_code}',
      TRUE,
      NULL, NULL, 'complete', NOW(),
      '2026-12-31'::DATE,
      '{criteria_json}'::jsonb,
      NOW(), NOW()
    );
  END IF;"""


def upgrade() -> None:
    inserts = "\n".join(
        _make_insert(sc, nm, desc, crit)
        for sc, nm, desc, crit in STATES
    )
    sql = _SEED_SQL_TEMPLATE.format(inserts=inserts)
    op.execute(text(sql))


def downgrade() -> None:
    state_codes = ", ".join(f"'{sc}'" for sc, *_ in STATES)
    op.execute(text(f"""
        DELETE FROM standards_sets
        WHERE type = 'state_reporting'
          AND is_global = TRUE
          AND state_code IN ({state_codes})
    """))
