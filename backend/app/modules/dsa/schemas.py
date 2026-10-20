from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProblemTagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tag_name: str


class QuestionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str | None = None
    difficulty: str
    function_name: str = "solution"
    optimal_time_complexity: str | None = None
    optimal_space_complexity: str | None = None
    tags: list[str] = []
    created_at: datetime


class QuestionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str | None = None
    description: str
    difficulty: str
    function_name: str = "solution"
    python_starter_code: str | None = None
    cpp_starter_code: str | None = None
    cpp_test_harness: str | None = None
    test_cases: str  # JSON-encoded test cases string
    hints: str | None = None
    optimal_time_complexity: str | None = None
    optimal_space_complexity: str | None = None
    tags: list[str] = []
    created_at: datetime


class QuestionListResponse(BaseModel):
    items: list[QuestionSummary]
    total: int
    skip: int
    limit: int


class CodeSubmissionRequest(BaseModel):
    session_id: str | None = None
    code: str = Field(..., min_length=1, description="Source code to execute")
    language: str = Field(default="python", description="'python' or 'cpp'")
    custom_test_cases: str | list[Any] | dict[str, Any] | None = Field(
        default=None, description="Optional custom JSON test cases for dry runs"
    )


class TestResult(BaseModel):
    test_case_index: int
    status: str  # "passed", "failed", "error", "timeout"
    input_args: Any | None = None
    expected_output: Any | None = None
    actual_output: Any | None = None
    error_message: str | None = None
    execution_time_ms: float = 0.0


class CodeSubmissionResponse(BaseModel):
    status: str  # "Accepted", "Wrong Answer", "Runtime Error", "Time Limit Exceeded", "Pending"
    passed_tests: int = 0
    total_tests: int = 0
    execution_time_ms: float = 0.0
    memory_used_kb: float = 0.0
    memory_kb: float | None = None
    memory_mb: float | None = None
    error_message: str | None = None
    submission_id: int | None = None
    output: str | None = None
    test_results: list[TestResult] = []


class CodeSubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: str | None = None
    user_id: int | None = None
    question_id: int
    code: str
    language: str
    status: str
    error_message: str | None = None
    is_submission: bool
    passed_tests: int | None = None
    total_tests: int | None = None
    execution_time_ms: float | None = None
    memory_used_kb: float | None = None
    created_at: datetime


class UserProblemStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: int
    status: str
    best_runtime_ms: float | None = None
    best_memory_kb: float | None = None
    last_attempted_at: datetime


class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: str | None = None
    question_id: int
    reason: str | None = None
    created_at: datetime
