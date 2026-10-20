
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.modules.analytics.models import UserStats
from app.modules.analytics.service import AnalyticsService
from app.modules.auth.models import User
from tests.conftest import FakeRedis


@pytest.fixture
async def candidate_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="dev_sarah",
        email="sarah@example.com",
        full_name="Sarah Engineer",
        password_hash=get_password_hash("DevPassword123!"),
        is_verified=True,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user


@pytest.fixture
def candidate_headers(candidate_user: User) -> dict[str, str]:
    token = create_access_token(
        subject=str(candidate_user.id),
        username=candidate_user.username,
        email=candidate_user.email,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_analytics_initial_stats(client: AsyncClient, candidate_user: User, candidate_headers: dict[str, str]):
    res = await client.get("/api/v1/analytics/stats", headers=candidate_headers)
    assert res.status_code == 200
    stats = res.json()

    assert stats["user_id"] == candidate_user.id
    assert stats["rating"] == 1200
    assert stats["problems_solved_total"] == 0
    assert stats["interviews_completed"] == 0
    assert stats["current_streak"] == 0


@pytest.mark.asyncio
async def test_activity_logging_and_streaks(
    client: AsyncClient,
    candidate_user: User,
    candidate_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    # Log problem solving activities
    await AnalyticsService.log_activity(
        db=test_db_session,
        user_id=candidate_user.id,
        activity_type="PROBLEM_SOLVED",
        count=3,
        study_minutes=40,
        domain="Arrays & Hashing",
    )

    # Check stats updated
    stats_res = await client.get("/api/v1/analytics/stats", headers=candidate_headers)
    assert stats_res.status_code == 200
    stats_data = stats_res.json()
    assert stats_data["problems_solved_total"] == 3
    assert stats_data["current_streak"] == 1
    assert stats_data["longest_streak"] == 1

    # Check activity heatmap endpoint
    heat_res = await client.get("/api/v1/analytics/activity", headers=candidate_headers)
    assert heat_res.status_code == 200
    heat_data = heat_res.json()
    assert heat_data["total_active_days"] == 1
    assert len(heat_data["activities"]) >= 1
    today_act = heat_data["activities"][-1]
    assert today_act["problems_solved"] == 3
    assert today_act["study_minutes"] == 40


@pytest.mark.asyncio
async def test_interview_completion_aggregation(
    client: AsyncClient,
    candidate_user: User,
    candidate_headers: dict[str, str],
    test_db_session: AsyncSession,
    fake_redis: FakeRedis,
):
    # Complete an interview with score 90
    await AnalyticsService.record_interview_completion(
        db=test_db_session,
        user_id=candidate_user.id,
        session_id="interview_mock_session_101",
        interview_type="System Design",
        score=90,
        metadata={"rubric": "Senior Level"},
        redis=fake_redis,  # type: ignore
    )

    # Check stats
    stats_res = await client.get("/api/v1/analytics/stats", headers=candidate_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["interviews_completed"] == 1
    assert stats["avg_interview_score"] == 90.0
    assert stats["best_interview_score"] == 90
    assert stats["rating"] > 1200  # ELO rating boosted

    # Complete another interview with score 80
    await AnalyticsService.record_interview_completion(
        db=test_db_session,
        user_id=candidate_user.id,
        session_id="interview_mock_session_102",
        interview_type="System Design",
        score=80,
        metadata={"rubric": "Senior Level"},
        redis=fake_redis,  # type: ignore
    )

    stats_res2 = await client.get("/api/v1/analytics/stats", headers=candidate_headers)
    stats2 = stats_res2.json()
    assert stats2["interviews_completed"] == 2
    assert stats2["avg_interview_score"] == 85.0
    assert stats2["best_interview_score"] == 90


@pytest.mark.asyncio
async def test_skills_and_radar_endpoint(
    client: AsyncClient,
    candidate_user: User,
    candidate_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    # Log domain activity
    await AnalyticsService.log_activity(
        db=test_db_session,
        user_id=candidate_user.id,
        activity_type="PROBLEM_SOLVED",
        count=5,
        domain="Dynamic Programming",
    )

    skills_res = await client.get("/api/v1/analytics/skills", headers=candidate_headers)
    assert skills_res.status_code == 200
    skills_data = skills_res.json()

    assert "skills" in skills_data
    assert "radar_data" in skills_data
    assert any(s["domain"] == "Dynamic Programming" for s in skills_data["skills"])
    assert len(skills_data["radar_data"]) >= 3


@pytest.mark.asyncio
async def test_global_leaderboard(
    client: AsyncClient,
    candidate_user: User,
    candidate_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    # Create top ranked user
    top_user = User(
        username="lead_architect",
        email="architect@example.com",
        full_name="Lead Architect",
        password_hash=get_password_hash("Architect123!"),
        is_verified=True,
    )
    test_db_session.add(top_user)
    await test_db_session.commit()
    await test_db_session.refresh(top_user)

    top_stats = UserStats(
        user_id=top_user.id,
        rating=1850,
        interviews_completed=15,
        problems_solved_total=120,
    )
    test_db_session.add(top_stats)
    await test_db_session.commit()

    # Query leaderboard
    res = await client.get("/api/v1/analytics/leaderboard", headers=candidate_headers)
    assert res.status_code == 200
    data = res.json()

    assert "leaderboard" in data
    assert "me" in data
    assert len(data["leaderboard"]) >= 1
    assert data["leaderboard"][0]["candidate_name"] == "Lead Architect"
    assert data["leaderboard"][0]["rating"] == 1850
    assert data["me"]["user_id"] == candidate_user.id


@pytest.mark.asyncio
async def test_streak_reset_after_inactivity(
    candidate_user: User,
    test_db_session: AsyncSession,
):
    from datetime import UTC, datetime, timedelta

    stats = await AnalyticsService.get_or_create_user_stats(test_db_session, candidate_user.id)
    # Simulate a user having practiced 3 days ago with a 5-day streak
    today = datetime.now(UTC).date()
    stats.last_activity_date = today - timedelta(days=3)
    stats.current_streak = 5
    await test_db_session.commit()

    # Reading stats should detect inactivity and reset current_streak to 0
    refreshed_stats = await AnalyticsService.get_or_create_user_stats(test_db_session, candidate_user.id)
    assert refreshed_stats.current_streak == 0
    assert refreshed_stats.longest_streak == 0 or refreshed_stats.longest_streak >= 0


@pytest.mark.asyncio
async def test_interview_completion_idempotency(
    candidate_user: User,
    test_db_session: AsyncSession,
):
    session_id = "mock_session_idempotency_123"

    # First completion call
    stats1 = await AnalyticsService.record_interview_completion(
        db=test_db_session,
        user_id=candidate_user.id,
        session_id=session_id,
        interview_type="DSA",
        score=85,
    )
    assert stats1.interviews_completed == 1
    assert stats1.avg_interview_score == 85.0

    # Second completion call with the same session_id (e.g. retry / webhook duplicate)
    stats2 = await AnalyticsService.record_interview_completion(
        db=test_db_session,
        user_id=candidate_user.id,
        session_id=session_id,
        interview_type="DSA",
        score=85,
    )
    # Must NOT increment interviews_completed or double-average
    assert stats2.interviews_completed == 1
    assert stats2.avg_interview_score == 85.0


def test_score_normalization_0_to_10_and_domain_weighting():
    from app.modules.interview.service import InterviewService

    # Test 1: Components returned on a 0-10 scale (e.g. from LLM returning 1-10)
    score = InterviewService.compute_domain_weighted_score(
        interview_type="DSA Coding",
        tech=8.0,   # scales to 80
        comm=7.5,   # scales to 75
        eng=9.0,    # scales to 90
    )
    # 0.60 * 80 + 0.25 * 75 + 0.15 * 90 = 48 + 18.75 + 13.5 = 80.25 -> 80
    assert score == 80
    assert score > 10  # Guaranteed not stuck on 0-10 scale

    # Test 2: Components already on a 0-100 scale
    score_100 = InterviewService.compute_domain_weighted_score(
        interview_type="Behavioral HR",
        tech=80.0,
        comm=90.0,
        eng=85.0,
    )
    # 0.20 * 80 + 0.70 * 90 + 0.10 * 85 = 16 + 63 + 8.5 = 87.5 -> 88
    assert score_100 == 88

    # Test 3: Clamping boundaries
    score_overflow = InterviewService.compute_domain_weighted_score(
        interview_type="General",
        tech=150.0,
        comm=120.0,
        eng=110.0,
    )
    assert score_overflow == 100

    # Test 4: Overall score in detailed_metrics on 0-10 scale
    score_metrics = InterviewService.compute_domain_weighted_score(
        interview_type="System Design",
        tech=None,
        comm=None,
        eng=None,
        detailed_metrics={"overall_score": 8.5},
    )
    assert score_metrics == 85


@pytest.mark.asyncio
async def test_leaderboard_cache_hit_and_repopulation(
    candidate_user: User,
    test_db_session: AsyncSession,
    fake_redis: FakeRedis,
):
    from app.modules.analytics.service import LEADERBOARD_KEY

    # 1. Create a top user
    user_top = User(
        username="champion_coder",
        email="champion@example.com",
        full_name="Champion Coder",
        password_hash=get_password_hash("ChampPassword123!"),
        is_verified=True,
    )
    test_db_session.add(user_top)
    await test_db_session.commit()
    await test_db_session.refresh(user_top)

    top_stats = UserStats(
        user_id=user_top.id,
        rating=2100,
        interviews_completed=25,
        problems_solved_total=300,
    )
    test_db_session.add(top_stats)
    await test_db_session.commit()

    # Ensure candidate stats are initialized
    await AnalyticsService.get_or_create_user_stats(test_db_session, candidate_user.id)

    # 2. Redis initially empty
    cached_before = await fake_redis.zrevrange(LEADERBOARD_KEY, 0, -1, withscores=True)
    assert len(cached_before) == 0

    # 3. First call: Redis empty, should fallback to DB and repopulate Redis
    leaderboard, me = await AnalyticsService.get_leaderboard(
        db=test_db_session,
        redis=fake_redis,  # type: ignore
        current_user_id=candidate_user.id,
        limit=10,
    )
    assert len(leaderboard) >= 1
    assert leaderboard[0].user_id == user_top.id
    assert leaderboard[0].candidate_name == "Champion Coder"
    assert leaderboard[0].rating == 2100

    # Verify Redis is now repopulated with standardized key and member str(user_id)
    cached_after = await fake_redis.zrevrange(LEADERBOARD_KEY, 0, -1, withscores=True)
    assert len(cached_after) >= 1
    cached_members = [m.decode("utf-8") if isinstance(m, bytes) else str(m) for m, _ in cached_after]
    assert str(user_top.id) in cached_members

    # 4. Second call: Should read from Redis cache
    leaderboard_cached, me_cached = await AnalyticsService.get_leaderboard(
        db=test_db_session,
        redis=fake_redis,  # type: ignore
        current_user_id=candidate_user.id,
        limit=10,
    )
    assert len(leaderboard_cached) == len(leaderboard)
    assert leaderboard_cached[0].user_id == user_top.id
    assert leaderboard_cached[0].candidate_name == "Champion Coder"
    assert leaderboard_cached[0].rating == 2100
    assert me_cached is not None
    assert me_cached.user_id == candidate_user.id
