# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/export_service.py -- generate_pdf() and generate_csv(),
the last untested piece of the standards/rubrics export pipeline (X5 in
STANDARDS_RUBRICS_TEST_PLAN.md flagged the *data* feeding these as now
provably correct after the compute_standards_coverage() fix; the
reportlab rendering itself was still untested until this file).

Real bugs found and fixed while writing these tests, confirmed by
extracting actual rendered text with pypdf (not just "did it raise"):

  1. _build_homeschool_portfolio's Standards Coverage table read
     v["criterion"].get("name", "") -- but a criterion parsed from a
     teacher's uploaded standards document (routes/standards.py::
     CriterionIn) never HAS a "name" field, only "description". Every
     real-world homeschool portfolio PDF rendered a completely blank
     Criterion column -- the one piece of information the table exists to
     show. Fixed with the same name-or-description fallback used
     elsewhere this criterion dict flows through.

  2. routes/export.py's sess_dicts never included duration_minutes (no
     such column exists on learning_sessions), so
     _build_student_progress's "Recent Sessions" table always rendered
     "<blank> min" in the Duration column for every row. Fixed by
     deriving it from completed_at - created_at when both exist.

Strategy: generate real PDF bytes via the real reportlab pipeline (no
mocking -- there's nothing to mock, generate_pdf/generate_csv take
already-assembled data and return bytes/a string with no DB access), then
extract actual text with pypdf and assert on it. A test that only checks
"it didn't raise and returned nonzero bytes" would have missed both bugs
above.
"""

from __future__ import annotations

import io

import pytest

pytest.importorskip("reportlab")
pytest.importorskip("pypdf")

from services.export_service import generate_pdf, generate_csv


def _pdf_text(pdf_bytes: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() for page in reader.pages)


# ===========================================================================
# generate_pdf — activity_log
# ===========================================================================

def test_activity_log_pdf_renders_real_activity_rows():
    data = {
        "report_title": "Activity Log",
        "activities": [
            {"created_at": "2026-09-01T08:00:00", "title": "Creek Habitat Study",
             "subject": "Science", "grade_level": 6, "estimated_duration_minutes": 45, "status": "completed"},
            {"created_at": "2026-09-05T08:00:00", "title": "Fraction Practice",
             "subject": "Math", "grade_level": 4, "estimated_duration_minutes": 30, "status": "in_progress"},
        ],
    }
    pdf_bytes = generate_pdf("activity_log", data)
    assert pdf_bytes[:4] == b"%PDF"
    text = _pdf_text(pdf_bytes)
    assert "Creek Habitat Study" in text
    assert "Fraction Practice" in text
    assert "2026-09-01" in text
    assert "45 min" in text


def test_activity_log_pdf_with_no_activities_says_so_not_an_empty_table():
    data = {"report_title": "Activity Log", "activities": []}
    text = _pdf_text(generate_pdf("activity_log", data))
    assert "No activities recorded" in text


def test_activity_log_pdf_truncates_long_titles_without_crashing():
    data = {"report_title": "Activity Log", "activities": [
        {"created_at": "2026-09-01T08:00:00", "title": "X" * 200, "subject": "Science",
         "grade_level": 6, "estimated_duration_minutes": 45, "status": "completed"},
    ]}
    pdf_bytes = generate_pdf("activity_log", data)
    assert pdf_bytes[:4] == b"%PDF"  # doesn't crash on an oversized field


# ===========================================================================
# generate_pdf — student_progress
# ===========================================================================

def test_student_progress_pdf_renders_stats_and_sessions_with_real_duration():
    data = {
        "report_title": "Student Progress",
        "student_name": "Alex Johnson",
        "sessions_completed": 3, "activities_count": 5, "competencies_count": 2,
        "recent_sessions": [
            {"created_at": "2026-09-01T10:00:00", "title": "Creek Habitat Study",
             "status": "completed", "duration_minutes": 45},
        ],
    }
    text = _pdf_text(generate_pdf("student_progress", data))
    assert "Alex Johnson" in text
    assert "Creek Habitat Study" in text
    # Regression guard for bug #2 above -- must be a real number, not blank.
    assert "45 min" in text
    assert " min" in text and "  min" not in text  # no leading-space "blank" artifact


def test_student_progress_pdf_missing_duration_degrades_to_blank_not_crash():
    """When a session genuinely has no completed_at (still in progress),
    routes/export.py's derivation leaves duration_minutes as "" -- confirm
    the PDF renders that gracefully rather than raising on a missing key."""
    data = {
        "report_title": "Student Progress", "student_name": "Alex Johnson",
        "sessions_completed": 0, "activities_count": 1, "competencies_count": 0,
        "recent_sessions": [
            {"created_at": "2026-09-01T10:00:00", "title": "In Progress Activity", "status": "in_progress"},
        ],
    }
    pdf_bytes = generate_pdf("student_progress", data)
    assert pdf_bytes[:4] == b"%PDF"


def test_student_progress_pdf_no_recent_sessions_omits_the_table_not_crash():
    data = {"report_title": "Student Progress", "student_name": "Alex Johnson",
            "sessions_completed": 0, "activities_count": 0, "competencies_count": 0}
    pdf_bytes = generate_pdf("student_progress", data)
    assert pdf_bytes[:4] == b"%PDF"
    text = _pdf_text(pdf_bytes)
    assert "Recent Sessions" not in text  # data.get("recent_sessions", []) is falsy -> section skipped


# ===========================================================================
# generate_pdf — homeschool_portfolio (the compliance-facing one)
# ===========================================================================

def _portfolio_data(**overrides):
    base = {
        "report_title": "Homeschool Portfolio",
        "child_name": "Alex Johnson", "year": 2026, "state_code": "WA",
        "days_logged": 120, "days_required": 180, "subjects": ["Science", "Math"],
        "standards_coverage": {
            "criteria_met": 1, "total_criteria": 2, "percent_complete": 50,
            "coverage": {
                "eco-1": {
                    "criterion": {"id": "eco-1", "category": "Life Science", "required": True,
                                  "description": "Analyzes interactions among biotic and abiotic factors"},
                    "times_addressed": 1, "best_level": "full", "met": True,
                },
                "eco-2": {
                    "criterion": {"id": "eco-2", "category": "Life Science", "required": True,
                                  "description": "Explains energy flow through an ecosystem"},
                    "times_addressed": 0, "best_level": None, "met": False,
                },
            },
        },
        "activities": [],
    }
    base.update(overrides)
    return base


def test_homeschool_portfolio_pdf_renders_real_criterion_text_not_blank():
    """Regression guard for bug #1 above: the Criterion column must show
    the actual standard's text (falling back to description since real
    uploaded criteria have no "name" field), not an empty cell."""
    text = _pdf_text(generate_pdf("homeschool_portfolio", _portfolio_data()))
    # Table-cell truncation is [:45] -- assert the visible, truncated prefix
    # actually appears, proving the cell isn't blank.
    assert "Analyzes interactions among biotic and abioti" in text
    assert "Explains energy flow through an ecosystem" in text
    assert "Life Science" in text
    assert "1 of 2 required criteria addressed (50%)" in text


def test_homeschool_portfolio_pdf_shows_met_and_not_met_distinctly():
    text = _pdf_text(generate_pdf("homeschool_portfolio", _portfolio_data()))
    assert "✓ Met" in text
    # The ○ (U+25CB) marker doesn't survive pypdf's text extraction intact
    # in this font (comes back as a different glyph) -- assert on the
    # unambiguous "Not yet" text rather than pin an exact bullet character.
    assert "Not yet" in text


def test_homeschool_portfolio_pdf_with_no_coverage_data_omits_that_section():
    """standards_coverage is None when no standards_set_id was requested --
    confirm the section is skipped cleanly, not rendered with garbage."""
    data = _portfolio_data(standards_coverage=None)
    text = _pdf_text(generate_pdf("homeschool_portfolio", data))
    assert "Standards Coverage" not in text
    assert "Portfolio: Alex Johnson" in text  # rest of the portfolio still renders


def test_homeschool_portfolio_pdf_includes_activity_log_section():
    """_build_homeschool_portfolio always appends the activity log too --
    confirm both sections coexist in one document."""
    data = _portfolio_data(activities=[
        {"created_at": "2026-09-01T08:00:00", "title": "Creek Habitat Study", "subject": "Science",
         "grade_level": 6, "estimated_duration_minutes": 45, "status": "completed"},
    ])
    text = _pdf_text(generate_pdf("homeschool_portfolio", data))
    assert "Standards Coverage" in text
    assert "Activity Log" in text
    assert "Creek Habitat Study" in text


def test_homeschool_portfolio_pdf_handles_unicode_child_name_and_criteria():
    """A real family's name or a real standard's description can contain
    non-ASCII characters -- confirm reportlab doesn't choke on them."""
    data = _portfolio_data(child_name="José Muñoz-Peña")
    data["standards_coverage"]["coverage"]["eco-1"]["criterion"]["description"] = "Évalue les interactions écologiques"
    pdf_bytes = generate_pdf("homeschool_portfolio", data)
    assert pdf_bytes[:4] == b"%PDF"
    text = _pdf_text(pdf_bytes)
    assert "José" in text or "Jos" in text  # font glyph coverage can vary; don't over-assert exact accents
    assert "cologiques" in text  # tail of the unicode description, robust to accent-rendering differences


