import datetime
import json
import logging
import os
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from sqlalchemy import select

from app.config import settings
from app.core.database import SessionLocal
from app.modules.dsa.models import CodeSubmission, DSAQuestion
from app.modules.tracks.models import Roadmap, RoadmapItem, RoadmapTopic

logger = logging.getLogger(__name__)

TOOL_REGISTRY = {
    "get_dsa_questions": {
        "title": "Fetch DSA Questions",
        "icon": "database",
        "description": "Loading solved and practice problems",
    },
    "web_search": {
        "title": "Search Web",
        "icon": "globe",
        "description": "Searching latest technical info",
    },
    "create_user_roadmap": {
        "title": "Generate Roadmap",
        "icon": "sparkles",
        "description": "Building personalized learning plan",
    },
    "get_user_submissions": {
        "title": "Read Code Progress",
        "icon": "terminal",
        "description": "Analyzing past code submissions",
    },
    "get_current_time": {
        "title": "Check Time",
        "icon": "globe",
        "description": "Getting current local time",
    },
}


@tool
def get_current_time() -> str:
    """Returns the current date and time. Use this tool whenever the user asks for the current date or time."""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@tool
def web_search(query: str) -> str:
    """Search the web for up-to-date technical documentation, interview experiences, algorithms, or company-specific hiring standards.
    Uses Tavily API to fetch relevant results."""
    api_key = os.environ.get("TAVILY_API_KEY") or settings.tavily_api_key
    if not api_key:
        return "[Error] TAVILY_API_KEY is not configured in the environment."

    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=api_key)
        response = client.search(query=query, search_depth="basic", include_answer=True)

        results_str = f"Search Answer: {response.get('answer', 'No direct summary found.')}\n\nSources:\n"
        for idx, result in enumerate(response.get("results", [])[:3]):
            results_str += f"{idx + 1}. {result.get('title')} ({result.get('url')})\n   {result.get('content')}\n"

        return results_str
    except Exception as e:
        logger.error(f"Web search error: {e}")
        return f"[Error] Web search failed: {str(e)}"


@tool
async def get_dsa_questions(
    question_id: int | None = None, keyword: str | None = None
) -> str:
    """Use this tool to fetch DSA questions from the database.
    If question_id is provided, returns details of that specific question (including description and test cases).
    If keyword is provided, searches for questions whose title or description contains the keyword (e.g. 'Array', 'Sorting', 'Tree', 'Graph').
    If neither is provided, returns a list of available questions."""
    async with SessionLocal() as db:
        try:
            if question_id:
                result = await db.execute(
                    select(DSAQuestion).where(DSAQuestion.id == question_id)
                )
                q = result.scalars().first()
                if q:
                    return (
                        f"Title: {q.title}\n"
                        f"Difficulty: {q.difficulty}\n"
                        f"Slug: {q.slug}\n"
                        f"Description: {q.description}\n"
                        f"Test Cases: {json.dumps(q.test_cases)[:400]}..."
                    )
                return "Question not found."
            else:
                query = select(DSAQuestion)
                if keyword:
                    query = query.where(
                        DSAQuestion.title.ilike(f"%{keyword}%")
                        | DSAQuestion.description.ilike(f"%{keyword}%")
                    )
                result = await db.execute(query.limit(20))
                qs = result.scalars().all()
                if not qs:
                    return (
                        f"No questions found for keyword '{keyword}'."
                        if keyword
                        else "No questions available in the question bank."
                    )
                res = f"Available DSA Questions{' matching ' + keyword if keyword else ''} (Showing up to 20):\n"
                for q in qs:
                    res += f"- ID: {q.id}, Title: {q.title}, Difficulty: {q.difficulty}\n"
                return res
        except Exception as e:
            logger.error(f"Error fetching questions: {e}")
            return f"Error fetching questions: {str(e)}"


@tool
async def get_user_submissions(session_id: str) -> str:
    """Use this tool to fetch the candidate's latest code submissions to see what code they have written and why it might have failed.
    Pass the user's current session_id."""
    async with SessionLocal() as db:
        try:
            result = await db.execute(
                select(CodeSubmission)
                .where(CodeSubmission.session_id == session_id)
                .order_by(CodeSubmission.created_at.desc())
                .limit(5)
            )
            subs = result.scalars().all()
            if not subs:
                return "No code submissions found for this session."
            res = "User's Recent Submissions:\n\n"
            for s in subs:
                res += (
                    f"Question ID: {s.question_id}\n"
                    f"Language: {s.language}\n"
                    f"Status: {s.status}\n"
                    f"Error: {s.error_message or 'None'}\n"
                    f"Code:\n```\n{s.code}\n```\n---\n"
                )
            return res
        except Exception as e:
            logger.error(f"Error fetching submissions: {e}")
            return f"Error fetching submissions: {str(e)}"


@tool
async def create_user_roadmap(
    title: str,
    description: str,
    topics: list[dict[str, Any]],
    config: RunnableConfig,
) -> str:
    """Use this tool to generate a detailed, structured learning roadmap for the candidate based on their learning goals or target company.
    'title': Roadmap title (e.g., '4-Week Google SDE Preparation', 'Distributed Systems Roadmap').
    'description': Short summary of the objective.
    'topics': List of topic objects, each having:
      - 'title': Topic title (e.g., 'Week 1: Advanced Graph Algorithms')
      - 'items': List of item objects with 'title' (e.g. 'Dijkstra & A* Search', 'Topological Sort')
    Returns the created roadmap_id and title."""
    user_id = None
    if config and "configurable" in config:
        user_id = str(config["configurable"].get("user_id", ""))

    async with SessionLocal() as db:
        try:
            roadmap = Roadmap(
                user_id=user_id or "anonymous",
                title=title,
                description=description,
                is_general=False,
            )
            db.add(roadmap)
            await db.flush()

            for t_idx, topic_data in enumerate(topics):
                topic_title = topic_data.get("title", f"Topic {t_idx + 1}")
                topic = RoadmapTopic(
                    roadmap_id=roadmap.id,
                    title=topic_title,
                    order_index=t_idx,
                )
                db.add(topic)
                await db.flush()

                items_data = topic_data.get("items", [])
                for item_data in items_data:
                    if isinstance(item_data, str):
                        item_title = item_data
                        est_min = 30
                    else:
                        item_title = item_data.get("title", "Practice Exercise")
                        est_min = item_data.get("estimated_minutes", 30)

                    item = RoadmapItem(
                        topic_id=topic.id,
                        title=item_title,
                        content_type="custom",
                        estimated_minutes=est_min,
                        is_completed=False,
                    )
                    db.add(item)

            await db.commit()
            await db.refresh(roadmap)

            return json.dumps(
                {
                    "status": "success",
                    "roadmap_id": roadmap.id,
                    "title": roadmap.title,
                    "topics_count": len(topics),
                    "message": f"Roadmap '{roadmap.title}' (ID: {roadmap.id}) successfully created and saved to user profile!",
                }
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Error creating roadmap: {e}")
            return json.dumps({"status": "error", "message": str(e)})


ALL_CHAT_TOOLS = [
    get_current_time,
    web_search,
    get_dsa_questions,
    get_user_submissions,
    create_user_roadmap,
]
