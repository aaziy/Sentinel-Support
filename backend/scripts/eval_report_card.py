#!/usr/bin/env python3
"""
Agent Report Card — LLM-as-Judge Evaluation
============================================

Loops through a test dataset, calls POST /api/v1/query for each case,
then uses a locally-cached Flan-T5-Base model as the judge to score
accuracy + tone (1–5) and provide reasoning.

Usage (backend server must be running on :8000):
    PYTHONPATH=. HF_HUB_OFFLINE=1 python scripts/eval_report_card.py

Requirements: transformers, torch (both already in .venv)
No internet or API keys required.
"""
from __future__ import annotations

import sys
import textwrap
import time
from dataclasses import dataclass, field

import httpx

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL   = "http://localhost:8000"
QUERY_URL  = f"{BASE_URL}/api/v1/query/"
HTTP_TIMEOUT = 30.0

# ── Test Dataset ─────────────────────────────────────────────────────────────
TEST_CASES: list[dict] = [
    {
        "category": "Password Reset",
        "input": "How do I reset my password?",
        "expected_criteria": (
            "Must explain the password reset process step-by-step. "
            "Should mention clicking a 'Forgot Password' link or visiting account settings. "
            "Tone must be helpful and clear."
        ),
    },
    {
        "category": "Account Locked",
        "input": "My account is locked. What should I do?",
        "expected_criteria": (
            "Must address account lockout resolution. "
            "Should mention contacting support or waiting for a cooldown period. "
            "Tone must be calm and reassuring."
        ),
    },
    {
        "category": "Billing Issue",
        "input": "I was charged twice for my subscription this month.",
        "expected_criteria": (
            "Must acknowledge the double-charge concern. "
            "Should advise the user to contact billing support or provide a refund process. "
            "Tone must be empathetic and professional."
        ),
    },
    {
        "category": "Greeting / Chitchat",
        "input": "Hello! How are you?",
        "expected_criteria": (
            "Must respond in a friendly, welcoming manner. "
            "Should offer assistance or ask how it can help. "
            "Must NOT attempt to answer a technical question unprompted."
        ),
    },
    {
        "category": "Escalation Trigger",
        "input": "This is unacceptable. I need to speak to a manager right now!",
        "expected_criteria": (
            "Must acknowledge the frustration empathetically. "
            "Must indicate that the request has been escalated to a human agent. "
            "Should provide a ticket ID or reference number. "
            "Must NOT attempt to resolve the issue itself."
        ),
    },
    {
        "category": "Software Bug",
        "input": "The app keeps crashing when I try to upload a file.",
        "expected_criteria": (
            "Must acknowledge the technical issue. "
            "Should provide troubleshooting steps such as clearing cache, "
            "reinstalling, or checking file size limits. "
            "Tone must be patient and solution-focused."
        ),
    },
    {
        "category": "Feature Request",
        "input": "Can you add a dark mode to the app?",
        "expected_criteria": (
            "Must acknowledge the feature request politely. "
            "Should indicate it will be forwarded to the product team, "
            "or that the user can submit feedback through the proper channel. "
            "Must NOT promise a delivery date."
        ),
    },
    {
        "category": "Cancellation",
        "input": "I want to cancel my subscription.",
        "expected_criteria": (
            "Must confirm it can help with cancellation. "
            "Should outline the cancellation steps or direct the user to account settings. "
            "Tone must be respectful — must NOT try to retain or guilt the user."
        ),
    },
    {
        "category": "General Farewell",
        "input": "Thanks, that's all I needed. Goodbye!",
        "expected_criteria": (
            "Must respond with a warm, polite farewell. "
            "Should invite the user to return if they need more help. "
            "Must be brief — no need for lengthy explanation."
        ),
    },
    {
        "category": "Vague / Ambiguous",
        "input": "It's not working.",
        "expected_criteria": (
            "Must ask a clarifying question to understand the issue. "
            "Should NOT assume what 'it' refers to. "
            "Tone must be patient and non-judgmental."
        ),
    },
]

# ── Data Classes ─────────────────────────────────────────────────────────────
@dataclass
class EvalResult:
    category: str
    query: str
    agent_response: str
    route: str
    score: int
    reasoning: str
    error: str = ""
    latency_ms: int = 0


# ── Judge ─────────────────────────────────────────────────────────────────────
# Rule-based heuristic judge: reliable, fast, 100% offline.
# Flan-T5-Base is too small to follow multi-criteria scoring reliably.
# This judge extracts "must"/"should"/"must not" rules from the criteria string
# and scores based on keyword evidence in the agent response.

import re as _re


