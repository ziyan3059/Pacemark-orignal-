import json
import sys
import pymupdf


def safe_str(val: object, fallback: str = "") -> str:
    if val is None:
        return fallback
    return str(val).strip()


def format_seconds(sec: float) -> str:
    s = max(0, int(round(sec)))
    m, rem = divmod(s, 60)
    if m == 0:
        return f"{rem}s"
    return f"{m}m {rem:02d}s"


def build_pdf_report(payload: dict) -> bytes:
    doc = pymupdf.open()
    page_w = 595.0
    page_h = 842.0
    margin = 42.0
    content_w = page_w - 2 * margin

    page = doc.new_page(width=page_w, height=page_h)

    def ensure_space(current_y: float, needed: float) -> tuple[pymupdf.Page, float]:
        if current_y + needed <= page_h - margin:
            return page, current_y
        new_p = doc.new_page(width=page_w, height=page_h)
        return new_p, margin

    # Header banner (#2C3E50 deep slate)
    header_rect = pymupdf.Rect(margin, margin, page_w - margin, margin + 64)
    page.draw_rect(header_rect, color=None, fill=(0.173, 0.243, 0.314))
    page.insert_text(
        (margin + 16, margin + 26),
        "Performance Analysis Report",
        fontsize=16,
        fontname="helv",
        color=(1, 1, 1),
    )
    paper_title = safe_str(payload.get("paperTitle"), "Exam Paper")
    username = safe_str(payload.get("username"), "Student")
    completed_at = safe_str(payload.get("completedAt"), "")
    subtitle = f"{paper_title}  |  Candidate: {username}"
    if completed_at:
        subtitle += f"  |  {completed_at[:16].replace('T', ' ')}"
    page.insert_text(
        (margin + 16, margin + 47),
        subtitle[:96],
        fontsize=9.5,
        fontname="helv",
        color=(0.86, 0.90, 0.94),
    )

    y = margin + 84

    # Overall summary row
    score = int(payload.get("scorePercent", 0))
    avg_time = safe_str(payload.get("avgTimeLabel"), "0s")
    answered = int(payload.get("questionsAnswered", 0))
    total_q = int(payload.get("totalQuestions", 0))
    summary = safe_str(payload.get("summary"), "")

    page.insert_text(
        (margin, y),
        f"Overall Score: {score}%    |    Avg Time/Q: {avg_time}    |    Answered: {answered}/{total_q}",
        fontsize=12,
        fontname="helv",
        color=(0.06, 0.09, 0.16),
    )
    y += 18
    if summary:
        tb_rect = pymupdf.Rect(margin, y, page_w - margin, y + 36)
        page.insert_textbox(
            tb_rect,
            summary,
            fontsize=9.5,
            fontname="helv",
            color=(0.24, 0.29, 0.36),
        )
        y += 38

    # Priority Weakness Ranking & Visual Bar Chart
    page, y = ensure_space(page, y, 160)
    page.draw_line((margin, y), (page_w - margin, y), color=(0.82, 0.85, 0.89), width=0.8)
    y += 18
    page.insert_text(
        (margin, y),
        "Priority Weakness Ranking (60% Time Ratio + 40% Accuracy Deficit)",
        fontsize=11.5,
        fontname="helv",
        color=(0.06, 0.09, 0.16),
    )
    y += 16

    topics = payload.get("topicBreakdown") or []
    if not isinstance(topics, list) or len(topics) == 0:
        ts = payload.get("topicScores") or {}
        topics = [
            {"topic": "Data Structures", "scorePercent": ts.get("dataStructures", 58), "weaknessIndex": 0.9, "status": "Priority Revision", "action": "Revise core algorithms and data structures."},
            {"topic": "Computer Systems", "scorePercent": ts.get("computerSystems", 74), "weaknessIndex": 0.65, "status": "Needs Pacing", "action": "Practice timed architecture questions."},
            {"topic": "Software Engineering", "scorePercent": ts.get("softwareEngineering", 91), "weaknessIndex": 0.35, "status": "Strong", "action": "Maintain current pace."},
        ]

    bar_x = margin + 175
    bar_max_w = content_w - 255
    for idx, t in enumerate(topics, start=1):
        page, y = ensure_space(page, y, 42)
        t_name = safe_str(t.get("topic"), f"Topic {idx}")
        t_score = max(0, min(100, int(round(float(t.get("scorePercent", 0))))))
        t_weak = float(t.get("weaknessIndex", 0.5))
        t_status = safe_str(t.get("status"), "Needs Pacing")
        t_action = safe_str(t.get("action"), "")

        if "priority" in t_status.lower() or t_weak >= 0.85:
            bar_color = (0.86, 0.15, 0.15)
        elif "pacing" in t_status.lower() or t_weak >= 0.55:
            bar_color = (0.85, 0.47, 0.02)
        else:
            bar_color = (0.02, 0.59, 0.41)

        page.insert_text(
            (margin, y + 10),
            f"{idx}. {t_name[:24]}",
            fontsize=9.5,
            fontname="helv",
            color=(0.06, 0.09, 0.16),
        )

        # Track + Fill Bar
        track = pymupdf.Rect(bar_x, y + 2, bar_x + bar_max_w, y + 12)
        page.draw_rect(track, color=None, fill=(0.91, 0.93, 0.96))
        fill_w = max(4.0, bar_max_w * (t_score / 100.0))
        page.draw_rect(pymupdf.Rect(bar_x, y + 2, bar_x + fill_w, y + 12), color=None, fill=bar_color)

        page.insert_text(
            (bar_x + bar_max_w + 8, y + 10),
            f"{t_score}% ({t_status})",
            fontsize=8.5,
            fontname="helv",
            color=(0.18, 0.23, 0.30),
        )
        y += 17
        if t_action:
            page.insert_text(
                (margin + 12, y + 8),
                f"Action: {t_action[:95]}",
                fontsize=8.5,
                fontname="helv",
                color=(0.35, 0.40, 0.48),
            )
            y += 16
        else:
            y += 6

    # Per-Question Timing & Marking Breakdown
    q_logs = payload.get("questionLogs") or []
    if isinstance(q_logs, list) and len(q_logs) > 0:
        page, y = ensure_space(page, y, 70)
        y += 8
        page.draw_line((margin, y), (page_w - margin, y), color=(0.82, 0.85, 0.89), width=0.8)
        y += 18
        page.insert_text(
            (margin, y),
            "Per-Question Timing, Marks & Confidence Log",
            fontsize=11.5,
            fontname="helv",
            color=(0.06, 0.09, 0.16),
        )
        y += 16

        # Table header
        page.draw_rect(pymupdf.Rect(margin, y, page_w - margin, y + 18), color=None, fill=(0.94, 0.95, 0.97))
        page.insert_text((margin + 6, y + 12), "Question", fontsize=8.5, fontname="helv", color=(0.2, 0.25, 0.32))
        page.insert_text((margin + 175, y + 12), "Topic", fontsize=8.5, fontname="helv", color=(0.2, 0.25, 0.32))
        page.insert_text((margin + 320, y + 12), "Marks", fontsize=8.5, fontname="helv", color=(0.2, 0.25, 0.32))
        page.insert_text((margin + 375, y + 12), "Time / Target", fontsize=8.5, fontname="helv", color=(0.2, 0.25, 0.32))
        page.insert_text((margin + 462, y + 12), "Conf.", fontsize=8.5, fontname="helv", color=(0.2, 0.25, 0.32))
        y += 22

        for idx, q in enumerate(q_logs, start=1):
            page, y = ensure_space(page, y, 22)
            q_num = safe_str(q.get("questionNumber"), f"Q{idx}")
            prompt_snip = safe_str(q.get("prompt"), "")[:28]
            topic_snip = safe_str(q.get("topicCategory"), "General")[:22]
            m_aw = int(q.get("marksAwarded", 0))
            m_tot = int(q.get("totalMarks", 1))
            t_spent = float(q.get("timeSpentSeconds", 0))
            t_rec = float(q.get("recommendedTimeSeconds", 60))
            conf = int(q.get("confidence", 3))

            page.insert_text((margin + 6, y + 11), f"{q_num}: {prompt_snip}", fontsize=8.2, fontname="helv", color=(0.08, 0.1, 0.15))
            page.insert_text((margin + 175, y + 11), topic_snip, fontsize=8.2, fontname="helv", color=(0.25, 0.3, 0.38))
            page.insert_text((margin + 320, y + 11), f"{m_aw}/{m_tot}", fontsize=8.2, fontname="helv", color=(0.08, 0.1, 0.15))
            page.insert_text((margin + 375, y + 11), f"{format_seconds(t_spent)} / {format_seconds(t_rec)}", fontsize=8.2, fontname="helv", color=(0.08, 0.1, 0.15))
            page.insert_text((margin + 465, y + 11), f"{conf}/5", fontsize=8.2, fontname="helv", color=(0.08, 0.1, 0.15))
            page.draw_line((margin, y + 17), (page_w - margin, y + 17), color=(0.91, 0.93, 0.95), width=0.5)
            y += 19

    pdf_bytes = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return pdf_bytes


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw or "{}")
    pdf_bytes = build_pdf_report(payload)
    sys.stdout.buffer.write(pdf_bytes)


if __name__ == "__main__":
    main()
