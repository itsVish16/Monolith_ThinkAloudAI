import asyncio
from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.redis import get_redis
from app.main import app as fastapi_app


class FakePipeline:
    def __init__(self, redis: "FakeRedis"):
        self.redis = redis
        self.commands: list[tuple[Any, tuple, dict]] = []

    def incr(self, key: str):
        self.commands.append((self.redis.incr, (key,), {}))
        return self

    def expire(self, key: str, time: int):
        self.commands.append((self.redis.expire, (key, time), {}))
        return self

    def zadd(self, key: str, mapping: dict[str, float]):
        self.commands.append((self.redis.zadd, (key, mapping), {}))
        return self

    async def execute(self):
        results = []
        for func, args, kwargs in self.commands:
            res = await func(*args, **kwargs)
            results.append(res)
        return results


class FakeRedis:
    """In-memory Redis mock for test isolation."""

    def __init__(self):
        self._data: dict[str, str] = {}
        self._ttls: dict[str, int] = {}
        self._lists: dict[str, list[str]] = {}

    def pipeline(self) -> FakePipeline:
        return FakePipeline(self)

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None) -> bool:
        self._data[key] = str(value)
        if ex is not None:
            self._ttls[key] = ex
        return True

    async def setex(self, key: str, time: int, value: Any) -> bool:
        return await self.set(key, value, ex=time)

    async def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if k in self._data:
                del self._data[k]
                self._ttls.pop(k, None)
                count += 1
        return count

    async def incr(self, key: str) -> int:
        val = int(self._data.get(key, 0)) + 1
        self._data[key] = str(val)
        return val

    async def expire(self, key: str, time: int) -> bool:
        if key in self._data:
            self._ttls[key] = time
            return True
        return False

    async def ping(self) -> bool:
        return True

    async def rpush(self, key: str, *values: str) -> int:
        return len(values)

    async def lpush(self, key: str, *values: str) -> int:
        if key not in self._lists:
            self._lists[key] = []
        for v in values:
            self._lists[key].insert(0, str(v))
        return len(self._lists[key])

    async def ltrim(self, key: str, start: int, stop: int) -> bool:
        if key not in self._lists:
            return True
        self._lists[key] = self._lists[key][start : stop + 1 if stop != -1 else None]
        return True

    async def brpop(self, key: str, timeout: float = 0) -> tuple[str, str] | None:
        if key in self._lists and self._lists[key]:
            return (key, self._lists[key].pop())
        return None

    async def blpop(self, key: str, timeout: int = 0) -> None:
        return None

    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        if not hasattr(self, "_zsets"):
            self._zsets = {}
        if key not in self._zsets:
            self._zsets[key] = {}
        for member, score in mapping.items():
            self._zsets[key][member] = float(score)
        return len(mapping)

    async def zrevrange(self, key: str, start: int, stop: int, withscores: bool = False) -> list:
        if not hasattr(self, "_zsets") or key not in self._zsets:
            return []
        sorted_items = sorted(self._zsets[key].items(), key=lambda x: x[1], reverse=True)
        slice_items = sorted_items[start : stop + 1 if stop != -1 else None]
        if withscores:
            return slice_items
        return [item[0] for item in slice_items]

    async def zrevrank(self, key: str, member: str) -> int | None:
        if not hasattr(self, "_zsets") or key not in self._zsets or member not in self._zsets[key]:
            return None
        sorted_members = [m for m, _ in sorted(self._zsets[key].items(), key=lambda x: x[1], reverse=True)]
        try:
            return sorted_members.index(member)
        except ValueError:
            return None

    async def zscore(self, key: str, member: str) -> float | None:
        if not hasattr(self, "_zsets") or key not in self._zsets:
            return None
        return self._zsets[key].get(member)

    async def publish(self, channel: str, message: Any) -> int:
        return 1

    def pubsub(self) -> "FakePubSub":
        return FakePubSub()


class FakePubSub:
    def __init__(self):
        self.channels = []
        self.messages = []

    async def subscribe(self, *channels):
        self.channels.extend(channels)

    async def unsubscribe(self, *channels):
        for c in channels:
            if c in self.channels:
                self.channels.remove(c)

    async def get_message(self, ignore_subscribe_messages: bool = True, timeout: float = 1.0):
        if self.messages:
            return self.messages.pop(0)
        await asyncio.sleep(min(timeout, 0.05))
        return None


from sqlalchemy.pool import StaticPool

import app.core.database
import app.core.redis
import app.modules.chat.service
import app.modules.chat.tools
import app.modules.interview.service
import app.tasks.analysis_tasks
import app.tasks.queue


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    fr = FakeRedis()

    async def _fake_get_redis():
        return fr

    monkeypatch.setattr(app.core.redis, "get_redis", _fake_get_redis)
    monkeypatch.setattr(app.tasks.queue, "get_redis", _fake_get_redis)
    return fr


@pytest.fixture
async def test_db_session(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[AsyncSession, None]:
    """Provides an isolated in-memory SQLite database session for tests."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)

    monkeypatch.setattr(app.core.database, "SessionLocal", session_maker)
    monkeypatch.setattr(app.modules.chat.tools, "SessionLocal", session_maker)
    monkeypatch.setattr(app.modules.chat.service, "SessionLocal", session_maker)
    monkeypatch.setattr(app.tasks.analysis_tasks, "SessionLocal", session_maker)

    async with session_maker() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def client(test_db_session: AsyncSession, fake_redis: FakeRedis) -> AsyncGenerator[AsyncClient, None]:
    """Test HTTP client with overridden DB and Redis dependencies."""

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    async def override_get_redis() -> FakeRedis:
        return fake_redis

    fastapi_app.dependency_overrides[get_db] = override_get_db
    fastapi_app.dependency_overrides[get_redis] = override_get_redis

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()

