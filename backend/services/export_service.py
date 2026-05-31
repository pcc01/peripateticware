# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Export Service
==============
Generates PDF and CSV exports for all roles.

PDF templates (via reportlab):
  activity_log          — teacher offline activity pack
  student_progress      — parent/admin progress report
  homeschool_portfolio  — homeschool state reporting portfolio

CSV exports:
  activity_log          — flat activity log (date, subject, duration, standards)
  session_log           — all learning sessions for a student
  standards_coverage    — criteria coverage matrix

Public API:
  generate_pdf(template, data)   -> bytes
  generate_csv(template, rows)   -> str
"""

import csv
import io
import logging
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PDF Generation (reportlab)
# ---------------------------------------------------------------------------

def _get_canvas(buffer: io.BytesIO):
    """Return a reportlab canvas. Lazy import so missing reportlab doesn't break startup."""
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    return SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, getSampleStyleSheet, colors, LETTER


def _brand_color():
    from reportlab.lib import colors
    return colors.HexColor("#1b4332")   # Peripateticware forest green


def generate_pdf(template: str, data: dict) -> bytes:
    """
    Generate a PDF and return bytes.
    template: 'activity_log' | 'student_progress' | 'homeschool_portfolio'
    """
    buffer = io.BytesIO()
    try:
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HR, styles_fn, colors, LETTER = _get_canvas(buffer)
        doc = SimpleDocTemplate(buffer, pagesize=LETTER,
                                leftMargin=54, rightMargin=54,
                                topMargin=54, bottomMargin=54)
        styles = styles_fn()
        brand = _brand_color()

        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
        title_style = ParagraphStyle("PPWTitle", parent=styles["Title"],
                                     textColor=brand, fontSize=20, spaceAfter=6)
        h2_style = ParagraphStyle("PPWH2", parent=styles["Heading2"],
                                  textColor=brand, fontSize=13, spaceBefore=14, spaceAfter=4)
        normal = styles["Normal"]
        small = ParagraphStyle("Small", parent=normal, fontSize=8, textColor=colors.grey)

        story = []

        # ── Cover header ──
        story.append(Paragraph("Peripateticware", title_style))
        story.append(Paragraph(data.get("report_title", "Report"), h2_style))
        story.append(Paragraph(
            f"Generated {datetime.utcnow().strftime('%B %d, %Y')}",
            small,
        ))
        story.append(Spacer(1, 12))
        story.append(HR(500, 1, color=brand))
        story.append(Spacer(1, 12))

        if template == "activity_log":
            _build_activity_log(story, data, h2_style, normal, Table, TableStyle, colors, Spacer)

        elif template == "student_progress":
            _build_student_progress(story, data, h2_style, normal, Table, TableStyle, colors, Spacer, Paragraph, small)

        elif template == "homeschool_portfolio":
            _build_homeschool_portfolio(story, data, h2_style, normal, Table, TableStyle, colors, Spacer, Paragraph, small)

        else:
            story.append(Paragraph(f"Unknown template: {template}", normal))

        doc.build(story)
        return buffer.getvalue()

    except ImportError:
        logger.error("reportlab not installed — cannot generate PDF")
        raise RuntimeError("PDF generation requires reportlab. Add it to requirements.txt.")


