import asyncio
import json
import re
from typing import Any

import structlog
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.redis import get_redis
from app.core.telemetry import traceable
from app.modules.dsa.models import CodeSubmission
from app.modules.interview.models import InterviewSession
from app.modules.interview.service import InterviewService
from app.tasks.queue import register_task
from app.voice_agent.llm import call_analysis_llm
from app.voice_agent.prompts import POST_INTERVIEW_ANALYSIS_PROMPT

logger = structlog.get_logger(__name__)

LEADERBOARD_KEY = "thinkaloud:leaderboard:global"


def format_transcript(messages: list[dict[str, str]]) -> str:
    """Formats raw message list into a clean interviewer/candidate script."""
    transcript = ""
    for msg in messages:
        if msg.get("role") == "system":
            continue
        role = "Interviewer" if msg.get("role") == "assistant" else "Candidate"
        content = msg.get("content", "")
        # Clean internal tags
        content = re.sub(r"\[Candidate Visual Observation:.*?\]\s*", "", content)
        content = re.sub(r"\[Candidate Whiteboard Observation:.*?\]\s*", "", content)
        content = re.sub(r"\[SYSTEM:.*?\]\s*", "", content)
        content = re.sub(r"\[DIRECT\]\s*", "", content)
        content = re.sub(r"\[BRIDGE\]\s*", "", content)
        if content.strip():
            transcript += f"{role}: {content.strip()}\n\n"
    return transcript


def extract_speaking_analytics(messages: list[dict[str, str]]) -> dict[str, Any]:
    """Calculates word count, talk ratio, and speech filler occurrences."""
    candidate_words = 0
    ai_words = 0
    filler_counts = {"umm": 0, "like": 0, "basically": 0}

    for msg in messages:
        if msg.get("role") == "system":
            continue
        content = msg.get("content", "")
        content = re.sub(r"\[Candidate Visual Observation:.*?\]\s*", "", content)
        content = re.sub(r"\[Candidate Whiteboard Observation:.*?\]\s*", "", content)
        content = re.sub(r"\[SYSTEM:.*?\]\s*", "", content)

        words = content.split()
        if msg.get("role") == "assistant":
            ai_words += len(words)
        else:
            candidate_words += len(words)
            text_lower = content.lower()
            filler_counts["umm"] += len(re.findall(r"\bumm+\b", text_lower))
            filler_counts["like"] += len(re.findall(r"\blike\b", text_lower))
            filler_counts["basically"] += len(re.findall(r"\bbasically\b", text_lower))

    total_words = candidate_words + ai_words
    candidate_pct = int(candidate_words / total_words * 100) if total_words > 0 else 0
    ai_pct = int(ai_words / total_words * 100) if total_words > 0 else 0

    return {
        "candidate_percentage": candidate_pct,
        "ai_percentage": ai_pct,
        "filler_words": filler_counts,
    }


async def get_code_submissions_for_session(session_id: str) -> str:
    """
    Retrieves all formal code submissions or latest editor snapshots for a given session.
    Direct database lookup in PostgreSQL without needing HTTP microservice hops.
    """
    async with SessionLocal() as db:
        stmt = (
            select(CodeSubmission)
            .where(CodeSubmission.session_id == session_id)
            .order_by(CodeSubmission.created_at.asc())
        )
        res = await db.execute(stmt)
        submissions = list(res.scalars().all())

        if submissions:
            formatted = ""
            for i, sub in enumerate(submissions):
                formatted += f"--- Submission {i+1} ---\n"
                formatted += f"Language: {sub.language}\n"
                formatted += f"Status: {sub.status}\n"
                if sub.passed_tests is not None and sub.total_tests is not None:
                    formatted += f"Test Cases Passed: {sub.passed_tests} / {sub.total_tests}\n"
                if sub.execution_time_ms:
                    formatted += f"Execution Runtime: {sub.execution_time_ms} ms\n"
                if sub.error_message:
                    formatted += f"Error: {sub.error_message}\n"
                formatted += f"Code:\n{sub.code}\n\n"
            return formatted

        # Fallback to session state snapshot
        sess_stmt = select(InterviewSession).where(InterviewSession.id == session_id)
        sess_res = await db.execute(sess_stmt)
        session = sess_res.scalar_one_or_none()
        if session and session.state_data:
            latest_code = session.state_data.get("latest_code")
            latest_exec = session.state_data.get("latest_execution")
            if latest_code:
                formatted = "--- Latest Unsubmitted Code Snapshot ---\n"
                if latest_exec:
                    formatted += f"Execution Result: {latest_exec}\n"
                formatted += f"Code:\n{latest_code}\n\n"
                return formatted

    return "No code submissions or editor code found."