# ===========================================================================
# generate_pdf — unknown template / missing reportlab
# ===========================================================================

def test_unknown_template_renders_a_message_not_a_crash():
    pdf_bytes = generate_pdf("not_a_real_template", {"report_title": "?"})
    assert pdf_bytes[:4] == b"%PDF"
    text = _pdf_text(pdf_bytes)
    assert "Unknown template" in text


# ===========================================================================
# generate_csv
# ===========================================================================

def test_generate_csv_activity_log_column_order_and_values():
    rows = [
        {"created_at": "2026-09-01", "title": "Creek Study", "subject": "Science",
         "grade_level": 6, "estimated_duration_minutes": 45, "status": "completed",
         "location_name": "Discovery Park", "bloom_level": "analyze"},
    ]
    csv_str = generate_csv("activity_log", rows)
    lines = csv_str.strip().split("\n")
    assert lines[0] == "created_at,title,subject,grade_level,estimated_duration_minutes,status,location_name,bloom_level"
    assert "Creek Study" in lines[1]


def test_generate_csv_standards_coverage_column_order():
    rows = [
        {"criterion_id": "c1", "name": "Ecosystem interactions", "category": "Life Science",
         "required": True, "times_addressed": 2, "best_level": "full", "met": True},
    ]
    csv_str = generate_csv("standards_coverage", rows)
    header = csv_str.strip().split("\n")[0]
    assert header == "criterion_id,name,category,required,times_addressed,best_level,met"


