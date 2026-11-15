import json
import re
import statistics
import sys
import unicodedata

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

TOP_QUESTION_COMBINED_RE = re.compile(
    r"^(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,2})\s*(?:[\.\):]\s*|\s+)\(\s*([a-z])\s*\)(?:\s*\(\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*\))?\s*(.*)$",
    re.IGNORECASE,
)
TOP_QUESTION_RE = re.compile(
    r"^(?:Q(?:uestion)?\s*\.?\s*(\d{1,2})|(\d{1,2})\s*[\.\):])\s*(.*)$",
    re.IGNORECASE,
)
BARE_NUMBER_ONLY_RE = re.compile(r"^(\d{1,2})$")
BARE_NUMBER_LINE_RE = re.compile(r"^(\d{1,2})\s+([A-Z\"'(\[].{3,})$")
SUB_QUESTION_RE = re.compile(
    r"^(?:\(\s*([a-z])\s*\)|([a-z])\s*[\.\)])\s*(?:\(\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*\)\s*)?(.*)$"
)
ROMAN_PART_RE = re.compile(
    r"^(?:\(\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*\)|(i{1,3}|iv|v|vi{0,3}|ix|x)\s*[\.\)])\s*(.*)$",
    re.IGNORECASE,
)

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

INLINE_SPLIT_RE = re.compile(
    r"(?<=[.?!:\])])\s+(?="
    r"(?:Q(?:uestion)?\s*\.?\s*\d{1,2}|\d{1,2}\s*[\.\)])\s+[A-Z\"'(\[]"
    r"|\(\s*[a-h]\s*\)\s+[A-Z0-9\"'(\[]"
    r"|\(\s*(?:i{1,3}|iv|v|vi{0,3})\s*\)\s+[A-Z0-9\"'(\[]"
    r")",
)


def classify_topic_and_keywords(prompt: str, stem_context: str | None = None) -> tuple[str, list[str]]:
    combined_text = f"{stem_context or ''} {prompt}".lower()
    best_topic = "General Specification"
    best_hit_count = 0
    matched_terms: list[str] = []

    for topic, terms in TOPIC_KEYWORDS:
        hits = [term for term in terms if term in combined_text]
        if len(hits) > best_hit_count:
            best_hit_count = len(hits)
            best_topic = topic
            matched_terms = hits

    tokens = re.findall(r"[a-z0-9\-]{3,}", combined_text)
    keywords: list[str] = list(dict.fromkeys(matched_terms))
    for token in tokens:
        if token not in STOPWORDS and not token.isdigit() and token not in keywords:
            keywords.append(token)
        if len(keywords) >= 6:
            break

    return best_topic, keywords[:6]


