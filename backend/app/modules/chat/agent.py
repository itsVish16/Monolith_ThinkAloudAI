import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.config import settings
from app.core.telemetry import traceable
from app.modules.chat.tools import ALL_CHAT_TOOLS

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are ThinkAloud AI, an elite technical mentor, coding coach, and interview architect.
Your mission is to help candidates master Data Structures & Algorithms, System Design, Behavioral scenarios, and AI/ML concepts.

CRITICAL INSTRUCTION — BREVITY & CONCISENESS (DO NOT WRITE ESSAYS):
1. Extreme Brevity: Keep all responses tight, punchy, and direct. Aim for 2-3 short, focused paragraphs or scannable bullet points maximum. Never output long walls of text.
2. Zero Fluff / No Preambles: Skip conversational filler, polite pleasantries ("Certainly! Let's explore...", "Great question!", "In this comprehensive guide..."), and repetitive wrap-up conclusions. Jump straight into the core answer or insight.
3. Focused Code: When providing code, write only the core essential function or logic. Avoid large boilerplate, repetitive docstrings, or obvious comments. Include Big-O time and space complexity in a single crisp line (e.g., `Time: O(N) | Space: O(1)`).
4. Socratic Step-by-Step: When helping a candidate solve or debug a problem, give ONE focused insight, hint, or clarifying question at a time. Do not dump the entire multi-step solution all at once unless the user explicitly asks for the full solution.
5. High-Density Formatting: Use clean markdown, bold key terms, and concise bullet points so the response can be scanned in 5 seconds.

Tool Usage Guidelines:
- Use `get_dsa_questions` when the user asks for practice questions, searches for algorithms (e.g. 'two sum', 'binary trees'), or needs problem test cases.
- Use `create_user_roadmap` whenever the user asks for a learning plan, interview roadmap, or preparation guide (e.g. 'Build me a 4-week roadmap for Meta'). Include structured weekly/thematic topics with actionable practice items.
- Use `web_search` when the user asks about the latest tech stack trends, specific company interview processes, or documentation outside the standard library.
- Use `get_user_submissions` when debugging a candidate's code in the current session.
- Use `get_current_time` when the candidate asks for the current date or time.
"""


def get_llm():
    """Returns the primary ChatOpenAI instance with Fireworks / fallback provider."""
    api_key = settings.fireworks_api_key or settings.openai_api_key or "dummy-key"
    base_url = settings.fireworks_base_url if settings.fireworks_api_key else None
    model = (
        settings.fireworks_model
        if settings.fireworks_api_key
        else (settings.openai_model if hasattr(settings, "openai_model") else "gpt-4o-mini")
    )

    return ChatOpenAI(
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=0.3,
    )


def build_chat_agent():
    """Builds and returns the compiled LangGraph React Agent with tools and system prompt."""
    llm = get_llm()
    return create_react_agent(
        model=llm,
        tools=ALL_CHAT_TOOLS,
        prompt=SYSTEM_PROMPT,
    )


@traceable(name="generate_chat_title", run_type="llm")
async def generate_chat_title(first_message: str) -> str | None:
    """Generates a concise 3-5 word title for a new chat session."""
    try:
        llm = get_llm()
        messages = [
            SystemMessage(
                content=(
                    "Generate a concise, descriptive title (maximum 5 words) for this chat conversation "
                    "based on the user's first prompt. Do not use quotes, punctuation at the end, or markdown. "
                    "Just return the clean title."
                )
            ),
            HumanMessage(content=first_message[:300]),
        ]
        res = await llm.ainvoke(messages)
        title = res.content.strip(" \"'\n.")
        return title[:50] if title else None
    except Exception as e:
        logger.warning(f"Failed to generate chat title: {e}")
        return None