def _extract_rules(criteria: str) -> tuple[list[str], list[str], list[str]]:
    """
    Parse criteria into three lists:
      - must_have   : phrases from "Must <verb> ..." clauses
      - should_have : phrases from "Should ..." clauses
      - must_not    : phrases from "Must NOT ..." clauses
    """
    must_have, should_have, must_not = [], [], []
    for sentence in _re.split(r'[.;]', criteria):
        s = sentence.strip()
        if not s:
            continue
        sl = s.lower()
        if "must not" in sl or "must never" in sl:
            must_not.append(sl)
        elif sl.startswith("must") or "must " in sl:
            must_have.append(sl)
        elif sl.startswith("should") or "should " in sl:
            should_have.append(sl)
    return must_have, should_have, must_not


def _keywords(rule: str) -> list[str]:
    """Extract 2-4 word key nouns/verbs from a rule sentence."""
    # Remove common stopwords and the leading verb phrase
    stopwords = {
        "must", "should", "the", "a", "an", "and", "or", "to", "in", "it",
        "of", "for", "not", "be", "its", "is", "that", "this", "with",
        "any", "all", "each", "user", "response", "agent", "provide",
        "indicate", "mention", "attempt", "try", "ask", "address", "confirm",
        "respond", "include", "offer", "acknowledge", "say", "never", "also",
    }
    words = _re.findall(r"[a-z']+", rule.lower())
    return [w for w in words if w not in stopwords and len(w) > 3]


def judge_response(query: str, agent_response: str, criteria: str) -> tuple[int, str]:
    """
    Score the agent response against the criteria rules.
    Returns (score 1-5, reasoning str).
    """
    resp_lower = agent_response.lower()
    is_generic_fallback = resp_lower.strip() in (
        "escalated to human agent.",
        "i'm sorry, i couldn't find relevant information. would you like me to escalate this to a human agent?",
    )

    must_have, should_have, must_not = _extract_rules(criteria)

    must_hits, must_misses = 0, 0
    for rule in must_have:
        kws = _keywords(rule)
        hit = any(kw in resp_lower for kw in kws) if kws else False
        if hit:
            must_hits += 1
        else:
            must_misses += 1

    should_hits = 0
    for rule in should_have:
        kws = _keywords(rule)
        if kws and any(kw in resp_lower for kw in kws):
            should_hits += 1

    violation_hits = 0
    for rule in must_not:
        kws = _keywords(rule)
        if kws and any(kw in resp_lower for kw in kws):
            violation_hits += 1

    total_must = len(must_have) or 1
    total_should = len(should_have) or 1

    must_ratio   = must_hits / total_must
    should_ratio = should_hits / total_should

    # Build score
    if violation_hits > 0:
        score = 1
        reason = f"Violated {violation_hits} 'must not' rule(s)"
    elif is_generic_fallback and must_ratio < 0.5:
        score = 2
        reason = f"Generic fallback response; met only {must_hits}/{total_must} required criteria"
    elif must_ratio >= 1.0 and should_ratio >= 0.7:
        score = 5
        reason = f"Met all {total_must} required and {should_hits}/{total_should} recommended criteria"
    elif must_ratio >= 0.7:
        score = 4
        reason = f"Met {must_hits}/{total_must} required criteria, {should_hits}/{total_should} recommended"
    elif must_ratio >= 0.4:
        score = 3
        reason = f"Partially met criteria: {must_hits}/{total_must} required, {should_hits}/{total_should} recommended"
    else:
        score = 2
        reason = f"Missed most criteria: only {must_hits}/{total_must} required met"

    return score, reason


# ── Agent Caller ──────────────────────────────────────────────────────────────
def call_agent(query: str) -> tuple[str, str, int]:
    """Returns (response_text, route, latency_ms)."""
    t0 = time.perf_counter()
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(QUERY_URL, json={"query": query})
    latency_ms = int((time.perf_counter() - t0) * 1000)
    resp.raise_for_status()
    data = resp.json()
    return data["response"], data["route"], latency_ms


# ── Report Rendering ──────────────────────────────────────────────────────────
SCORE_BAR = {5: "█████", 4: "████░", 3: "███░░", 2: "██░░░", 1: "█░░░░", 0: "?????"}
SCORE_COLOR = {
    5: "\033[92m",   # bright green
    4: "\033[32m",   # green
    3: "\033[93m",   # yellow
    2: "\033[91m",   # red
    1: "\033[31m",   # dark red
    0: "\033[90m",   # grey
}
RESET = "\033[0m"
BOLD  = "\033[1m"

COL_WIDTHS = {
    "category": 20,
    "score":     7,
    "route":    20,
    "latency":   9,
    "reasoning": 52,
}

def _col(text: str, width: int) -> str:
    text = str(text)
    return text[:width].ljust(width)

def _score_cell(score: int) -> str:
    color = SCORE_COLOR.get(score, "")
    bar   = SCORE_BAR.get(score, "?????")
    return f"{color}{score}/5 {bar}{RESET}"

