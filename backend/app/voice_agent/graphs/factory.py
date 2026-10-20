from langgraph.graph import END, StateGraph

from app.voice_agent.graphs.base import (
    INTERVIEW_FLOWS,
    evaluate_and_route,
    generate_response,
    normalize_interview_type,
)
from app.voice_agent.state import InterviewState


def build_graph(interview_type: str = "general"):
    """
    Builds and compiles the LangGraph state machine for the voice interview agent.
    """
    workflow = StateGraph(InterviewState)
    workflow.add_node("generate_response", generate_response)
    workflow.add_node("evaluate_and_route", evaluate_and_route)

    workflow.set_entry_point("generate_response")
    workflow.add_edge("generate_response", END)

    return workflow.compile()


__all__ = [
    "build_graph",
    "evaluate_and_route",
    "generate_response",
    "INTERVIEW_FLOWS",
    "normalize_interview_type",
]
