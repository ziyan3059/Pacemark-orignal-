import json
import os
import re
import statistics
import sys
import unicodedata
try:
    import pymupdf
except ImportError:
    pymupdf = None

# Ligature & whitespace normalization
LIGATURES = {
    "\ufb00": "ff",
    "\ufb01": "fi",
    "\ufb02": "fl",
    "\ufb03": "ffi",
    "\ufb04": "ffl",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u00a0": " ",
}

# Marks patterns: [2 Marks], [2], (3 marks), 2 marks at end of line
MARKS_BRACKET_RE = re.compile(
    r"(?:\[\s*(?:total\s*)?(\d{1,2})\s*(?:marks?|pts?|points?)?\s*\]|\(\s*(\d{1,2})\s*(?:marks?|pts?|points?)\s*\))\s*\.?$",
    re.IGNORECASE,
)
MARKS_INLINE_RE = re.compile(
    r"(?:\[\s*(\d{1,2})\s*(?:marks?|pts?|points?)?\s*\]|\(\s*(\d{1,2})\s*(?:marks?|pts?|points?)\s*\))",
    re.IGNORECASE,
)
TOTAL_MARKS_ONLY_RE = re.compile(
    r"^\[?\s*total(?:\s+marks)?\s*:?\s*\d{1,3}\s*(?:marks?)?\s*\]?$",
    re.IGNORECASE,
)

# Question anchors
TOP_Q_COMBINED_RE = re.compile(
    r"^(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,2})\s*(?:[\.\):]\s*|\s+)\(\s*([a-z])\s*\)(?:\s*\(\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*\))?\s*(.*)$",
    re.IGNORECASE,
)
TOP_Q_RE = re.compile(
    r"^(?:Q(?:uestion)?\s*\.?\s*(\d{1,2})|(\d{1,2})\s*[\.\):])\s*(.*)$",
    re.IGNORECASE,
)
BARE_NUM_ONLY_RE = re.compile(r"^(\d{1,2})$")
BARE_NUM_LINE_RE = re.compile(r"^(\d{1,2})\s+([A-Z\"'(\[].{3,})$")
SUB_Q_RE = re.compile(
    r"^(?:\(\s*([a-z])\s*\)|([a-z])\s*[\.\)])\s*(?:\(\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*\)\s*)?(.*)$"
)
ROMAN_PART_RE = re.compile(
    r"^(?:\(\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*\)|(i{1,3}|iv|v|vi{0,3}|ix|x)\s*[\.\)])\s*(.*)$",
    re.IGNORECASE,
)

# Noise & boilerplate filters (note: lone 1-2 digit numbers are filtered contextually by page position, not globally)
ANSWER_LEADER_RE = re.compile(r"[\._\-…]{4,}\s*$")
NOISE_LINE_RE = re.compile(
    r"^(?:"
    r"[\s\._\-–—•·|/\\*]+"
    r"|page\s+\d+(?:\s+of\s+\d+)?"
    r"|\*?\s*turn\s+over\s*\*?"
    r"|blank\s+page"
    r"|additional\s+answer\s+space.*"
    r"|do\s+not\s+write\s+(?:in\s+this\s+)?(?:area|margin|box).*"
    r"|end\s+of\s+question\s+paper.*"
    r"|©\s*(?:ocr|aqa|pearson|edexcel|wjec|cambridge).*$"
    r"|\*\d{6,}\*"
    r"|[a-z]\d{3,4}/\d{2}.*$"
    r")$",
    re.IGNORECASE,
)
COVER_PAGE_MARKERS = (
    "instructions to candidates",
    "information for candidates",
    "read these instructions carefully",
    "you must have:",
    "you can use:",
    "answer all the questions",
    "do not open this booklet",
)
SECTION_HEADER_RE = re.compile(
    r"^(?:section\s+[a-z0-9]+|part\s+[a-z0-9]+|multiple\s+choice|answer\s+all\s+questions)\b",
    re.IGNORECASE,
)