def _table_style(colors):
    from reportlab.platypus import TableStyle
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _brand_color()),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 9),
        ("FONTSIZE",   (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fdf4")]),
        ("GRID",       (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ])


def _build_activity_log(story, data, h2, normal, Table, TableStyle, colors, Spacer):
    from reportlab.platypus import Paragraph
    story.append(Paragraph("Activity Log", h2))

    activities = data.get("activities", [])
    if not activities:
        story.append(Paragraph("No activities recorded.", normal))
        return

    headers = ["Date", "Title", "Subject", "Grade", "Duration", "Status"]
    rows = [headers] + [
        [
            a.get("created_at", "")[:10],
            a.get("title", "")[:40],
            a.get("subject", ""),
            str(a.get("grade_level", "")),
            f"{a.get('estimated_duration_minutes', '')} min",
            a.get("status", ""),
        ]
        for a in activities
    ]
    t = Table(rows, colWidths=[65, 170, 80, 40, 60, 65])
    t.setStyle(_table_style(colors))
    story.append(t)


def _build_student_progress(story, data, h2, normal, Table, TableStyle, colors, Spacer, Paragraph, small):
    story.append(Paragraph(f"Student: {data.get('student_name', 'Unknown')}", h2))

    # Summary stats
    stats = [
        ["Sessions completed", str(data.get("sessions_completed", 0))],
        ["Activities explored", str(data.get("activities_count", 0))],
        ["Competencies achieved", str(data.get("competencies_count", 0))],
    ]
    t = Table(stats, colWidths=[200, 100])
    t.setStyle(_table_style(colors))
    story.append(t)
    story.append(Spacer(1, 12))

    # Recent sessions
    sessions = data.get("recent_sessions", [])
    if sessions:
        story.append(Paragraph("Recent Sessions", h2))
        headers = ["Date", "Activity", "Status", "Duration"]
        rows = [headers] + [
            [s.get("created_at", "")[:10], s.get("title", "")[:45],
             s.get("status", ""), f"{s.get('duration_minutes', '')} min"]
            for s in sessions
        ]
        t = Table(rows, colWidths=[65, 220, 80, 65])
        t.setStyle(_table_style(colors))
        story.append(t)


def _build_homeschool_portfolio(story, data, h2, normal, Table, TableStyle, colors, Spacer, Paragraph, small):
    child_name = data.get("child_name", "Student")
    story.append(Paragraph(f"Portfolio: {child_name}", h2))
    story.append(Paragraph(
        f"Academic year: {data.get('year', datetime.utcnow().year)}  |  "
        f"State: {data.get('state_code', 'N/A')}",
        normal,
    ))
    story.append(Spacer(1, 10))

    # Days logged
    story.append(Paragraph("Learning Days Summary", h2))
    summary = [
        ["Total days logged", str(data.get("days_logged", 0))],
        ["Required days", str(data.get("days_required", 180))],
        ["Subjects covered", ", ".join(data.get("subjects", []))],
    ]
    t = Table(summary, colWidths=[200, 250])
    t.setStyle(_table_style(colors))
    story.append(t)
    story.append(Spacer(1, 12))

    # Standards coverage if provided
    coverage = data.get("standards_coverage")
    if coverage:
        story.append(Paragraph("Standards Coverage", h2))
        met = coverage.get("criteria_met", 0)
        total = coverage.get("total_criteria", 0)
        story.append(Paragraph(
            f"{met} of {total} required criteria addressed "
            f"({coverage.get('percent_complete', 0)}%)",
            normal,
        ))
        story.append(Spacer(1, 8))
        detail = coverage.get("coverage", {})
        headers = ["Criterion", "Category", "Status", "Times addressed"]
        rows = [headers] + [
            [
                v["criterion"].get("name", "")[:45],
                v["criterion"].get("category", ""),
                "✓ Met" if v["met"] else "○ Not yet",
                str(v["times_addressed"]),
            ]
            for v in detail.values()
        ]
        t = Table(rows, colWidths=[180, 110, 80, 90])
        t.setStyle(_table_style(colors))
        story.append(t)

    # Activity log
    _build_activity_log(story, data, h2, normal, Table, TableStyle, colors, Spacer)


# ---------------------------------------------------------------------------
# CSV Generation
# ---------------------------------------------------------------------------

def generate_csv(template: str, rows: list[dict], extra_headers: Optional[list] = None) -> str:
    """
    Generate a CSV string from a list of row dicts.
    template hint used for column ordering.
    """
    if not rows:
        return ""

    column_order = {
        "activity_log":   ["created_at", "title", "subject", "grade_level",
                           "estimated_duration_minutes", "status", "location_name", "bloom_level"],
        "session_log":    ["created_at", "title", "status", "completed_at",
                           "location_name", "activity_id"],
        "standards_coverage": ["criterion_id", "name", "category", "required",
                                "times_addressed", "best_level", "met"],
    }.get(template, [])

    all_keys = column_order + [k for k in rows[0].keys() if k not in column_order]
    if extra_headers:
        all_keys += [h for h in extra_headers if h not in all_keys]

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=all_keys, extrasaction="ignore",
                            lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()