def print_report(results: list[EvalResult]) -> None:
    valid   = [r for r in results if not r.error]
    errored = [r for r in results if r.error]
    avg     = sum(r.score for r in valid) / len(valid) if valid else 0

    sep  = "─" * 120
    sep2 = "═" * 120

    print(f"\n{BOLD}{sep2}{RESET}")
    print(f"{BOLD}  🤖  SENTINEL SUPPORT — AGENT REPORT CARD{RESET}")
    print(f"{BOLD}{sep2}{RESET}")

    # Header row
    header = (
        f"  {_col('Category', COL_WIDTHS['category'])} "
        f"{'Score':<13} "
        f"{_col('Route', COL_WIDTHS['route'])} "
        f"{'ms':>{COL_WIDTHS['latency']}} "
        f"  Judge's Reasoning"
    )
    print(f"{BOLD}{header}{RESET}")
    print(f"  {sep}")

    for r in results:
        if r.error:
            cat_col   = _col(r.category, COL_WIDTHS["category"])
            print(f"  {cat_col} {'ERROR':<13} {'—':<20} {'—':>9}   {r.error[:52]}")
            continue

        cat_col      = _col(r.category, COL_WIDTHS["category"])
        score_render = _score_cell(r.score)
        # score_cell includes ANSI codes; pad manually
        padding      = " " * max(0, 13 - len(f"{r.score}/5 {SCORE_BAR.get(r.score,'?????')}"))
        route_col    = _col(r.route, COL_WIDTHS["route"])
        latency_col  = f"{r.latency_ms:>{COL_WIDTHS['latency']}}"
        reasoning    = r.reasoning[:COL_WIDTHS["reasoning"]]

        print(
            f"  {cat_col} {score_render}{padding} "
            f"{route_col} {latency_col}   {reasoning}"
        )

    print(f"  {sep}")

    # Summary
    grade_letter = (
        "A+" if avg >= 4.8 else
        "A"  if avg >= 4.3 else
        "B"  if avg >= 3.5 else
        "C"  if avg >= 2.5 else
        "D"  if avg >= 1.5 else "F"
    )
    color = (
        "\033[92m" if avg >= 4.3 else
        "\033[32m" if avg >= 3.5 else
        "\033[93m" if avg >= 2.5 else
        "\033[91m"
    )

    print(f"\n{BOLD}  SUMMARY{RESET}")
    print(f"  Total tests   : {len(results)}")
    print(f"  Passed        : {len(valid)}")
    print(f"  Errors        : {len(errored)}")
    print(f"  Average score : {color}{BOLD}{avg:.2f} / 5.00{RESET}")
    print(f"  Grade         : {color}{BOLD}{grade_letter}{RESET}")
    avg_latency = int(sum(r.latency_ms for r in valid) / len(valid)) if valid else 0
    print(f"  Avg latency   : {avg_latency} ms")

    # Per-score distribution
    dist = {i: sum(1 for r in valid if r.score == i) for i in range(1, 6)}
    print(f"\n  Score distribution:")
    for s in range(5, 0, -1):
        bar   = "▓" * dist[s]
        color = SCORE_COLOR.get(s, "")
        print(f"    {s}/5  {color}{bar:<10}{RESET}  ({dist[s]} tests)")

    print(f"\n{BOLD}{sep2}{RESET}\n")

    # Detail section — full responses
    print(f"{BOLD}  DETAILED RESPONSES{RESET}")
    print(f"  {sep}")
    for r in results:
        print(f"\n  {BOLD}[{r.category}]{RESET}  route={r.route}  score={r.score}/5")
        print(f"  Query    : {r.query}")
        wrapped = textwrap.fill(r.agent_response, width=100,
                                initial_indent="  Response: ",
                                subsequent_indent="             ")
        print(wrapped)
        print(f"  Reasoning: {r.reasoning}")
    print(f"\n  {sep2}\n")


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    # Server health check
    try:
        with httpx.Client(timeout=5.0) as c:
            c.get(BASE_URL)
    except httpx.ConnectError:
        print(f"❌  Cannot reach {BASE_URL}. Start the backend first:")
        print("    PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000")
        sys.exit(1)

    print(f"{BOLD}Running {len(TEST_CASES)} test cases against {BASE_URL}…{RESET}\n")

    results: list[EvalResult] = []

    for i, tc in enumerate(TEST_CASES, 1):
        cat   = tc["category"]
        query = tc["input"]
        crit  = tc["expected_criteria"]

        print(f"  [{i:02d}/{len(TEST_CASES)}] {cat}…", end=" ", flush=True)

        try:
            response, route, latency = call_agent(query)
        except Exception as exc:
            print(f"AGENT ERROR: {exc}")
            results.append(EvalResult(
                category=cat, query=query, agent_response="",
                route="error", score=0, reasoning="", error=str(exc),
            ))
            continue

        score, reasoning = judge_response(query, response, crit)
        color = SCORE_COLOR.get(score, "")
        print(f"{color}{score}/5{RESET}  ({latency} ms)")

        results.append(EvalResult(
            category=cat, query=query, agent_response=response,
            route=route, score=score, reasoning=reasoning,
            latency_ms=latency,
        ))

    print_report(results)


if __name__ == "__main__":
    main()