ACTION_VERBS_RE = re.compile(
    r"\b(?:explain|describe|state|define|compare|contrast|identify|calculate|"
    r"outline|evaluate|discuss|write|draw|complete|give|name|list|convert|"
    r"trace|simplify|show|find|determine|suggest|justify|annotate|tick|circle|"
    r"select|which|what|why|how|when|where|analyse|analyze|design|create|modify)\b",
    re.IGNORECASE,
)

TOPIC_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    (
        "Computer Systems",
        (
            "cpu", "alu", "control unit", "register", "von neumann", "fetch", "execute",
            "ram", "rom", "cache", "virtual memory", "secondary storage", "magnetic",
            "optical", "solid state", "clock speed", "cores", "embedded", "memory",
        ),
    ),
    (
        "Data Structures & Algorithms",
        (
            "binary search", "linear search", "bubble sort", "merge sort", "insertion sort",
            "algorithm", "flowchart", "pseudocode", "array", "list", "stack", "queue",
            "tree", "graph", "trace table", "abstraction", "decomposition",
        ),
    ),
    (
        "Software & Programming",
        (
            "function", "procedure", "subroutine", "variable", "constant", "iteration",
            "selection", "sequence", "validation", "verification", "ide", "compiler",
            "interpreter", "translator", "syntax", "logic error", "sql", "boolean",
            "string", "casting", "testing", "maintainability", "high-level",
        ),
    ),
    (
        "Networks & Security",
        (
            "network", "lan", "wan", "router", "switch", "packet", "protocol", "tcp",
            "ip", "http", "https", "dns", "mac address", "topology", "wifi", "ethernet",
            "malware", "phishing", "firewall", "encryption", "brute force", "sql injection",
        ),
    ),
    (
        "Data Representation & Ethics",
        (
            "binary", "hexadecimal", "denary", "overflow", "ascii", "unicode", "bitmap",
            "pixel", "resolution", "colour depth", "sample rate", "compression", "lossy",
            "lossless", "copyright", "gdpr", "privacy", "ethical", "environmental",
        ),
    ),
]

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "your", "have", "will",
    "would", "could", "should", "what", "which", "when", "where", "explain", "describe",
    "state", "define", "compare", "contrast", "identify", "calculate", "outline", "evaluate",
    "discuss", "write", "draw", "complete", "give", "name", "list", "one", "two", "three",
    "mark", "marks", "question", "using", "used", "about", "between", "within", "during",
}


def classify_topic_and_keywords(prompt: str, stem_context: str | None = None) -> tuple[str, list[str]]:
    combined = f"{stem_context or ''} {prompt}".lower()
    best_topic = "General Specification"
    best_hits = 0
    matched_terms: list[str] = []

    for topic, terms in TOPIC_KEYWORDS:
        hits = [term for term in terms if term in combined]
        if len(hits) > best_hits:
            best_hits = len(hits)
            best_topic = topic
            matched_terms = hits

    # Extract meaningful content words as rubric keywords
    tokens = re.findall(r"[a-z0-9\-]{3,}", combined)
    keywords: list[str] = list(dict.fromkeys(matched_terms))
    for tok in tokens:
        if tok not in STOPWORDS and not tok.isdigit() and tok not in keywords:
            keywords.append(tok)
        if len(keywords) >= 6:
            break

    return best_topic, keywords[:6]


