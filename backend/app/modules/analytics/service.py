from datetime import UTC, date, datetime, timedelta
from typing import Any

import structlog
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models import (
    DailyActivity,
    LearningEvent,
    UserSkillScore,
    UserStats,
)
from app.modules.analytics.schemas import (
    DailyActivityResponse,
    LeaderboardUserItem,
    RadarDimension,
    SkillScoreItem,
)
from app.modules.auth.models import User
from app.modules.interview.models import InterviewFeedback, InterviewSession

logger = structlog.get_logger(__name__)

LEADERBOARD_KEY = "thinkaloud:leaderboard:global"


class AnalyticsService:
    @classmethod
    async def get_or_create_user_stats(
        cls,
        db: AsyncSession,
        user_id: int,
    ) -> UserStats:
        """
        Retrieves UserStats for a user or initializes a new record with default rating 1200.
        """
        today = datetime.now(UTC).date()
        stmt = select(UserStats).where(UserStats.user_id == user_id)
        result = await db.execute(stmt)
        stats = result.scalar_one_or_none()
        if stats:
            # Reset streak if user was inactive for more than 1 day
            if (
                stats.last_activity_date
                and stats.last_activity_date < today - timedelta(days=1)
                and stats.current_streak > 0
            ):
                stats.current_streak = 0
                stats.updated_at = datetime.now(UTC)
                await db.commit()
                await db.refresh(stats)
            return stats

        now = datetime.now(UTC)
        stats = UserStats(
            user_id=user_id,
            problems_solved_total=0,
            problems_solved_easy=0,
            problems_solved_medium=0,
            problems_solved_hard=0,
            total_submissions=0,
            acceptance_rate=0.0,
            interviews_completed=0,
            avg_interview_score=0.0,
            best_interview_score=0,
            current_streak=0,
            longest_streak=0,
            last_activity_date=None,
            rating=1200,
            created_at=now,
            updated_at=now,
        )
        db.add(stats)
        await db.commit()
        await db.refresh(stats)
        return stats

    @classmethod
    async def recalculate_user_problem_stats(
        cls,
        db: AsyncSession,
        user_id: int,
        stats: UserStats | None = None,
    ) -> None:
        """
        Calculates distinct solved questions by difficulty directly from UserProblemStatus
        joined with DSAQuestion to eliminate count inflation and guarantee exactness.
        """
        if stats is None:
            stats = await cls.get_or_create_user_stats(db, user_id)

        from app.modules.dsa.models import DSAQuestion, UserProblemStatus

        # Query distinct solved questions by difficulty
        stmt = (
            select(DSAQuestion.difficulty, func.count(func.distinct(UserProblemStatus.question_id)))
            .join(DSAQuestion, UserProblemStatus.question_id == DSAQuestion.id)
            .where(
                UserProblemStatus.user_id == str(user_id),
                UserProblemStatus.status == "Solved",
            )
            .group_by(DSAQuestion.difficulty)
        )
        res = await db.execute(stmt)
        diff_counts = dict(res.all())

        easy = diff_counts.get("Easy", 0)
        medium = diff_counts.get("Medium", 0)
        hard = diff_counts.get("Hard", 0)

        total_from_db = easy + medium + hard
        if total_from_db > 0:
            stats.problems_solved_easy = easy
            stats.problems_solved_medium = medium
            stats.problems_solved_hard = hard
            stats.problems_solved_total = total_from_db

        if stats.total_submissions > 0:
            stats.acceptance_rate = round(
                (stats.problems_solved_total / stats.total_submissions) * 100.0,
                2,
            )

    @staticmethod
    def calculate_and_update_streak(
        stats: UserStats,
        today: date | None = None,
    ) -> tuple[int, int]:
        """
        Calculates consecutive active days streak.
        Returns (current_streak, longest_streak).
        """
        today = today or datetime.now(UTC).date()
        last_date = stats.last_activity_date

        if last_date is None:
            stats.current_streak = 1
        elif last_date == today:
            # Already active today, streak remains steady
            pass
        elif last_date == today - timedelta(days=1):
            # Logged activity on consecutive day
            stats.current_streak += 1
        else:
            # Streak broken
            stats.current_streak = 1

        stats.longest_streak = max(stats.longest_streak, stats.current_streak)
        stats.last_activity_date = today
        return stats.current_streak, stats.longest_streak

    @classmethod
    async def log_activity(
        cls,
        db: AsyncSession,
        user_id: int,
        activity_type: str,
        count: int = 1,
        study_minutes: int = 0,
        domain: str | None = None,
        reference_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> DailyActivity:
        """
        Authoritative event logger that records daily progress, updates streaks,
        and creates learning timeline events.
        """
        today = datetime.now(UTC).date()
        stats = await cls.get_or_create_user_stats(db, user_id)
        cls.calculate_and_update_streak(stats, today=today)

        # Upsert DailyActivity
        stmt = (
            select(DailyActivity)
            .where(DailyActivity.user_id == user_id)
            .where(DailyActivity.activity_date == today)
        )
        result = await db.execute(stmt)
        daily = result.scalar_one_or_none()

        if not daily:
            daily = DailyActivity(
                user_id=user_id,
                activity_date=today,
                problems_solved=0,
                problems_attempted=0,
                submissions_count=0,
                interviews_done=0,
                study_minutes=0,
            )
            db.add(daily)

        if activity_type == "PROBLEM_SOLVED":
            daily.problems_solved += count
            stats.problems_solved_total += count
            if stats.total_submissions > 0:
                stats.acceptance_rate = round(
                    (stats.problems_solved_total / stats.total_submissions) * 100.0,
                    2,
                )
            await cls.recalculate_user_problem_stats(db, user_id, stats)
        elif activity_type == "PROBLEM_ATTEMPTED":
            daily.problems_attempted += count
        elif activity_type == "SUBMISSION":
            daily.submissions_count += count
            stats.total_submissions += count
            if stats.total_submissions > 0:
                stats.acceptance_rate = round(
                    (stats.problems_solved_total / stats.total_submissions) * 100.0,
                    2,
                )
        elif activity_type == "INTERVIEW_COMPLETED":
            daily.interviews_done += count

        if study_minutes > 0:
            daily.study_minutes += study_minutes

        # Update UserSkillScore if domain is indicated
        if domain:
            skill_stmt = (
                select(UserSkillScore)
                .where(UserSkillScore.user_id == user_id)
                .where(UserSkillScore.domain == domain)
            )
            skill_res = await db.execute(skill_stmt)
            skill = skill_res.scalar_one_or_none()
            now = datetime.now(UTC)
            if not skill:
                skill = UserSkillScore(
                    user_id=user_id,
                    domain=domain,
                    score=60.0,
                    problems_solved=0,
                    interviews_done=0,
                    updated_at=now,
                )
                db.add(skill)

            if activity_type == "PROBLEM_SOLVED":
                skill.problems_solved += count
                skill.score = min(100.0, skill.score + (count * 1.5))
            elif activity_type == "INTERVIEW_COMPLETED":
                skill.interviews_done += count
            skill.updated_at = now

        # Append LearningEvent audit log
        event = LearningEvent(
            user_id=user_id,
            event_type=activity_type,
            reference_id=reference_id,
            score_change=float(count),
            domain=domain,
            metadata_json=metadata or {},
            created_at=datetime.now(UTC),
        )
        db.add(event)

        stats.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(daily)
        return daily

    @classmethod
    async def record_interview_completion(
        cls,
        db: AsyncSession,
        user_id: int,
        session_id: str,
        interview_type: str,
        score: int,
        metadata: dict[str, Any] | None = None,
        redis: Redis | None = None,
    ) -> UserStats:
        """
        Aggregates stats upon completion of a mock interview session:
        - normalizes score to [0, 100]
        - checks for existing event to prevent double-counting on retries/re-analysis
        - calculates authoritative counts and averages from PostgreSQL InterviewFeedback
        - updates DailyActivity and UserSkillScore idempotently
        - logs LearningEvent
        - syncs leaderboard in Redis if available
        """
        today = datetime.now(UTC).date()
        stats = await cls.get_or_create_user_stats(db, user_id)

        # Normalize score
        normalized_score = int(round(score * 10)) if 0 < score <= 10 else int(round(score))
        normalized_score = min(100, max(0, normalized_score))

        # Check if interview was already logged for this session to ensure idempotency
        ev_stmt = select(LearningEvent).where(
            LearningEvent.user_id == user_id,
            LearningEvent.event_type == "INTERVIEW_COMPLETED",
            LearningEvent.reference_id == session_id,
        )
        ev_res = await db.execute(ev_stmt)
        existing_event = ev_res.scalar_one_or_none()
        is_first_record = existing_event is None

        if is_first_record:
            cls.calculate_and_update_streak(stats, today=today)

        # Authoritative aggregate calculation from InterviewFeedback joined with InterviewSession
        agg_stmt = (
            select(
                func.count(InterviewFeedback.session_id),
                func.avg(InterviewFeedback.overall_score),
                func.max(InterviewFeedback.overall_score),
            )
            .join(InterviewSession, InterviewFeedback.session_id == InterviewSession.id)
            .where(InterviewSession.user_id == user_id)
        )
        agg_res = await db.execute(agg_stmt)
        fb_count, fb_avg, fb_max = agg_res.one()

        if fb_count and fb_count > 0:
            stats.interviews_completed = int(fb_count)
            stats.avg_interview_score = round(float(fb_avg or normalized_score), 2)
            stats.best_interview_score = int(fb_max or normalized_score)
        else:
            if is_first_record:
                total_prev = stats.interviews_completed
                new_total = total_prev + 1
                new_avg = round(((stats.avg_interview_score * total_prev) + normalized_score) / new_total, 2)
                stats.interviews_completed = new_total
                stats.avg_interview_score = new_avg
                stats.best_interview_score = max(stats.best_interview_score, normalized_score)
            else:
                stats.best_interview_score = max(stats.best_interview_score, normalized_score)

        if is_first_record:
            # Rating adjustment: positive delta if score > 70
            rating_delta = int((normalized_score - 70) * 0.5)
            stats.rating = max(500, stats.rating + rating_delta)

        stats.updated_at = datetime.now(UTC)

        # Log Daily Activity (only increment if first time recording this session)
        stmt = (
            select(DailyActivity)
            .where(DailyActivity.user_id == user_id)
            .where(DailyActivity.activity_date == today)
        )
        res = await db.execute(stmt)
        daily = res.scalar_one_or_none()
        if not daily:
            daily = DailyActivity(
                user_id=user_id,
                activity_date=today,
                problems_solved=0,
                problems_attempted=0,
                submissions_count=0,
                interviews_done=1 if is_first_record else 0,
                study_minutes=45 if is_first_record else 0,
            )
            db.add(daily)
        elif is_first_record:
            daily.interviews_done += 1
            daily.study_minutes += 45

        # Update domain skill score
        domain = interview_type or "General"
        skill_stmt = (
            select(UserSkillScore)
            .where(UserSkillScore.user_id == user_id)
            .where(UserSkillScore.domain == domain)
        )
        s_res = await db.execute(skill_stmt)
        skill = s_res.scalar_one_or_none()
        now = datetime.now(UTC)
        if not skill:
            skill = UserSkillScore(
                user_id=user_id,
                domain=domain,
                score=float(normalized_score),
                problems_solved=0,
                interviews_done=1 if is_first_record else 0,
                updated_at=now,
            )
            db.add(skill)
        elif is_first_record:
            skill.interviews_done += 1
            skill.score = round(((skill.score * (skill.interviews_done - 1)) + normalized_score) / skill.interviews_done, 2)
            skill.updated_at = now
        else:
            skill.updated_at = now

        # Add or update learning event
        if is_first_record:
            event = LearningEvent(
                user_id=user_id,
                event_type="INTERVIEW_COMPLETED",
                reference_id=session_id,
                score_change=float(normalized_score),
                domain=domain,
                metadata_json=metadata or {"score": normalized_score},
                created_at=now,
            )
            db.add(event)
        else:
            existing_event.score_change = float(normalized_score)
            if metadata:
                existing_event.metadata_json = metadata

        await db.commit()
        await db.refresh(stats)

        # Sync to Redis global leaderboard if client connected
        if redis:
            try:
                await redis.zadd(LEADERBOARD_KEY, {str(user_id): float(stats.rating)})
            except Exception as e:
                logger.warning("redis_leaderboard_sync_failed", error=str(e))

        return stats

    @classmethod
    async def get_activity_heatmap(
        cls,
        db: AsyncSession,
        user_id: int,
        days: int = 365,
    ) -> list[DailyActivityResponse]:
        """
        Fetches daily activity records over the specified interval for heatmap display.
        """
        start_date = datetime.now(UTC).date() - timedelta(days=days)
        stmt = (
            select(DailyActivity)
            .where(DailyActivity.user_id == user_id)
            .where(DailyActivity.activity_date >= start_date)
            .order_by(DailyActivity.activity_date.asc())
        )
        result = await db.execute(stmt)
        records = result.scalars().all()

        return [
            DailyActivityResponse(
                activity_date=r.activity_date,
                date=r.activity_date.isoformat(),
                problems_solved=r.problems_solved,
                problems_attempted=r.problems_attempted,
                submissions_count=r.submissions_count,
                interviews_done=r.interviews_done,
                study_minutes=r.study_minutes,
                count=r.problems_solved + r.interviews_done + (1 if r.submissions_count > 0 else 0),
            )
            for r in records
        ]

    @classmethod
    async def get_user_skill_scores(
        cls,
        db: AsyncSession,
        user_id: int,
    ) -> tuple[list[SkillScoreItem], list[RadarDimension]]:
        """
        Retrieves skill proficiency per domain and generates radar dimensions.
        """
        stmt = (
            select(UserSkillScore)
            .where(UserSkillScore.user_id == user_id)
            .order_by(UserSkillScore.score.desc())
        )
        result = await db.execute(stmt)
        skills = result.scalars().all()

        skill_items = [
            SkillScoreItem(
                domain=s.domain,
                score=round(s.score, 1),
                problems_solved=s.problems_solved,
                interviews_done=s.interviews_done,
                updated_at=s.updated_at,
            )
            for s in skills
        ]

        # Fetch past completed interview feedback to compute radar dimensions if specific domains missing
        fb_stmt = (
            select(InterviewFeedback)
            .join(InterviewSession, InterviewFeedback.session_id == InterviewSession.id)
            .where(InterviewSession.user_id == user_id)
        )
        fb_res = await db.execute(fb_stmt)
        feedbacks = fb_res.scalars().all()

        tech_scores = [f.technical_score for f in feedbacks if f.technical_score]
        comm_scores = [f.communication_score for f in feedbacks if f.communication_score]
        eng_scores = [f.english_score for f in feedbacks if f.english_score]

        def avg_or_default(arr: list[int | None], default: float = 70.0) -> float:
            clean = [x for x in arr if x is not None and x > 0]
            return round(sum(clean) / len(clean), 1) if clean else default

        radar_data = [
            RadarDimension(subject="Technical Problem Solving", A=avg_or_default(tech_scores, 75.0)),
            RadarDimension(subject="System Architecture", A=avg_or_default(tech_scores, 70.0)),
            RadarDimension(subject="Communication", A=avg_or_default(comm_scores, 80.0)),
            RadarDimension(subject="Fluency & Articulation", A=avg_or_default(eng_scores, 85.0)),
            RadarDimension(subject="Algorithmic Speed", A=72.0),
        ]

        return skill_items, radar_data

    @classmethod
    async def get_leaderboard(
        cls,
        db: AsyncSession,
        redis: Redis | None,
        current_user_id: int,
        limit: int = 10,
    ) -> tuple[list[LeaderboardUserItem], LeaderboardUserItem | None]:
        """
        Fetches global top ranked users and the current candidate's relative position.
        Implements cache-first strategy: checks Redis sorted set first, falling back to
        PostgreSQL and repopulating Redis if empty or unavailable.
        """
        leaderboard: list[LeaderboardUserItem] = []
        cached_entries: list[Any] | None = None

        # 1. Check Redis sorted set first
        if redis:
            try:
                cached_entries = await redis.zrevrange(LEADERBOARD_KEY, 0, limit - 1, withscores=True)
            except Exception as e:
                logger.warning("redis_leaderboard_read_failed", error=str(e))
                cached_entries = None

        if cached_entries:
            # Parse user IDs from Redis members
            user_ids: list[int] = []
            for item in cached_entries:
                member = item[0]
                uid_str = member.decode("utf-8") if isinstance(member, bytes) else str(member)
                try:
                    user_ids.append(int(uid_str))
                except (ValueError, TypeError):
                    continue

            # Batch-fetch User profiles and stats quickly without full table scans
            users_map = {}
            if user_ids:
                stmt = (
                    select(User, UserStats)
                    .outerjoin(UserStats, User.id == UserStats.user_id)
                    .where(User.id.in_(user_ids))
                )
                res = await db.execute(stmt)
                users_map = {u.id: (u, s) for u, s in res.all()}

            for idx, item in enumerate(cached_entries):
                member, score = item
                uid_str = member.decode("utf-8") if isinstance(member, bytes) else str(member)
                try:
                    uid = int(uid_str)
                except (ValueError, TypeError):
                    continue

                user_pair = users_map.get(uid)
                if user_pair:
                    user_obj, stats_obj = user_pair
                    candidate_name = user_obj.full_name or user_obj.username or f"User {uid}"
                    username = user_obj.username
                    interviews_completed = stats_obj.interviews_completed if stats_obj else 0
                    problems_solved = stats_obj.problems_solved_total if stats_obj else 0
                else:
                    candidate_name = f"User {uid}"
                    username = None
                    interviews_completed = 0
                    problems_solved = 0

                rating = int(score)
                leaderboard.append(
                    LeaderboardUserItem(
                        rank=idx + 1,
                        user_id=uid,
                        candidate_name=candidate_name,
                        username=username,
                        score=rating,
                        rating=rating,
                        interviews_completed=interviews_completed,
                        problems_solved=problems_solved,
                    )
                )
        else:
            # 2. Fall back to PostgreSQL database query
            stmt = (
                select(UserStats, User)
                .join(User, UserStats.user_id == User.id)
                .order_by(UserStats.rating.desc(), UserStats.interviews_completed.desc())
                .limit(max(limit, 100))
            )
            result = await db.execute(stmt)
            rows = result.all()

            repopulate_mapping: dict[str, float] = {}
            for idx, (stats_obj, user_obj) in enumerate(rows):
                if idx < limit:
                    leaderboard.append(
                        LeaderboardUserItem(
                            rank=idx + 1,
                            user_id=user_obj.id,
                            candidate_name=user_obj.full_name or user_obj.username,
                            username=user_obj.username,
                            score=stats_obj.rating,
                            rating=stats_obj.rating,
                            interviews_completed=stats_obj.interviews_completed,
                            problems_solved=stats_obj.problems_solved_total,
                        )
                    )
                repopulate_mapping[str(user_obj.id)] = float(stats_obj.rating)

            # Repopulate Redis sorted set with standardized member str(user_id) and float(rating)
            if redis and repopulate_mapping:
                try:
                    await redis.zadd(LEADERBOARD_KEY, repopulate_mapping)
                except Exception as e:
                    logger.warning("redis_leaderboard_repopulate_failed", error=str(e))

        # Get current user stats and calculate relative position
        my_stats = await cls.get_or_create_user_stats(db, current_user_id)
        u_stmt = select(User).where(User.id == current_user_id)
        u_res = await db.execute(u_stmt)
        my_user = u_res.scalar_one_or_none()

        my_rank: int | None = None
        if redis:
            try:
                await redis.zadd(LEADERBOARD_KEY, {str(current_user_id): float(my_stats.rating)})
                rank_idx = await redis.zrevrank(LEADERBOARD_KEY, str(current_user_id))
                if rank_idx is not None:
                    my_rank = rank_idx + 1
            except Exception as e:
                logger.warning("redis_user_rank_failed", error=str(e))

        if my_rank is None:
            # Fallback count users with higher rating
            count_stmt = select(func.count(UserStats.user_id)).where(UserStats.rating > my_stats.rating)
            c_res = await db.execute(count_stmt)
            higher_count = c_res.scalar_one() or 0
            my_rank = higher_count + 1

        me_item = LeaderboardUserItem(
            rank=my_rank,
            user_id=current_user_id,
            candidate_name=(my_user.full_name or my_user.username) if my_user else f"User {current_user_id}",
            username=my_user.username if my_user else None,
            score=my_stats.rating,
            rating=my_stats.rating,
            interviews_completed=my_stats.interviews_completed,
            problems_solved=my_stats.problems_solved_total,
        )

        return leaderboard, me_item
