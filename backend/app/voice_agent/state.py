from enum import StrEnum
from typing import Any, TypedDict

from pydantic import BaseModel, Field


class InterviewStage(StrEnum):
    # Introduction & setup flow
    INTRO_WELCOME = "intro_welcome"
    INTRO_AUDIO_CHECK = "intro_audio_check"
    INTRO_AGENDA = "intro_agenda"
    INTRO_BACKGROUND = "intro_background"
    INTRO_CANDIDATE = "intro_candidate"
    INTRO_EDITOR = "intro_editor"

    # DSA Stages: intro -> approach -> coding -> testing -> wrap-up
    DSA_PRESENTATION = "dsa_presentation"
    DSA_APPROACH = "dsa_approach"
    DSA_CODING = "dsa_coding"
    DSA_TESTING = "dsa_testing"

    # System Design Sub-stages
    SYSTEM_DESIGN_REQUIREMENTS = "system_design_requirements"
    SYSTEM_DESIGN_HLD = "system_design_hld"
    SYSTEM_DESIGN_DEEP_DIVE = "system_design_deep_dive"

    # Behavioral Sub-stages (STAR method)
    BEHAVIORAL_QUESTION = "behavioral_question"
    BEHAVIORAL_FOLLOWUP = "behavioral_followup"

    # AI/ML Sub-stages
    AIML_FUNDAMENTALS = "aiml_fundamentals"
    AIML_SYSTEM = "aiml_system"

    # Product Management Sub-stages
    PM_PROBLEM_FRAMING = "pm_problem_framing"
    PM_USER_SEGMENTATION = "pm_user_segmentation"
    PM_SOLUTION_BRAINSTORMING = "pm_solution_brainstorming"
    PM_METRICS_AND_EXECUTION = "pm_metrics_and_execution"

    # Legacy & common stage aliases
    RESUME_PROBE = "resume_probe"
    TECHNICAL_ASSESSMENT = "technical_assessment"
    SYSTEM_DESIGN_CORE = "system_design_core"
    BEHAVIORAL_STAR = "behavioral_star"
    PRESENTATION_QA = "presentation_qa"
    AIML_CORE = "ai_ml_core"
    PRODUCT_SENSE_CORE = "product_sense_core"

    # Wrap up & completion
    CANDIDATE_QA = "candidate_qa"
    WRAP_UP = "wrap_up"
    COMPLETED = "completed"


class EvaluationResult(BaseModel):
    reasoning: str = Field(description="Step-by-step reasoning for the evaluation.")
    score: int = Field(description="Score from 1-5 evaluating candidate's last answer. 0 if user just asked a question or dodged.")
    feedback: str = Field(description="Brief internal note on candidate's performance or behavior in the last turn.")
    objective_met: bool = Field(description="True ONLY IF the interviewer has gathered enough information to complete current stage.")
    trigger_next_question: bool = Field(default=False, description="True ONLY IF candidate passed current coding question and is ready for next problem.")


class ConversationMessage(TypedDict):
    role: str
    content: str


class ConversationState(TypedDict):
    messages: list[ConversationMessage]
    stage: str
    turns_in_stage: int
    should_end: bool


class InterviewState(TypedDict):
    messages: list[dict[str, str]]
    stage: str
    candidate_name: str
    resume_summary: str | None
    evaluations: list[dict[str, Any]]
    stream_queue: Any | None

    # Time Awareness & Track
    start_time: float
    max_duration_minutes: int
    interview_type: str

    # Stage turn tracking
    turns_in_stage: int
    should_end: bool

    # Multimodal Visual Context
    latest_visual_context: str | None
    latest_whiteboard_context: str | None
    latest_whiteboard_graph: str | None

    # Questions & Active Index
    ai_selected_questions: list[dict[str, Any]] | None
    active_question_index: int

    # IDE & Execution Context
    latest_code: str | None
    latest_execution: dict[str, Any] | None
    is_editor_open: bool | None
    highlight_line: int | None
    pending_tool_calls: list[dict[str, Any]] | None

    # Nudges & Observability
    system_prompt_nudges: list[str] | None
    opik_trace_id: str | None
    current_turn_metrics: Any | None