def test_generate_csv_empty_rows_returns_empty_string_not_a_header_only_file():
    assert generate_csv("activity_log", []) == ""


def test_generate_csv_unknown_template_falls_back_to_row_key_order():
    rows = [{"z_col": 1, "a_col": 2}]
    csv_str = generate_csv("some_unrecognized_template", rows)
    header = csv_str.strip().split("\n")[0]
    assert header == "z_col,a_col"  # falls back to the row's own key order, not alphabetized or dropped


def test_generate_csv_extra_headers_appended_once():
    rows = [{"a": 1}]
    csv_str = generate_csv("activity_log", rows, extra_headers=["notes", "a"])
    header = csv_str.strip().split("\n")[0].split(",")
    assert header.count("a") == 1  # "a" already present from the row's own keys, not duplicated
    assert "notes" in header


def test_generate_csv_row_keys_outside_the_known_column_order_are_appended_not_dropped():
    """all_keys = column_order + any of the first row's own keys not
    already in it -- an unrecognized field isn't silently discarded, it
    becomes an extra trailing column. (extrasaction="ignore" on the
    DictWriter guards a different case: a row missing some of that
    computed fieldname list, not an unknown key -- which never happens
    here since fieldnames is always derived FROM row[0]'s own keys.)"""
    rows = [{"created_at": "2026-09-01", "title": "x", "unexpected_field": "shows up as an extra column"}]
    csv_str = generate_csv("activity_log", rows)
    header = csv_str.strip().split("\n")[0]
    assert header.endswith(",unexpected_field")
    assert "shows up as an extra column" in csv_str


def test_generate_csv_not_met_status_round_trips_in_export():
    """The specific field this whole feature exists for -- a criterion a
    teacher explicitly marked not_met must appear as such in the exported
    CSV, not silently as "met" or blank."""
    rows = [
        {"criterion_id": "c1", "name": "Ecosystem interactions", "category": "Life Science",
         "required": True, "times_addressed": 1, "best_level": "not_met", "met": False},
    ]
    csv_str = generate_csv("standards_coverage", rows)
    assert "not_met" in csv_str
    assert ",False" in csv_str or "False" in csv_str.split("\n")[1]