def normalize_text(text: str) -> str:
    for src, dst in LIGATURES.items():
        text = text.replace(src, dst)
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def strip_answer_leaders(text: str) -> str:
    # Remove trailing dot/underscore fill-in lines while keeping sentence punctuation
    cleaned = ANSWER_LEADER_RE.sub("", text).strip()
    cleaned = re.sub(r"\s*[\._]{5,}\s*", " ___ ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def extract_marks(text: str) -> tuple[str, int | None]:
    match = MARKS_BRACKET_RE.search(text)
    if not match:
        match = MARKS_INLINE_RE.search(text)
    if not match:
        return text, None
    raw_num = match.group(1) or match.group(2)
    marks = int(raw_num) if raw_num else None
    cleaned = text[: match.start()] + " " + text[match.end() :]
    cleaned = strip_answer_leaders(re.sub(r"\s+", " ", cleaned).strip())
    return cleaned, marks


def is_noise_line(text: str) -> bool:
    if not text:
        return True
    if len(text) == 1 and not text.isdigit():
        return True
    if NOISE_LINE_RE.match(text):
        return True
    if TOTAL_MARKS_ONLY_RE.match(text):
        return True
    # Lines where >65% of characters are dots, underscores, or dashes
    punct_fill = sum(1 for c in text if c in "._-…|")
    if len(text) >= 6 and (punct_fill / len(text)) > 0.6:
        return True
    return False


def join_lines_dehyphenate(lines: list[str]) -> str:
    out = ""
    for raw in lines:
        part = raw.strip()
        if not part:
            continue
        if out.endswith("-") and len(out) >= 2 and out[-2].isalpha() and part[0].islower():
            out = out[:-1] + part
        elif out:
            out += " " + part
        else:
            out = part
    return re.sub(r"\s+", " ", out).strip()


def process_visual_lines(pages_data: list[dict]) -> list[dict]:
    """
    Reconstruct reading-order lines from page geometry spans,
    strip top/bottom headers & footers, and detect two-column layouts.
    """
    raw_pages_lines: list[list[dict]] = []

    for page_idx, page_info in enumerate(pages_data):
        page_w = float(page_info.get("width") or 595.0)
        page_h = float(page_info.get("height") or 842.0)
        header_cutoff = page_h * 0.068
        footer_cutoff = page_h * 0.932

        spans: list[dict] = []
        for sp in page_info.get("spans", []):
            txt = normalize_text(sp.get("text", ""))
            if not txt:
                continue
            x0 = float(sp.get("x0", 0.0))
            y0 = float(sp.get("y0", 0.0))
            x1 = float(sp.get("x1", 0.0))
            y1 = float(sp.get("y1", 0.0))
            if (y1 < header_cutoff or y0 > footer_cutoff) and (
                len(txt) <= 55 or re.search(r"page\s+\d+|turn\s+over|^\d+$", txt, re.I)
            ):
                continue
            spans.append(
                {
                    "text": txt,
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "size": float(sp.get("size", 11.0)),
                    "is_bold": bool(sp.get("is_bold", False)),
                }
            )

        if not spans:
            raw_pages_lines.append([])
            continue

        # Detect if page has distinct two-column structure
        mid_x = page_w * 0.5
        left_spans = [s for s in spans if s["x1"] <= mid_x + 8]
        right_spans = [s for s in spans if s["x0"] >= mid_x - 8]
        is_two_column = (
            len(left_spans) >= 8
            and len(right_spans) >= 8
            and sum(1 for s in spans if s["x0"] < mid_x - 15 and s["x1"] > mid_x + 15) <= 2
        )

        column_groups = [left_spans, right_spans] if is_two_column else [spans]
        page_lines: list[dict] = []

        for col_spans in column_groups:
            col_spans.sort(key=lambda s: (round(s["y0"], 1), round(s["x0"], 1)))
            current_group: list[dict] = []

            def flush_group():
                if not current_group:
                    return
                current_group.sort(key=lambda s: s["x0"])
                # Join spans on same visual baseline, inserting space if horizontal gap > 1.5pt
                merged_parts: list[str] = []
                prev_x1 = None
                for sp in current_group:
                    if prev_x1 is not None and (sp["x0"] - prev_x1) > 1.5:
                        merged_parts.append(" " + sp["text"])
                    else:
                        merged_parts.append(sp["text"])
                    prev_x1 = sp["x1"]
                text = strip_answer_leaders(re.sub(r"\s+", " ", "".join(merged_parts)).strip())
                if text and not is_noise_line(text):
                    # Contextually ignore centered/right-margin lone digits (page numbers) while keeping left-margin question numbers
                    if BARE_NUM_ONLY_RE.match(text):
                        center_x = (current_group[0]["x0"] + current_group[-1]["x1"]) / 2.0
                        is_left_num = current_group[0]["x0"] <= page_w * 0.25 or current_group[0]["is_bold"]
                        if not is_left_num and (abs(center_x - page_w * 0.5) <= 65 or current_group[0]["x0"] > page_w * 0.78):
                            return
                    page_lines.append(
                        {
                            "page": page_idx + 1,
                            "text": text,
                            "x0": current_group[0]["x0"],
                            "y0": current_group[0]["y0"],
                            "is_bold": current_group[0]["is_bold"],
                            "size": statistics.median(s["size"] for s in current_group),
                        }
                    )

            for sp in col_spans:
                if not current_group:
                    current_group.append(sp)
                    continue
                ref_y0 = current_group[0]["y0"]
                if abs(sp["y0"] - ref_y0) <= 4.0:
                    current_group.append(sp)
                else:
                    flush_group()
                    current_group = [sp]
            flush_group()

        raw_pages_lines.append(page_lines)

    # Strip lines that repeat verbatim at top/bottom across multiple pages (running headers/footers)
    if len(raw_pages_lines) >= 2:
        line_counts: dict[str, int] = {}
        for plines in raw_pages_lines:
            seen_on_page = set()
            for item in plines[:3] + plines[-3:]:
                t = item["text"].lower()
                if len(t) <= 80 and t not in seen_on_page:
                    seen_on_page.add(t)
                    line_counts[t] = line_counts.get(t, 0) + 1
        repeated = {t for t, c in line_counts.items() if c >= 2 and not MARKS_INLINE_RE.search(t)}
    else:
        repeated = set()

    all_lines: list[dict] = []
    for plines in raw_pages_lines:
        page_text_lower = " ".join(l["text"].lower() for l in plines)
        has_question_anchor = any(
            TOP_Q_COMBINED_RE.match(l["text"])
            or TOP_Q_RE.match(l["text"])
            or BARE_NUM_LINE_RE.match(l["text"])
            for l in plines
        )
        # Skip cover/instruction-only pages that have no question anchors
        if not has_question_anchor and any(marker in page_text_lower for marker in COVER_PAGE_MARKERS):
            continue

        for item in plines:
            if item["text"].lower() in repeated:
                continue
            all_lines.append(item)

    return all_lines


def extract_visual_lines(doc) -> tuple[list[dict], int]:
    pages_data: list[dict] = []
    total_images = 0
    for page in doc:
        total_images += len(page.get_images(full=True))
        page_dict = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
        spans: list[dict] = []
        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    x0, y0, x1, y1 = span.get("bbox", (0, 0, 0, 0))
                    spans.append(
                        {
                            "text": span.get("text", ""),
                            "x0": float(x0),
                            "y0": float(y0),
                            "x1": float(x1),
                            "y1": float(y1),
                            "size": float(span.get("size", 11.0)),
                            "is_bold": bool(int(span.get("flags", 0)) & 16),
                        }
                    )
        pages_data.append(
            {
                "width": page.rect.width or 595.0,
                "height": page.rect.height or 842.0,
                "spans": spans,
            }
        )
    return process_visual_lines(pages_data), total_images


INLINE_SPLIT_RE = re.compile(
    r"(?<=[.?!:\])])\s+(?="
    r"(?:Q(?:uestion)?\s*\.?\s*\d{1,2}|\d{1,2}\s*[\.\)])\s+[A-Z\"'(\[]"
    r"|\(\s*[a-h]\s*\)\s+[A-Z0-9\"'(\[]"
    r"|\(\s*(?:i{1,3}|iv|v|vi{0,3})\s*\)\s+[A-Z0-9\"'(\[]"
    r")",
)


def split_inline_markers(lines: list[dict]) -> list[dict]:
    """
    Split single visual lines that pack multiple sequential question anchors
    (e.g. '1. What is RAM? 2. What is ROM?' or '1. Memory: (a) Define RAM. (b) Define ROM.')
    into separate logical lines while avoiding mid-sentence false positives.
    """
    expanded: list[dict] = []
    for item in lines:
        parts = INLINE_SPLIT_RE.split(item["text"])
        if len(parts) <= 1:
            expanded.append(item)
            continue
        for p in parts:
            cleaned = p.strip()
            if cleaned:
                expanded.append({**item, "text": cleaned})
    return expanded


def is_actionable_question(prompt: str, marks: int | None, has_label: bool = False) -> bool:
    if len(prompt) < (5 if has_label else 10):
        return False
    if SECTION_HEADER_RE.match(prompt) and marks is None and "?" not in prompt:
        return False
    if marks is not None:
        return True
    if "?" in prompt:
        return True
    if has_label and len(prompt) >= 6:
        return True
    if ACTION_VERBS_RE.search(prompt) and len(prompt) >= 18:
        return True
    return False


def parse_structured_questions(lines: list[dict], full_text: str) -> list[dict]:
    """
    Hierarchical state-machine parser:
    Tracks parent question stems (1, 2, Q1), sub-questions ((a), (b)), and sub-parts ((i), (ii)),
    attaching parent stem context to leaf prompts and deduplicating results.
    """
    if not lines:
        return []

    lines = split_inline_markers(lines)
    left_margin = min(l["x0"] for l in lines)
    questions: list[dict] = []

    parent_num: str | None = None
    parent_stem_lines: list[str] = []
    sub_label: str | None = None
    sub_stem_lines: list[str] = []
    part_label: str | None = None
    active_lines: list[str] = []
    active_marks: int | None = None
    active_page: int = 1
    seen_parent_emitted_leaf = False
    seen_sub_emitted_leaf = False

    def build_label() -> str | None:
        if not parent_num:
            return None
        lbl = parent_num
        if sub_label:
            lbl += f"({sub_label})"
        if part_label:
            lbl += f"({part_label})"
        return lbl

    def build_stem_context() -> str | None:
        parts: list[str] = []
        if sub_label and parent_stem_lines:
            parts.append(join_lines_dehyphenate(parent_stem_lines))
        if part_label and sub_stem_lines:
            parts.append(join_lines_dehyphenate(sub_stem_lines))
        ctx = " ".join(p for p in parts if p).strip()
        if ctx and len(ctx) >= 12:
            return ctx[:360]
        return None

    def flush_leaf(force_keep: bool = False):
        nonlocal active_lines, active_marks, seen_parent_emitted_leaf, seen_sub_emitted_leaf
        if not active_lines:
            return
        combined = join_lines_dehyphenate(active_lines)
        cleaned_prompt, found_marks = extract_marks(combined)
        marks = active_marks or found_marks
        has_label = parent_num is not None or sub_label is not None

        if force_keep or is_actionable_question(cleaned_prompt, marks, has_label=has_label):
            resolved_marks = max(1, min(25, marks or 2))
            ctx = build_stem_context()
            topic_cat, rubric_kw = classify_topic_and_keywords(cleaned_prompt, ctx)
            item: dict = {
                "prompt": cleaned_prompt[:480],
                "marks": resolved_marks,
                "recommendedTimeSeconds": max(45, resolved_marks * 60),
                "topicCategory": topic_cat,
                "rubricKeywords": rubric_kw,
                "page": active_page,
            }
            q_num = build_label()
            if q_num:
                item["questionNumber"] = q_num
            if ctx and ctx.lower() not in cleaned_prompt.lower():
                item["stemContext"] = ctx
            questions.append(item)
            seen_parent_emitted_leaf = True
            if sub_label is not None:
                seen_sub_emitted_leaf = True

        active_lines = []
        active_marks = None

    def is_expected_next_num(candidate_str: str) -> bool:
        if not candidate_str.isdigit():
            return False
        cand = int(candidate_str)
        if parent_num is None:
            return cand == 1
        if parent_num.isdigit():
            return cand == int(parent_num) + 1
        return False

    for item in lines:
        text = item["text"]
        page = item["page"]
        near_left_margin = item["x0"] <= left_margin + 36

        # Skip obvious section headings before content
        if SECTION_HEADER_RE.match(text) and not MARKS_INLINE_RE.search(text):
            flush_leaf()
            parent_num = None
            parent_stem_lines = []
            sub_label = None
            sub_stem_lines = []
            part_label = None
            seen_parent_emitted_leaf = False
            seen_sub_emitted_leaf = False
            continue

        # 1. Combined top + sub-part, e.g. "1 (a) Explain..." or "1(a)(i) State..."
        m_comb = TOP_Q_COMBINED_RE.match(text)
        if m_comb:
            flush_leaf()
            parent_num = m_comb.group(1)
            parent_stem_lines = []
            sub_label = m_comb.group(2).lower()
            sub_stem_lines = []
            part_label = m_comb.group(3).lower() if m_comb.group(3) else None
            seen_parent_emitted_leaf = False
            seen_sub_emitted_leaf = False
            active_page = page

            body, marks = extract_marks(m_comb.group(4).strip())
            if body:
                active_lines.append(body)
            if marks is not None:
                active_marks = marks
                flush_leaf(force_keep=True)
            continue

        # 2. Top-level numbered question ("1. ...", "Q1 ...", standalone "2", or sequential/left-margin "2 Explain...")
        m_top = TOP_Q_RE.match(text)
        m_bare_only = BARE_NUM_ONLY_RE.match(text) if not m_top else None
        m_bare = BARE_NUM_LINE_RE.match(text) if (not m_top and not m_bare_only) else None

        prev_ended_cleanly = (
            not active_lines
            or bool(re.search(r"[.?!:\])\"']\s*$", active_lines[-1]))
        )

        if m_bare_only and not (
            (near_left_margin or item["is_bold"] or is_expected_next_num(m_bare_only.group(1)))
            and (prev_ended_cleanly or item["is_bold"])
        ):
            m_bare_only = None
        if m_bare and not (
            (near_left_margin or item["is_bold"] or is_expected_next_num(m_bare.group(1)))
            and (prev_ended_cleanly or item["is_bold"])
        ):
            m_bare = None

        if m_top or m_bare or m_bare_only:
            flush_leaf()
            if m_top:
                parent_num = m_top.group(1) or m_top.group(2)
                raw_body = m_top.group(3).strip()
            elif m_bare:
                parent_num = m_bare.group(1)
                raw_body = m_bare.group(2).strip()
            else:
                parent_num = m_bare_only.group(1)  # type: ignore[union-attr]
                raw_body = ""

            parent_stem_lines = []
            sub_label = None
            sub_stem_lines = []
            part_label = None
            seen_parent_emitted_leaf = False
            seen_sub_emitted_leaf = False
            active_page = page

            body, marks = extract_marks(raw_body)
            if body:
                active_lines.append(body)
            if marks is not None:
                active_marks = marks
                flush_leaf(force_keep=True)
            continue

        # 3. Sub-part Roman numeral "(i)", "(ii)" (check before single-letter (a) so (i) isn't grabbed as letter i)
        m_roman = ROMAN_PART_RE.match(text)
        if m_roman and parent_num is not None:
            roman_tok = (m_roman.group(1) or m_roman.group(2)).lower()
            if roman_tok != "i" or sub_label is not None or part_label is not None:
                if active_lines and not part_label and not seen_sub_emitted_leaf:
                    combined_sub = join_lines_dehyphenate(active_lines)
                    _, sub_marks = extract_marks(combined_sub)
                    if sub_marks is None:
                        sub_stem_lines.extend(active_lines)
                        active_lines = []
                        active_marks = None
                    else:
                        flush_leaf()
                else:
                    flush_leaf()
                part_label = roman_tok
                active_page = page
                body, marks = extract_marks(m_roman.group(3).strip())
                if body:
                    active_lines.append(body)
                if marks is not None:
                    active_marks = marks
                    flush_leaf(force_keep=True)
                continue

        # 4. Sub-question "(a)", "(b)", "a)" (also handles documents starting directly with "(a)" without "1.")
        m_sub = SUB_Q_RE.match(text)
        if m_sub:
            letter_tok = (m_sub.group(1) or m_sub.group(2)).lower()
            if parent_num is None and letter_tok == "a":
                parent_num = "1"
            if parent_num is not None:
                if active_lines and sub_label is None and not seen_parent_emitted_leaf:
                    combined_stem = join_lines_dehyphenate(active_lines)
                    _, stem_marks = extract_marks(combined_stem)
                    if stem_marks is None:
                        parent_stem_lines.extend(active_lines)
                        active_lines = []
                        active_marks = None
                    else:
                        flush_leaf()
                else:
                    flush_leaf()

                sub_label = letter_tok
                sub_stem_lines = []
                seen_sub_emitted_leaf = False
                part_label = m_sub.group(3).lower() if m_sub.group(3) else None
                active_page = page
                body, marks = extract_marks(m_sub.group(4).strip())
                if body:
                    active_lines.append(body)
                if marks is not None:
                    active_marks = marks
                    flush_leaf(force_keep=True)
                continue

        # 5. Continuation line inside an active question
        if active_lines or parent_num is not None:
            body, marks = extract_marks(text)
            if body:
                active_lines.append(body)
            if marks is not None:
                active_marks = marks
                flush_leaf(force_keep=True)
        else:
            # Standalone line outside numbered hierarchy that explicitly carries marks or question prompt
            body, marks = extract_marks(text)
            if marks is not None and len(body) >= 12:
                resolved_marks = max(1, min(25, marks))
                topic_cat, rubric_kw = classify_topic_and_keywords(body)
                questions.append(
                    {
                        "prompt": body[:480],
                        "marks": resolved_marks,
                        "recommendedTimeSeconds": max(45, resolved_marks * 60),
                        "topicCategory": topic_cat,
                        "rubricKeywords": rubric_kw,
                        "page": page,
                    }
                )

    flush_leaf()

    # Deduplicate near-identical prompts while preserving order
    deduped: list[dict] = []
    seen_prompts: set[str] = set()
    for q in questions:
        sig = re.sub(r"\W+", "", q["prompt"].lower())[:100]
        if sig and sig not in seen_prompts:
            seen_prompts.add(sig)
            deduped.append(q)

    # Fallback 1: Unnumbered PDF containing direct questions (sentences ending in '?')
    if not deduped and full_text.strip():
        sentences = re.split(r"(?<=[\?\!])\s+|\n+", full_text)
        for sent in sentences:
            s = strip_answer_leaders(normalize_text(sent))
            if s.endswith("?") and len(s) >= 15 and not is_noise_line(s):
                cleaned, m = extract_marks(s)
                resolved_marks = max(1, min(25, m or 2))
                topic_cat, rubric_kw = classify_topic_and_keywords(cleaned)
                deduped.append(
                    {
                        "prompt": cleaned[:480],
                        "marks": resolved_marks,
                        "recommendedTimeSeconds": max(45, resolved_marks * 60),
                        "topicCategory": topic_cat,
                        "rubricKeywords": rubric_kw,
                    }
                )
            if len(deduped) >= 12:
                break

    # Fallback 2: General study notes / prose PDF with no explicit questions
    if not deduped and full_text.strip():
        paragraphs = [
            normalize_text(p)
            for p in re.split(r"\n\s*\n+", full_text)
            if len(normalize_text(p)) >= 30 and not is_noise_line(normalize_text(p))
        ]
        if not paragraphs:
            flat = normalize_text(full_text)
            paragraphs = [flat[i : i + 260].strip() for i in range(0, min(len(flat), 1300), 260) if flat[i : i + 260].strip()]
        for idx, para in enumerate(paragraphs[:6], start=1):
            snippet = para[:240] + ("..." if len(para) > 240 else "")
            prompt_txt = f"Summarise and explain the key concepts from section {idx}: \"{snippet}\""
            topic_cat, rubric_kw = classify_topic_and_keywords(para)
            deduped.append(
                {
                    "questionNumber": str(idx),
                    "prompt": prompt_txt,
                    "marks": 3,
                    "recommendedTimeSeconds": 180,
                    "topicCategory": topic_cat,
                    "rubricKeywords": rubric_kw,
                }
            )

    return deduped[:25]


def analyze_geometry_payload(payload: dict) -> dict:
    pages = payload.get("pages") or []
    page_count = int(payload.get("pageCount") or len(pages))
    if page_count == 0:
        return {"error": "The uploaded PDF contains no pages."}

    image_count = int(payload.get("imageCount") or 0)
    lines = process_visual_lines(pages)
    full_text = "\n".join(item["text"] for item in lines).strip()

    if not full_text:
        raw_pages = [normalize_text(p.get("rawText") or "") for p in pages]
        full_text = "\n\n".join(t for t in raw_pages if t).strip()

    needs_ocr = len(full_text) < 20 and image_count > 0
    raw_title = normalize_text(payload.get("title") or "")
    questions = parse_structured_questions(lines, full_text) if full_text else []

    return {
        "title": raw_title,
        "pageCount": page_count,
        "characterCount": len(full_text),
        "needsOcr": needs_ocr,
        "extractedText": full_text,
        "questions": questions,
    }


def analyze_pdf(pdf_path: str) -> dict:
    if pymupdf is None:
        return {"error": "PyMuPDF is not available in this Python environment."}
    if not os.path.exists(pdf_path):
        return {"error": "Uploaded PDF file could not be found."}

    doc = None
    try:
        doc = pymupdf.open(pdf_path)
        if doc.needs_pass:
            return {"error": "This PDF is password-protected. Please upload an unlocked PDF."}

        page_count = len(doc)
        if page_count == 0:
            return {"error": "The uploaded PDF contains no pages."}

        lines, image_count = extract_visual_lines(doc)
        full_text = "\n".join(item["text"] for item in lines).strip()

        # If layout filter stripped everything on an unusual tiny PDF, fall back to raw page text
        if not full_text:
            raw_pages = [normalize_text(p.get_text("text")) for p in doc]
            full_text = "\n\n".join(t for t in raw_pages if t).strip()

        needs_ocr = len(full_text) < 20 and image_count > 0
        metadata = doc.metadata or {}
        raw_title = normalize_text(metadata.get("title") or "")
        questions = parse_structured_questions(lines, full_text) if full_text else []

        return {
            "title": raw_title,
            "pageCount": page_count,
            "characterCount": len(full_text),
            "needsOcr": needs_ocr,
            "extractedText": full_text,
            "questions": questions,
        }
    except Exception as exc:
        return {"error": f"PyMuPDF failed to parse PDF: {str(exc)}"}
    finally:
        if doc is not None:
            doc.close()


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--stdin-spans":
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        result = analyze_geometry_payload(payload)
    elif len(sys.argv) >= 2:
        result = analyze_pdf(sys.argv[1])
    else:
        print(json.dumps({"error": "Missing PDF file path argument."}))
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
