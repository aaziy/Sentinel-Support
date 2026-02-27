"""Generates a final answer for the user.

Uses OpenAI GPT to generate context-aware responses from retrieved KB docs.
Falls back to a template-based response if OpenAI is unavailable.
"""
from __future__ import annotations

import logging
from langchain_core.messages import AIMessage

from app.core.engine.state import AgentState
from app.core.config import settings

logger = logging.getLogger(__name__)


def _call_llm(system_prompt: str, user_message: str) -> str | None:
    """Call the configured LLM provider. Tries Groq first, falls back to OpenAI."""
    # ── Groq (primary — free tier, fast) ──────────────────
    if settings.GROQ_API_KEY:
        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)
            resp = client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=600,
                temperature=0.4,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            logger.warning("Groq call failed: %s — trying OpenAI fallback", e)

    # ── OpenAI (fallback) ──────────────────────────────────
    if settings.OPENAI_API_KEY:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=600,
                temperature=0.4,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            logger.warning("OpenAI call failed: %s", e)

    return None


# Keep _call_openai as alias for backwards compat
_call_openai = _call_llm


def _build_answer_from_context(query: str, docs: list[str]) -> str:
    """Synthesise a human-readable answer from retrieved KB chunks using GPT."""
    if not docs:
        return (
            "I'm sorry, I couldn't find specific information about that in our "
            "knowledge base. Would you like me to connect you with a human agent "
            "who can help further?"
        )

    context_block = "\n\n".join(f"[Doc {i+1}]: {doc.strip()}" for i, doc in enumerate(docs[:3]))

    system_prompt = (
        "You are a helpful, professional customer support agent. "
        "Use ONLY the provided knowledge base excerpts to answer the customer's question. "
        "Be concise, friendly, and clear. Use markdown formatting (bullet points, bold) where helpful. "
        "If the docs don't fully answer the question, say so honestly and suggest escalating to a human. "
        "Never make up information not present in the docs."
    )
    user_message = (
        f"Customer question: {query}\n\n"
        f"Knowledge base excerpts:\n{context_block}\n\n"
        "Please provide a helpful answer based on the above."
    )

    gpt_answer = _call_llm(system_prompt, user_message)
    if gpt_answer:
        return gpt_answer

    # Fallback: template-based
    context_block_plain = "\n\n".join(f"• {doc.strip()}" for doc in docs[:3])
    return (
        f"Based on our knowledge base:\n\n{context_block_plain}\n\n"
        "If this doesn't fully answer your question, I can escalate to a human agent."
    )


def generate_response(state: AgentState) -> AgentState:
    """LangGraph node: compose the final response."""
    query = state["query"]
    docs = state.get("retrieved_docs") or []

    answer = _build_answer_from_context(query, docs)
    state["response"] = answer

    msgs = state.get("messages") or []
    msgs.append(AIMessage(content=answer))
    state["messages"] = msgs

    return state


def generate_clarification_response(state: AgentState) -> AgentState:
    """LangGraph node: ask the user to describe their problem before escalating."""
    system_prompt = (
        "You are a helpful customer support assistant. "
        "The user wants to speak with a human agent. "
        "Before escalating, politely ask them to briefly describe their issue "
        "so the human agent can be fully prepared to help. "
        "Keep your response to 1-2 sentences, warm and professional."
    )
    user_message = state["query"]

    gpt_answer = _call_openai(system_prompt, user_message)
    if not gpt_answer:
        gpt_answer = (
            "I'd be happy to connect you with a member of our team. "
            "Could you briefly describe your issue so they can be fully prepared to help you?"
        )

    state["response"] = gpt_answer
    state["route"] = "clarify_escalation"
    state["awaiting_problem_description"] = True
    msgs = state.get("messages") or []
    msgs.append(AIMessage(content=gpt_answer))
    state["messages"] = msgs
    state["is_escalated"] = False
    return state


def generate_direct_response(state: AgentState) -> AgentState:
    """LangGraph node: handle greetings / simple queries using GPT."""
    query = state["query"]

    system_prompt = (
        "You are a friendly, professional customer support assistant for Sentinel Support. "
        "You handle greetings, farewells, and off-topic queries briefly and warmly. "
        "For greetings: welcome the user and ask how you can help. "
        "For farewells: say goodbye warmly. "
        "For anything else: explain you can help with product questions and ask what they need. "
        "Keep responses under 2 sentences. Never make up product details."
    )

    gpt_answer = _call_openai(system_prompt, query)
    if not gpt_answer:
        # Fallback
        q = query.strip().lower()
        if any(q.startswith(g) for g in ("hi", "hello", "hey")):
            gpt_answer = "Hello! 👋 I'm the Sentinel Support assistant. How can I help you today?"
        elif any(q.startswith(g) for g in ("thank", "bye", "goodbye")):
            gpt_answer = "You're welcome! Have a great day! 🙌"
        else:
            gpt_answer = "I can help with billing, integrations, security, and more. What would you like to know?"

    state["response"] = gpt_answer
    msgs = state.get("messages") or []
    msgs.append(AIMessage(content=gpt_answer))
    state["messages"] = msgs
    state["is_escalated"] = False
    return state