def normalize_text(text: str) -> str:
    for ligature, replacement in LIGATURES.items():
        text = text.replace(ligature, replacement)
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def strip_answer_leaders(text: str) -> str:
    cleaned = ANSWER_LEADER_RE.sub("", text).strip()
    cleaned = re.sub(r"\s*[\._]{5,}\s*", " ___ ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def extract_marks(text: str) -> tuple[str, int | None]:
    match = MARKS_BRACKET_RE.search(text)
    if not match:
        match = MARKS_INLINE_RE.search(text)
    if not match:
        return text, None
    raw_number = match.group(1) or match.group(2)
    marks = int(raw_number) if raw_number else None
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
    punct_fill_count = sum(1 for character in text if character in "._-…|")
    if len(text) >= 6 and (punct_fill_count / len(text)) > 0.6:
        return True
    return False


def join_lines_dehyphenate(lines: list[str]) -> str:
    joined_text = ""
    for raw_line in lines:
        segment = raw_line.strip()
        if not segment:
            continue
        if (
            joined_text.endswith("-")
            and len(joined_text) >= 2
            and joined_text[-2].isalpha()
            and segment[0].islower()
        ):
            joined_text = joined_text[:-1] + segment
        elif joined_text:
            joined_text += " " + segment
        else:
            joined_text = segment
    return re.sub(r"\s+", " ", joined_text).strip()


def process_visual_lines(pages_data: list[dict]) -> list[dict]:
    raw_pages_lines: list[list[dict]] = []

    for page_index, page_info in enumerate(pages_data):
        page_width = float(page_info.get("width") or 595.0)
        page_height = float(page_info.get("height") or 842.0)
        header_cutoff = page_height * 0.068
        footer_cutoff = page_height * 0.932

        spans: list[dict] = []
        for raw_span in page_info.get("spans", []):
            span_text = normalize_text(raw_span.get("text", ""))
            if not span_text:
                continue
            x0 = float(raw_span.get("x0", 0.0))
            y0 = float(raw_span.get("y0", 0.0))
            x1 = float(raw_span.get("x1", 0.0))
            y1 = float(raw_span.get("y1", 0.0))
            if (y1 < header_cutoff or y0 > footer_cutoff) and (
                len(span_text) <= 55 or re.search(r"page\s+\d+|turn\s+over|^\d+$", span_text, re.I)
            ):
                continue
            spans.append(
                {
                    "text": span_text,
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "size": float(raw_span.get("size", 11.0)),
                    "is_bold": bool(raw_span.get("is_bold", False)),
                }
            )

        if not spans:
            raw_pages_lines.append([])
            continue

        mid_x = page_width * 0.5
        left_spans = [span_item for span_item in spans if span_item["x1"] <= mid_x + 8]
        right_spans = [span_item for span_item in spans if span_item["x0"] >= mid_x - 8]
        is_two_column = (
            len(left_spans) >= 8
            and len(right_spans) >= 8
            and sum(1 for span_item in spans if span_item["x0"] < mid_x - 15 and span_item["x1"] > mid_x + 15) <= 2
        )

        column_groups = [left_spans, right_spans] if is_two_column else [spans]
        page_lines: list[dict] = []

        for column_spans in column_groups:
            column_spans.sort(key=lambda span_item: (round(span_item["y0"], 1), round(span_item["x0"], 1)))
            current_line_spans: list[dict] = []

            def flush_line_spans():
                if not current_line_spans:
                    return
                current_line_spans.sort(key=lambda span_item: span_item["x0"])
                merged_parts: list[str] = []
                previous_x1 = None
                for span_item in current_line_spans:
                    if previous_x1 is not None and (span_item["x0"] - previous_x1) > 1.5:
                        merged_parts.append(" " + span_item["text"])
                    else:
                        merged_parts.append(span_item["text"])
                    previous_x1 = span_item["x1"]
                line_text = strip_answer_leaders(re.sub(r"\s+", " ", "".join(merged_parts)).strip())
                if line_text and not is_noise_line(line_text):
                    # Drop standalone footer/margin page numbers while keeping left-margin question numbers
                    if BARE_NUMBER_ONLY_RE.match(line_text):
                        center_x = (current_line_spans[0]["x0"] + current_line_spans[-1]["x1"]) / 2.0
                        is_left_number = current_line_spans[0]["x0"] <= page_width * 0.25 or current_line_spans[0]["is_bold"]
                        if not is_left_number and (
                            abs(center_x - page_width * 0.5) <= 65 or current_line_spans[0]["x0"] > page_width * 0.78
                        ):
                            return
                    page_lines.append(
                        {
                            "page": page_index + 1,
                            "text": line_text,
                            "x0": current_line_spans[0]["x0"],
                            "y0": current_line_spans[0]["y0"],
                            "is_bold": current_line_spans[0]["is_bold"],
                            "size": statistics.median(span_item["size"] for span_item in current_line_spans),
                        }
                    )

            for span_item in column_spans:
                if not current_line_spans:
                    current_line_spans.append(span_item)
                    continue
                reference_y0 = current_line_spans[0]["y0"]
                if abs(span_item["y0"] - reference_y0) <= 4.0:
                    current_line_spans.append(span_item)
                else:
                    flush_line_spans()
                    current_line_spans = [span_item]
            flush_line_spans()

        raw_pages_lines.append(page_lines)

    if len(raw_pages_lines) >= 2:
        line_counts: dict[str, int] = {}
        for page_line_group in raw_pages_lines:
            seen_on_page = set()
            for line_entry in page_line_group[:3] + page_line_group[-3:]:
                lowered_text = line_entry["text"].lower()
                if len(lowered_text) <= 80 and lowered_text not in seen_on_page:
                    seen_on_page.add(lowered_text)
                    line_counts[lowered_text] = line_counts.get(lowered_text, 0) + 1
        repeated_headers = {
            lowered_text
            for lowered_text, occurrence_count in line_counts.items()
            if occurrence_count >= 2 and not MARKS_INLINE_RE.search(lowered_text)
        }
    else:
        repeated_headers = set()

    filtered_lines: list[dict] = []
    for page_line_group in raw_pages_lines:
        page_text_lower = " ".join(entry["text"].lower() for entry in page_line_group)
        has_question_anchor = any(
            TOP_QUESTION_COMBINED_RE.match(entry["text"])
            or TOP_QUESTION_RE.match(entry["text"])
            or BARE_NUMBER_LINE_RE.match(entry["text"])
            for entry in page_line_group
        )
        if not has_question_anchor and any(marker in page_text_lower for marker in COVER_PAGE_MARKERS):
            continue

        for line_entry in page_line_group:
            if line_entry["text"].lower() in repeated_headers:
                continue
            filtered_lines.append(line_entry)

    return filtered_lines


def split_inline_markers(lines: list[dict]) -> list[dict]:
    expanded_lines: list[dict] = []
    for line_entry in lines:
        segments = INLINE_SPLIT_RE.split(line_entry["text"])
        if len(segments) <= 1:
            expanded_lines.append(line_entry)
            continue
        for segment in segments:
            cleaned_segment = segment.strip()
            if cleaned_segment:
                expanded_lines.append({**line_entry, "text": cleaned_segment})
    return expanded_lines


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
    if not lines:
        return []

    lines = split_inline_markers(lines)
    left_margin = min(entry["x0"] for entry in lines)
    questions: list[dict] = []

    parent_number: str | None = None
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
        if not parent_number:
            return None
        label = parent_number
        if sub_label:
            label += f"({sub_label})"
        if part_label:
            label += f"({part_label})"
        return label

    def build_stem_context() -> str | None:
        stem_parts: list[str] = []
        if sub_label and parent_stem_lines:
            stem_parts.append(join_lines_dehyphenate(parent_stem_lines))
        if part_label and sub_stem_lines:
            stem_parts.append(join_lines_dehyphenate(sub_stem_lines))
        stem_context = " ".join(part for part in stem_parts if part).strip()
        if stem_context and len(stem_context) >= 12:
            return stem_context[:360]
        return None

    def flush_leaf(force_keep: bool = False):
        nonlocal active_lines, active_marks, seen_parent_emitted_leaf, seen_sub_emitted_leaf
        if not active_lines:
            return
        combined_prompt = join_lines_dehyphenate(active_lines)
        cleaned_prompt, found_marks = extract_marks(combined_prompt)
        marks = active_marks or found_marks
        has_label = parent_number is not None or sub_label is not None

        if force_keep or is_actionable_question(cleaned_prompt, marks, has_label=has_label):
            resolved_marks = max(1, min(25, marks or 2))
            stem_context = build_stem_context()
            topic_category, rubric_keywords = classify_topic_and_keywords(cleaned_prompt, stem_context)
            question_record: dict = {
                "prompt": cleaned_prompt[:480],
                "marks": resolved_marks,
                "recommendedTimeSeconds": max(45, resolved_marks * 60),
                "topicCategory": topic_category,
                "rubricKeywords": rubric_keywords,
                "page": active_page,
            }
            question_number = build_label()
            if question_number:
                question_record["questionNumber"] = question_number
            if stem_context and stem_context.lower() not in cleaned_prompt.lower():
                question_record["stemContext"] = stem_context
            questions.append(question_record)
            seen_parent_emitted_leaf = True
            if sub_label is not None:
                seen_sub_emitted_leaf = True

        active_lines = []
        active_marks = None

    def is_expected_next_number(candidate_str: str) -> bool:
        if not candidate_str.isdigit():
            return False
        candidate_number = int(candidate_str)
        if parent_number is None:
            return candidate_number == 1
        if parent_number.isdigit():
            return candidate_number == int(parent_number) + 1
        return False

    for line_entry in lines:
        line_text = line_entry["text"]
        page_number = line_entry["page"]
        near_left_margin = line_entry["x0"] <= left_margin + 36

        if SECTION_HEADER_RE.match(line_text) and not MARKS_INLINE_RE.search(line_text):
            flush_leaf()
            parent_number = None
            parent_stem_lines = []
            sub_label = None
            sub_stem_lines = []
            part_label = None
            seen_parent_emitted_leaf = False
            seen_sub_emitted_leaf = False
            continue

        combined_match = TOP_QUESTION_COMBINED_RE.match(line_text)
        if combined_match:
            flush_leaf()
            parent_number = combined_match.group(1)
            parent_stem_lines = []
            sub_label = combined_match.group(2).lower()
            sub_stem_lines = []
            part_label = combined_match.group(3).lower() if combined_match.group(3) else None
            seen_parent_emitted_leaf = False
            seen_sub_emitted_leaf = False
            active_page = page_number

            body_text, marks = extract_marks(combined_match.group(4).strip())
            if body_text:
                active_lines.append(body_text)
            if marks is not None:
                active_marks = marks
                flush_leaf(force_keep=True)
            continue

        top_match = TOP_QUESTION_RE.match(line_text)
        bare_only_match = BARE_NUMBER_ONLY_RE.match(line_text) if not top_match else None
        bare_line_match = BARE_NUMBER_LINE_RE.match(line_text) if (not top_match and not bare_only_match) else None

        previous_ended_cleanly = (
            not active_lines
            or bool(re.search(r"[.?!:\])\"']\s*$", active_lines[-1]))
        )

        if bare_only_match and not (
            (near_left_margin or line_entry["is_bold"] or is_expected_next_number(bare_only_match.group(1)))
            and (previous_ended_cleanly or line_entry["is_bold"])
        ):
            bare_only_match = None
        if bare_line_match and not (
            (near_left_margin or line_entry["is_bold"] or is_expected_next_number(bare_line_match.group(1)))
            and (previous_ended_cleanly or line_entry["is_bold"])
        ):
            bare_line_match = None

        if top_match or bare_line_match or bare_only_match:
            flush_leaf()
            if top_match:
                parent_number = top_match.group(1) or top_match.group(2)
                raw_body = top_match.group(3).strip()
            elif bare_line_match:
                parent_number = bare_line_match.group(1)
                raw_body = bare_line_match.group(2).strip()
            else:
                parent_number = bare_only_match.group(1)
                raw_body = ""

            parent_stem_lines = []
            sub_label = None
            sub_stem_lines = []
            part_label = None
            seen_parent_emitted_leaf = False
            seen_sub_emitted_leaf = False
            active_page = page_number

            body_text, marks = extract_marks(raw_body)
            if body_text:
                active_lines.append(body_text)
            if marks is not None:
                active_marks = marks
                flush_leaf(force_keep=True)
            continue

        roman_match = ROMAN_PART_RE.match(line_text)
        if roman_match and parent_number is not None:
            roman_token = (roman_match.group(1) or roman_match.group(2)).lower()
            if roman_token != "i" or sub_label is not None or part_label is not None:
                if active_lines and not part_label and not seen_sub_emitted_leaf:
                    combined_sub_stem = join_lines_dehyphenate(active_lines)
                    _, sub_marks = extract_marks(combined_sub_stem)
                    if sub_marks is None:
                        sub_stem_lines.extend(active_lines)
                        active_lines = []
                        active_marks = None
                    else:
                        flush_leaf()
                else:
                    flush_leaf()
                part_label = roman_token
                active_page = page_number
                body_text, marks = extract_marks(roman_match.group(3).strip())
                if body_text:
                    active_lines.append(body_text)
                if marks is not None:
                    active_marks = marks
                    flush_leaf(force_keep=True)
                continue

        sub_match = SUB_QUESTION_RE.match(line_text)
        if sub_match:
            letter_token = (sub_match.group(1) or sub_match.group(2)).lower()
            if parent_number is None and letter_token == "a":
                parent_number = "1"
            if parent_number is not None:
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

                sub_label = letter_token
                sub_stem_lines = []
                seen_sub_emitted_leaf = False
                part_label = sub_match.group(3).lower() if sub_match.group(3) else None
                active_page = page_number
                body_text, marks = extract_marks(sub_match.group(4).strip())
                if body_text:
                    active_lines.append(body_text)
                if marks is not None:
                    active_marks = marks
                    flush_leaf(force_keep=True)
                continue

        if active_lines or parent_number is not None:
            body_text, marks = extract_marks(line_text)
            if body_text:
                active_lines.append(body_text)
            if marks is not None:
                active_marks = marks
                flush_leaf(force_keep=True)
        else:
            body_text, marks = extract_marks(line_text)
            if marks is not None and len(body_text) >= 12:
                resolved_marks = max(1, min(25, marks))
                topic_category, rubric_keywords = classify_topic_and_keywords(body_text)
                questions.append(
                    {
                        "prompt": body_text[:480],
                        "marks": resolved_marks,
                        "recommendedTimeSeconds": max(45, resolved_marks * 60),
                        "topicCategory": topic_category,
                        "rubricKeywords": rubric_keywords,
                        "page": page_number,
                    }
                )

    flush_leaf()

    deduped_questions: list[dict] = []
    seen_signatures: set[str] = set()
    for question in questions:
        signature = re.sub(r"\W+", "", question["prompt"].lower())[:100]
        if signature and signature not in seen_signatures:
            seen_signatures.add(signature)
            deduped_questions.append(question)

    if not deduped_questions and full_text.strip():
        sentences = re.split(r"(?<=[\?\!])\s+|\n+", full_text)
        for sentence in sentences:
            normalized_sentence = strip_answer_leaders(normalize_text(sentence))
            if normalized_sentence.endswith("?") and len(normalized_sentence) >= 15 and not is_noise_line(normalized_sentence):
                cleaned_prompt, found_marks = extract_marks(normalized_sentence)
                resolved_marks = max(1, min(25, found_marks or 2))
                topic_category, rubric_keywords = classify_topic_and_keywords(cleaned_prompt)
                deduped_questions.append(
                    {
                        "prompt": cleaned_prompt[:480],
                        "marks": resolved_marks,
                        "recommendedTimeSeconds": max(45, resolved_marks * 60),
                        "topicCategory": topic_category,
                        "rubricKeywords": rubric_keywords,
                    }
                )
            if len(deduped_questions) >= 12:
                break

    if not deduped_questions and full_text.strip():
        paragraphs = [
            normalize_text(paragraph)
            for paragraph in re.split(r"\n\s*\n+", full_text)
            if len(normalize_text(paragraph)) >= 30 and not is_noise_line(normalize_text(paragraph))
        ]
        if not paragraphs:
            flattened_text = normalize_text(full_text)
            paragraphs = [
                flattened_text[offset : offset + 260].strip()
                for offset in range(0, min(len(flattened_text), 1300), 260)
                if flattened_text[offset : offset + 260].strip()
            ]
        for section_index, paragraph in enumerate(paragraphs[:6], start=1):
            snippet = paragraph[:240] + ("..." if len(paragraph) > 240 else "")
            prompt_text = f'Summarise and explain the key concepts from section {section_index}: "{snippet}"'
            topic_category, rubric_keywords = classify_topic_and_keywords(paragraph)
            deduped_questions.append(
                {
                    "questionNumber": str(section_index),
                    "prompt": prompt_text,
                    "marks": 3,
                    "recommendedTimeSeconds": 180,
                    "topicCategory": topic_category,
                    "rubricKeywords": rubric_keywords,
                }
            )

    return deduped_questions[:25]


def analyze_geometry_payload(payload: dict) -> dict:
    pages = payload.get("pages") or []
    page_count = int(payload.get("pageCount") or len(pages))
    if page_count == 0:
        return {"error": "The uploaded PDF contains no pages."}

    image_count = int(payload.get("imageCount") or 0)
    lines = process_visual_lines(pages)
    full_text = "\n".join(line_entry["text"] for line_entry in lines).strip()

    if not full_text:
        raw_pages = [normalize_text(page_entry.get("rawText") or "") for page_entry in pages]
        full_text = "\n\n".join(page_text for page_text in raw_pages if page_text).strip()

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


def main():
    if len(sys.argv) < 2 or sys.argv[1] != "--stdin-spans":
        print(json.dumps({"error": "Missing --stdin-spans argument."}))
        sys.exit(1)

    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input or "{}")
    except json.JSONDecodeError as decode_error:
        print(json.dumps({"error": f"Invalid JSON geometry payload: {decode_error}"}))
        sys.exit(1)

    result = analyze_geometry_payload(payload)
    print(json.dumps(result, ensure_ascii=False))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
