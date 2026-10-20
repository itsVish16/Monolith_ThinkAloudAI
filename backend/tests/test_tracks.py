import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tracks.models import (
    AIMLQuestion,
    BehavioralQuestion,
    PMQuestion,
    SystemDesignQuestion,
)


@pytest.mark.asyncio
async def test_tracks_system_design(client: AsyncClient, test_db_session: AsyncSession):
    sd_q = SystemDesignQuestion(
        title="Design a Distributed Rate Limiter",
        description="Comprehensive rate limiter architecture using Redis token bucket.",
        domain="API Gateway",
        role="Senior Backend Engineer",
    )
    test_db_session.add(sd_q)
    await test_db_session.commit()

    # List system design
    res = await client.get("/api/v1/tracks/system-design")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Design a Distributed Rate Limiter"

    # Filter by domain
    res_domain = await client.get("/api/v1/tracks/system-design?domain=API Gateway")
    assert res_domain.status_code == 200
    assert len(res_domain.json()["items"]) == 1

    # Get by ID
    res_detail = await client.get(f"/api/v1/tracks/system-design/{sd_q.id}")
    assert res_detail.status_code == 200
    assert res_detail.json()["role"] == "Senior Backend Engineer"

    # Submit solution
    res_submit = await client.post(
        f"/api/v1/tracks/system-design/{sd_q.id}/submit",
        json={"answer_text": "We will use Redis Cluster with a token bucket algorithm to track requests per client IP."},
    )
    assert res_submit.status_code == 200
    assert res_submit.json()["score"] > 0


@pytest.mark.asyncio
async def test_tracks_behavioral(client: AsyncClient, test_db_session: AsyncSession):
    b_q = BehavioralQuestion(
        title="Handling Critical Production Outage",
        description="Describe how you handled a sev-1 production outage.",
        category="Ownership & Crisis Management",
    )
    test_db_session.add(b_q)
    await test_db_session.commit()

    res = await client.get("/api/v1/tracks/behavioral")
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["title"] == "Handling Critical Production Outage"

    res_detail = await client.get(f"/api/v1/tracks/behavioral/{b_q.id}")
    assert res_detail.status_code == 200
    assert res_detail.json()["category"] == "Ownership & Crisis Management"


@pytest.mark.asyncio
async def test_tracks_pm(client: AsyncClient, test_db_session: AsyncSession):
    pm_q = PMQuestion(
        title="Design Spotify Social Discovery",
        description="Design a social discovery feature for Spotify users.",
        category="Product Sense & Design",
    )
    test_db_session.add(pm_q)
    await test_db_session.commit()

    res = await client.get("/api/v1/tracks/pm")
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["title"] == "Design Spotify Social Discovery"

    res_detail = await client.get(f"/api/v1/tracks/pm/{pm_q.id}")
    assert res_detail.status_code == 200
    assert res_detail.json()["category"] == "Product Sense & Design"


@pytest.mark.asyncio
async def test_tracks_aiml(client: AsyncClient, test_db_session: AsyncSession):
    aiml_q = AIMLQuestion(
        title="Fine-Tuning vs RAG Trade-offs",
        description="When to use LoRA fine-tuning vs RAG for enterprise LLMs.",
        domain="Generative AI & LLMs",
        role="AI Engineer",
    )
    test_db_session.add(aiml_q)
    await test_db_session.commit()

    res = await client.get("/api/v1/tracks/aiml")
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["title"] == "Fine-Tuning vs RAG Trade-offs"

    res_detail = await client.get(f"/api/v1/tracks/aiml/{aiml_q.id}")
    assert res_detail.status_code == 200
    assert res_detail.json()["role"] == "AI Engineer"


@pytest.mark.asyncio
async def test_tracks_roadmaps(client: AsyncClient, test_db_session: AsyncSession):
    # 1. Create Roadmap
    payload = {
        "title": "Backend Engineering Roadmap",
        "description": "Step by step backend roadmap.",
        "topics": [
            {
                "title": "Data Structures",
                "order_index": 1,
                "items": [
                    {
                        "title": "Two Sum Problem",
                        "content_type": "dsa",
                        "estimated_minutes": 30,
                    }
                ],
            }
        ],
    }
    res_create = await client.post("/api/v1/tracks/roadmaps", json=payload)
    assert res_create.status_code == 201
    created_data = res_create.json()
    roadmap_id = created_data["id"]
    item_id = created_data["topics"][0]["items"][0]["id"]
    assert created_data["title"] == "Backend Engineering Roadmap"
    assert created_data["topics"][0]["items"][0]["is_completed"] is False

    # 2. Get Roadmap by ID
    res_get = await client.get(f"/api/v1/tracks/roadmaps/{roadmap_id}")
    assert res_get.status_code == 200
    assert res_get.json()["title"] == "Backend Engineering Roadmap"

    # 3. Toggle Roadmap item
    res_toggle = await client.patch(
        f"/api/v1/tracks/roadmaps/items/{item_id}/toggle?is_completed=true"
    )
    assert res_toggle.status_code == 200
    assert res_toggle.json()["is_completed"] is True