@register_task("interview_analysis")
@traceable(name="analyze_and_save_interview", run_type="chain")
async def analyze_and_save_interview(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Background Task Handler for Post-Interview LLM Judge evaluation.
    Replaces RabbitMQ worker with direct Redis task execution and direct PostgreSQL persistence.
    """
    session_id = payload["session_id"]
    user_id_raw = payload.get("user_id", "1")
    candidate_name = payload.get("candidate_name", "Candidate")
    interview_type = payload.get("interview_type", "Behavioral")
    messages = payload.get("messages", [])
    opik_trace_id = payload.get("opik_trace_id")

    try:
        user_id = int(user_id_raw)
    except (ValueError, TypeError):
        user_id = 1

    logger.info("starting_interview_analysis", session_id=session_id, user_id=user_id, interview_type=interview_type)

    try:
        redis_pub = await get_redis()
        chunk_payload = {
            "type": "chunk",
            "content": f"Initiating post-interview analysis for session {session_id}...",
            "interview_id": session_id,
            "session_id": session_id,
        }
        await redis_pub.publish("interview_events", json.dumps(chunk_payload))
    except Exception as chunk_err:
        logger.warning("redis_chunk_publish_error", error=str(chunk_err))

    transcript = format_transcript(messages)
    code_subs_text = await get_code_submissions_for_session(session_id)
    speaking_analytics = extract_speaking_analytics(messages)

    # Track schema selection
    i_type = interview_type.lower()
    if "system_design" in i_type or "sd" in i_type:
        schema_str = """{
        "requirements_gathering": <int 0-100>,
        "high_level_architecture": <int 0-100>,
        "scalability_and_capacity": <int 0-100>,
        "trade_off_reasoning": <int 0-100>,
        "communication": <int 0-100>
    }"""
    elif "behavioral" in i_type or "hr" in i_type:
        schema_str = """{
        "star_structure": <int 0-100>,
        "specificity": <int 0-100>,
        "ownership_and_impact": <int 0-100>,
        "clarity": <int 0-100>,
        "conciseness": <int 0-100>
    }"""
    elif "pm" in i_type or "product" in i_type:
        schema_str = """{
        "user_empathy_and_scoping": <int 0-100>,
        "product_sense_and_vision": <int 0-100>,
        "prioritization_framework": <int 0-100>,
        "metrics_and_tradeoffs": <int 0-100>,
        "communication": <int 0-100>
    }"""
    elif "ai" in i_type or "ml" in i_type:
        schema_str = """{
        "ml_fundamentals": <int 0-100>,
        "model_selection": <int 0-100>,
        "data_processing": <int 0-100>,
        "system_architecture": <int 0-100>,
        "communication": <int 0-100>
    }"""
    else:
        schema_str = """{
        "algorithms": <int 0-100>,
        "time_complexity": <int 0-100>,
        "edge_cases": <int 0-100>,
        "optimization": <int 0-100>,
        "code_quality": <int 0-100>
    }"""

    prompt = POST_INTERVIEW_ANALYSIS_PROMPT.format(
        interview_type=interview_type,
        transcript=transcript,
        code_submissions=code_subs_text,
        technical_breakdown_schema=schema_str,
    )

    eval_messages = [{"role": "user", "content": prompt}]
    system_prompt = "You are an expert Senior Hiring Manager and Bar Raiser evaluating a technical mock interview."

    # Handle short sessions gracefully
    if len(messages) < 3:
        logger.warning("transcript_too_short_for_deep_analysis", session_id=session_id)
        fallback_data = {
            "technical_score": 0,
            "communication_score": 0,
            "english_score": 0,
            "strengths": ["Session ended before sufficient conversation data could be recorded."],
            "weaknesses": ["Candidate disconnected shortly after initial check."],
            "improvement_plan": ["Complete a full 30-45 minute interview session to receive complete rubric scores."],
            "recommended_topics": [],
            "detailed_metrics": {
                "overall_score": 0,
                "hiring_decision": "Reject",
                "executive_summary": "The interview session was ended immediately without sufficient conversation.",
                "speaking_analytics": speaking_analytics,
            },
        }

        async with SessionLocal() as db:
            await InterviewService.save_feedback(
                db=db,
                session_id=session_id,
                technical_score=0,
                communication_score=0,
                english_score=0,
                strengths=fallback_data["strengths"],
                weaknesses=fallback_data["weaknesses"],
                improvement_plan=fallback_data["improvement_plan"],
                recommended_topics=fallback_data["recommended_topics"],
                detailed_metrics=fallback_data["detailed_metrics"],
            )

        try:
            redis = await get_redis()
            event_payload = {
                "type": "completed",
                "event": "InterviewCompleted",
                "evaluation": {
                    "id": session_id,
                    "session_id": session_id,
                    "technical_score": 0,
                    "communication_score": 0,
                    "english_score": 0,
                    "overall_score": 0,
                    "strengths": fallback_data["strengths"],
                    "weaknesses": fallback_data["weaknesses"],
                    "improvement_plan": fallback_data["improvement_plan"],
                    "recommended_topics": fallback_data["recommended_topics"],
                    "detailed_metrics": fallback_data["detailed_metrics"],
                },
                "data": {
                    "interview_id": session_id,
                    "user_id": user_id,
                    "score": 0,
                    "type": interview_type,
                    "technical_score": 0,
                    "communication_score": 0,
                    "english_score": 0,
                    "detailed_metrics": fallback_data["detailed_metrics"],
                },
            }
            await redis.publish("interview_events", json.dumps(event_payload))
        except Exception as redis_pub_err:
            logger.warning("redis_publish_fallback_event_error", error=str(redis_pub_err))

        return fallback_data

    # Multi-attempt resilient LLM evaluation
    data = None
    for attempt in range(3):
        try:
            raw_response = await call_analysis_llm(eval_messages, system_prompt, opik_trace_id=opik_trace_id)
            cleaned = raw_response.strip()
            if "```" in cleaned:
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
                cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()
            start_idx = cleaned.find("{")
            end_idx = cleaned.rfind("}")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                cleaned = cleaned[start_idx : end_idx + 1]
            data = json.loads(cleaned)
            break
        except Exception as e:
            logger.warning("analysis_llm_attempt_failed", attempt=attempt + 1, error=str(e))
            if attempt == 2:
                raise
            await asyncio.sleep(2 ** attempt)

    if not data:
        raise RuntimeError(f"Failed to generate evaluation data for session {session_id}")

    # Compute domain-weighted score
    tech_raw = float(data.get("technical_score", 0))
    comm_raw = float(data.get("communication_score", 0))
    eng_raw = float(data.get("english_score", 0))

    tech = round(tech_raw * 10) if 0 < tech_raw <= 10.0 else round(tech_raw)
    comm = round(comm_raw * 10) if 0 < comm_raw <= 10.0 else round(comm_raw)
    eng = round(eng_raw * 10) if 0 < eng_raw <= 10.0 else round(eng_raw)

    tech = min(100, max(0, tech))
    comm = min(100, max(0, comm))
    eng = min(100, max(0, eng))

    overall_score = InterviewService.compute_domain_weighted_score(
        interview_type=interview_type,
        tech=tech,
        comm=comm,
        eng=eng,
        detailed_metrics=data.get("detailed_metrics"),
    )

    detailed_metrics = {
        "overall_score": overall_score,
        "hiring_decision": data.get("hiring_decision", "Borderline"),
        "executive_summary": data.get("executive_summary", ""),
        "technical_breakdown": data.get("technical_breakdown", {}),
        "communication_breakdown": data.get("communication_breakdown", {}),
        "speaking_analytics": speaking_analytics,
    }

    # 1. Save directly to InterviewFeedback in PostgreSQL
    async with SessionLocal() as db:
        await InterviewService.save_feedback(
            db=db,
            session_id=session_id,
            technical_score=tech,
            communication_score=comm,
            english_score=eng,
            strengths=data.get("strengths", []),
            weaknesses=data.get("weaknesses", []),
            improvement_plan=data.get("improvement_plan", []),
            recommended_topics=data.get("recommended_topics", []),
            detailed_metrics=detailed_metrics,
        )

        # 2. Record analytics & progress tracking directly in PostgreSQL
        stats = None
        try:
            from app.modules.analytics.service import AnalyticsService

            redis_client = await get_redis()
            stats = await AnalyticsService.record_interview_completion(
                db=db,
                user_id=user_id,
                session_id=session_id,
                interview_type=interview_type,
                score=overall_score,
                metadata=detailed_metrics,
                redis=redis_client,
            )
        except Exception as analytics_err:
            logger.warning("analytics_record_error", error=str(analytics_err))

        # 3. Email full evaluation scorecard to candidate
        try:
            session_rec = await InterviewService.get_session(db, session_id)
            cand_email = None
            if session_rec:
                cand_email = session_rec.candidate_email
                if not cand_email and session_rec.state_data:
                    cand_email = session_rec.state_data.get("candidate_email")

            if cand_email:
                from app.modules.auth.email_service import send_interview_report_email
                await send_interview_report_email(
                    to_email=cand_email,
                    candidate_name=candidate_name,
                    interview_type=interview_type,
                    overall_score=overall_score,
                    tech_score=tech,
                    comm_score=comm,
                    eng_score=eng,
                    strengths=data.get("strengths", []),
                    weaknesses=data.get("weaknesses", []),
                    executive_summary=data.get("executive_summary", ""),
                )
                logger.info("interview_report_emailed_to_candidate", session_id=session_id, email=cand_email)
        except Exception as email_err:
            logger.warning("failed_to_email_candidate_report", error=str(email_err), session_id=session_id)

    # 3. Publish to Redis pub/sub channel for instant frontend UI reactivity
    try:
        redis = await get_redis()
        event_payload = {
            "type": "completed",
            "event": "InterviewCompleted",
            "evaluation": {
                "id": session_id,
                "session_id": session_id,
                "technical_score": tech,
                "communication_score": comm,
                "english_score": eng,
                "overall_score": overall_score,
                "strengths": data.get("strengths", []),
                "weaknesses": data.get("weaknesses", []),
                "improvement_plan": data.get("improvement_plan", []),
                "recommended_topics": data.get("recommended_topics", []),
                "detailed_metrics": detailed_metrics,
            },
            "data": {
                "interview_id": session_id,
                "user_id": user_id,
                "score": overall_score,
                "type": interview_type,
                "technical_score": tech,
                "communication_score": comm,
                "english_score": eng,
                "detailed_metrics": detailed_metrics,
            },
        }
        await redis.publish("interview_events", json.dumps(event_payload))
        # Update global leaderboard
        # Standardized key: thinkaloud:leaderboard:global, member: str(user_id), score: float(rating)
        user_rating = float(stats.rating) if stats and hasattr(stats, "rating") else 1200.0
        await redis.zadd(LEADERBOARD_KEY, {str(user_id): user_rating})
    except Exception as redis_pub_err:
        logger.warning("redis_publish_event_error", error=str(redis_pub_err))

    logger.info("interview_analysis_completed_successfully", session_id=session_id, overall_score=overall_score)
    return {
        "session_id": session_id,
        "overall_score": overall_score,
        "hiring_decision": detailed_metrics["hiring_decision"],
    }
