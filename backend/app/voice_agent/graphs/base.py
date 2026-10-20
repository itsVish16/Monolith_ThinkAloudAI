import time
from datetime import datetime
from typing import Any

from app.core.telemetry import traceable
from app.voice_agent.llm import evaluate_llm, stream_dual_llm
from app.voice_agent.prompts import (
    EVALUATION_PROMPT,
    EVALUATOR_RULES,
    INTERVIEW_PERSONA,
    INTERVIEW_PERSONAS,
    STAGE_PROMPTS,
    TTS_RULES,
)
from app.voice_agent.state import InterviewStage, InterviewState

INTERVIEW_FLOWS: dict[str, list[str]] = {
    "general": [
        InterviewStage.INTRO_AUDIO_CHECK.value,
        InterviewStage.INTRO_AGENDA.value,
        InterviewStage.INTRO_BACKGROUND.value,
        InterviewStage.INTRO_CANDIDATE.value,
        InterviewStage.RESUME_PROBE.value,
        InterviewStage.CANDIDATE_QA.value,
        InterviewStage.WRAP_UP.value,
        InterviewStage.COMPLETED.value,
    ],
    "system_design": [
        InterviewStage.INTRO_AUDIO_CHECK.value,
        InterviewStage.INTRO_BACKGROUND.value,
        InterviewStage.SYSTEM_DESIGN_REQUIREMENTS.value,
        InterviewStage.SYSTEM_DESIGN_HLD.value,
        InterviewStage.SYSTEM_DESIGN_DEEP_DIVE.value,
        InterviewStage.CANDIDATE_QA.value,
        InterviewStage.WRAP_UP.value,
        InterviewStage.COMPLETED.value,
    ],
    "dsa": [
        InterviewStage.INTRO_AUDIO_CHECK.value,
        InterviewStage.INTRO_BACKGROUND.value,
        InterviewStage.DSA_PRESENTATION.value,
        InterviewStage.DSA_APPROACH.value,
        InterviewStage.DSA_CODING.value,
        InterviewStage.DSA_TESTING.value,
        InterviewStage.CANDIDATE_QA.value,
        InterviewStage.WRAP_UP.value,
        InterviewStage.COMPLETED.value,
    ],
    "hr": [
        InterviewStage.INTRO_AUDIO_CHECK.value,
        InterviewStage.INTRO_BACKGROUND.value,
        InterviewStage.BEHAVIORAL_QUESTION.value,
        InterviewStage.BEHAVIORAL_FOLLOWUP.value,
        InterviewStage.CANDIDATE_QA.value,
        InterviewStage.WRAP_UP.value,
        InterviewStage.COMPLETED.value,
    ],
    "pm": [
        InterviewStage.INTRO_AUDIO_CHECK.value,
        InterviewStage.INTRO_BACKGROUND.value,
        InterviewStage.PM_PROBLEM_FRAMING.value,
        InterviewStage.PM_USER_SEGMENTATION.value,
        InterviewStage.PM_SOLUTION_BRAINSTORMING.value,
        InterviewStage.PM_METRICS_AND_EXECUTION.value,
        InterviewStage.CANDIDATE_QA.value,
        InterviewStage.WRAP_UP.value,
        InterviewStage.COMPLETED.value,
    ],
    "ai_ml": [
        InterviewStage.INTRO_AUDIO_CHECK.value,
        InterviewStage.INTRO_BACKGROUND.value,
        InterviewStage.AIML_FUNDAMENTALS.value,
        InterviewStage.AIML_SYSTEM.value,
        InterviewStage.CANDIDATE_QA.value,
        InterviewStage.WRAP_UP.value,
        InterviewStage.COMPLETED.value,
    ],
}

MIN_TURNS_PER_STAGE: dict[str, int] = {
    "intro_welcome": 1,
    "intro_audio_check": 1,
    "intro_agenda": 1,
    "intro_background": 1,
    "resume_probe": 1,
    "intro_candidate": 1,
    "intro_editor": 1,
    "dsa_presentation": 1,
    "dsa_approach": 1,
    "dsa_coding": 1,
    "dsa_testing": 1,
    "system_design_requirements": 2,
    "system_design_hld": 2,
    "system_design_deep_dive": 2,
    "behavioral_question": 1,
    "behavioral_followup": 1,
    "pm_problem_framing": 2,
    "pm_user_segmentation": 2,
    "pm_solution_brainstorming": 2,
    "pm_metrics_and_execution": 2,
    "aiml_fundamentals": 2,
    "aiml_system": 2,
    "candidate_qa": 2,
    "wrap_up": 1,
    "completed": 1,
}


def normalize_interview_type(interview_type: str) -> str:
    i_type = (interview_type or "general").lower().strip()
    if "system_design" in i_type or "sd" in i_type:
        return "system_design"
    elif "dsa" in i_type or "swe" in i_type or "coding" in i_type:
        return "dsa"
    elif "hr" in i_type or "behavioral" in i_type:
        return "hr"
    elif "pm" in i_type or "product" in i_type:
        return "pm"
    elif "ai" in i_type or "ml" in i_type:
        return "ai_ml"
    return "general"


@traceable(name="voice_agent_speaker_node", run_type="chain")
async def generate_response(state: InterviewState) -> dict[str, Any]:
    """
    Speaker Node in LangGraph. Purely conversational.
    Generates and streams spoken interviewer turns.
    """
    current_stage = state["stage"]
    prompt = STAGE_PROMPTS.get(current_stage, STAGE_PROMPTS["wrap_up"])

    # Time tracking
    start_time = state.get("start_time", time.time())
    elapsed_minutes = int((time.time() - start_time) / 60)
    max_duration = state.get("max_duration_minutes", 50)
    remaining_minutes = max_duration - elapsed_minutes
    time_warning = ""
    if elapsed_minutes >= max_duration - 5:
        time_warning = "WARNING: Time limit approaching. Wrap up gracefully in this turn."

    current_date = datetime.now().strftime("%B %d, %Y")
    active_idx = state.get("active_question_index", 0)
    questions = state.get("ai_selected_questions", [])
    active_q = questions[active_idx] if active_idx < len(questions) else None

    i_type_raw = state.get("interview_type", "General")
    norm_type = normalize_interview_type(i_type_raw)
    candidate_name = state.get("candidate_name", "Candidate")

    # Format active problem/scenario
    if isinstance(active_q, dict):
        q_title = active_q.get("title", "")
        q_desc = active_q.get("description", "")
        q_diff = active_q.get("difficulty", "")
        q_cat = active_q.get("category", "")

        if norm_type == "hr":
            formatted_q = f"SCENARIO TITLE: {q_title}"
            if q_cat:
                formatted_q += f" (Competency: {q_cat})"
            if q_desc:
                formatted_q += f"\nPrompt:\n{q_desc}"
        else:
            formatted_q = f"ACTIVE PROBLEM TITLE: {q_title}"
            if q_diff:
                formatted_q += f" (Difficulty: {q_diff})"
            if q_desc:
                formatted_q += f"\nDescription:\n{q_desc}"
            formatted_q += f"\n\nCRITICAL: Candidate is viewing '{q_title}'. Discuss this specific problem."
    elif active_q:
        formatted_q = str(active_q)
    else:
        formatted_q = "General Technical Assessment"

    # Track personas & intros
    problem_label = f"'{q_title}'" if q_title else "the coding challenge"
    if norm_type == "system_design":
        formatted_type = "System Design"
        stage_agenda_desc = "Designing a scalable distributed architecture on the whiteboard"
        track_intro_text = f"Confirm audio and video connection warmly with {candidate_name}. If not already introduced, introduce yourself as Aarav from ThinkAloudAI, and invite {candidate_name} to give a brief introduction of themselves, their background, and what systems they've built recently."
        intro_trans_text = f"Acknowledge {candidate_name}'s background warmly in 1 sentence. Transition smoothly into the system design challenge: let them know {problem_label} is ready on the whiteboard, and invite them to review the scenario."
        qa_trans_text = "Conclude the system design discussion and invite the candidate to ask any questions about our systems, architecture, or engineering culture."
        wrap_up_instructions = f"Thank {candidate_name} warmly for the architecture discussion, and mention that their detailed performance evaluation and report are available on their ThinkAloudAI dashboard."
    elif norm_type == "dsa":
        formatted_type = "Data Structures and Algorithms"
        stage_agenda_desc = "Solving DSA coding problems in the editor on screen"
        track_intro_text = f"Confirm audio and video connection warmly with {candidate_name}. If not already introduced, introduce yourself as Aarav from ThinkAloudAI, and invite {candidate_name} to give a brief introduction of themselves, their engineering background, and what they've been working on recently."
        intro_trans_text = f"Acknowledge {candidate_name}'s background warmly in 1 sentence. Transition smoothly into the coding challenge: let them know {problem_label} is loaded in their editor on screen, and invite them to review it and ask any clarifying questions."
        qa_trans_text = "Conclude the technical assessment and invite the candidate to ask any questions they have about engineering culture, architecture, or the team."
        wrap_up_instructions = f"Thank {candidate_name} warmly for practicing, and mention that their detailed performance evaluation, code analysis, and feedback report will be available on their ThinkAloudAI dashboard."
    elif norm_type == "hr":
        formatted_type = "Behavioral and Leadership"
        stage_agenda_desc = "Behavioral scenarios, leadership examples, teamwork, and past engineering impact"
        track_intro_text = f"Confirm connection warmly with {candidate_name}. If not already introduced, introduce yourself as Aarav from ThinkAloudAI, and invite {candidate_name} to share a brief introduction of their background and engineering journey."
        intro_trans_text = f"Acknowledge {candidate_name}'s background warmly in 1 sentence. Transition smoothly into the first behavioral scenario."
        qa_trans_text = "Conclude the behavioral scenarios and open the floor for any questions the candidate has about team culture, leadership, or the organization."
        wrap_up_instructions = f"Thank {candidate_name} warmly for sharing their experiences, and let them know their feedback report is available on their ThinkAloudAI dashboard."
    elif norm_type == "pm":
        formatted_type = "Product Management"
        stage_agenda_desc = "Product sense, user problem scoping, solution prioritization, and success metrics"
        track_intro_text = f"Confirm connection warmly with {candidate_name}. If not already introduced, introduce yourself as Aarav from ThinkAloudAI, and invite {candidate_name} to share a brief introduction of their background and product experience."
        intro_trans_text = f"Acknowledge {candidate_name}'s background warmly in 1 sentence. Transition smoothly into the product management challenge."
        qa_trans_text = "Conclude the product discussion and open the floor for candidate questions regarding our product strategy, team, or culture."
        wrap_up_instructions = f"Thank {candidate_name} warmly for the discussion, and let them know their feedback report is available on their ThinkAloudAI dashboard."
    elif norm_type == "ai_ml":
        formatted_type = "AI and Machine Learning"
        stage_agenda_desc = "AI/ML modeling fundamentals, loss formulation, and production inference architecture"
        track_intro_text = f"Confirm connection warmly with {candidate_name}. If not already introduced, introduce yourself as Aarav from ThinkAloudAI, and invite {candidate_name} to share a brief introduction of their background and recent ML work."
        intro_trans_text = f"Acknowledge {candidate_name}'s background warmly in 1 sentence. Transition smoothly into the AI/ML system scenario."
        qa_trans_text = "Conclude the technical assessment and open the floor for candidate questions regarding our AI systems, research, or team culture."
        wrap_up_instructions = f"Thank {candidate_name} warmly for the technical discussion, and let them know their feedback report is available on their ThinkAloudAI dashboard."
    else:
        formatted_type = "Engineering Assessment"
        stage_agenda_desc = "Technical assessment, engineering deep dives, and problem solving"
        track_intro_text = f"Confirm connection warmly with {candidate_name}. If not already introduced, introduce yourself as Aarav from ThinkAloudAI, and invite {candidate_name} to share a brief introduction of their background."
        intro_trans_text = f"Acknowledge {candidate_name}'s background in 1 sentence. Transition smoothly to our first technical challenge."
        qa_trans_text = "Conclude technical questions and invite the candidate to ask any questions about the team or culture."
        wrap_up_instructions = f"Thank {candidate_name} warmly for practicing, and let them know their feedback report is available on their ThinkAloudAI dashboard."

    # Format execution results
    exec_raw = state.get("latest_execution")
    if isinstance(exec_raw, dict):
        st = exec_raw.get("status", "Unknown")
        rt = exec_raw.get("runtime", "N/A")
        raw_info = exec_raw.get("raw") or {}
        passed = raw_info.get("passed_tests", 0)
        total = raw_info.get("total_tests", 0)
        err = raw_info.get("error_message") or ""
        formatted_exec = f"Status: {st} | Tests Passed: {passed}/{total} | Runtime: {rt}"
        if err:
            formatted_exec += f"\nError Message: {err}"
    elif exec_raw:
        formatted_exec = str(exec_raw)
    else:
        formatted_exec = "None"

    code_str = state.get("latest_code") or "None"

    prompt_formatted = prompt.format(
        candidate_name=candidate_name,
        elapsed_minutes=elapsed_minutes,
        max_duration_minutes=max_duration,
        remaining_minutes=remaining_minutes,
        current_date=current_date,
        time_warning=time_warning,
        interview_type=formatted_type,
        stage_agenda_description=stage_agenda_desc,
        track_intro_text=track_intro_text,
        intro_transition_text=intro_trans_text,
        qa_transition_text=qa_trans_text,
        track_wrap_up_instructions=wrap_up_instructions,
        current_active_question=formatted_q,
        latest_code=code_str,
        latest_execution=formatted_exec,
    )

    # Context injection
    extra_context = ""
    if any(s in current_stage for s in ["dsa", "coding", "testing"]):
        if code_str and code_str != "None":
            extra_context += f"\n\nCURRENT CANDIDATE CODE IN IDE:\n<CANDIDATE_CODE>\n{code_str}\n</CANDIDATE_CODE>"
        if formatted_exec and formatted_exec != "None":
            extra_context += f"\n\nLATEST TEST EXECUTION RESULT:\n<EXECUTION_OUTPUT>\n{formatted_exec}\n</EXECUTION_OUTPUT>"

    if "system_design" in current_stage:
        wb_graph = state.get("latest_whiteboard_graph", "")
        if wb_graph:
            extra_context += f"\n\nCURRENT WHITEBOARD DIAGRAM (Components & Flows):\n<WHITEBOARD_GRAPH>\n{wb_graph}\n</WHITEBOARD_GRAPH>"
        whiteboard = state.get("latest_whiteboard_context", "")
        if whiteboard and "not configured" not in whiteboard:
            extra_context += f"\n\nWHITEBOARD OBSERVATION:\n{whiteboard}"

    selected_persona = INTERVIEW_PERSONAS.get(norm_type, INTERVIEW_PERSONAS["general"])
    full_system_prompt = f"{selected_persona}\n\n{INTERVIEW_PERSONA}\n\n{TTS_RULES}\n\n{prompt_formatted}{extra_context}"

    # Adaptive conversation window
    window_size = 6 if current_stage.startswith("intro_") else 10
    recent_messages = state["messages"][-window_size:]

    metrics = state.get("current_turn_metrics")
    resp = await stream_dual_llm(
        recent_messages,
        full_system_prompt,
        state.get("stream_queue"),
        opik_trace_id=state.get("opik_trace_id"),
        stage=current_stage,
        metrics=metrics,
    )

    new_messages = list(state["messages"]) + [{"role": "assistant", "content": resp}]
    return {
        "messages": new_messages,
    }


@traceable(name="voice_agent_evaluator_node", run_type="chain")
async def evaluate_and_route(state: InterviewState) -> dict[str, Any]:
    """
    Evaluator Node in LangGraph.
    Silent background evaluation that checks objective_met and controls stage progression.
    """
    current_stage = state.get("stage", InterviewStage.INTRO_AUDIO_CHECK.value)
    interview_type = state.get("interview_type", "general")
    normalized_type = normalize_interview_type(interview_type)
    flow = INTERVIEW_FLOWS.get(normalized_type, INTERVIEW_FLOWS["general"])

    start_time = state.get("start_time", time.time())
    elapsed_minutes = (time.time() - start_time) / 60.0
    max_duration = state.get("max_duration_minutes", 50)
    time_exceeded = elapsed_minutes >= max_duration

    turns_in_stage = state.get("turns_in_stage", 0) + 1
    stage_rule = EVALUATOR_RULES.get(current_stage, "Advance when appropriate.")

    eval_code = state.get("latest_code") or "None"
    eval_exec_raw = state.get("latest_execution")
    if isinstance(eval_exec_raw, dict):
        st = eval_exec_raw.get("status", "Unknown")
        raw_info = eval_exec_raw.get("raw") or {}
        passed = raw_info.get("passed_tests", 0)
        total = raw_info.get("total_tests", 0)
        eval_exec = f"Status: {st} | Tests Passed: {passed}/{total}"
    elif eval_exec_raw:
        eval_exec = str(eval_exec_raw)
    else:
        eval_exec = "None"

    eval_prompt = EVALUATION_PROMPT.format(
        stage=current_stage,
        turns_in_stage=turns_in_stage,
        elapsed_minutes=int(elapsed_minutes),
        max_duration_minutes=max_duration,
        stage_rule=stage_rule,
        latest_code=eval_code,
        latest_execution=eval_exec,
    )

    recent_messages = state.get("messages", [])[-10:]
    eval_res = await evaluate_llm(
        messages=recent_messages,
        system_prompt=eval_prompt,
        opik_trace_id=state.get("opik_trace_id"),
        metrics=state.get("current_turn_metrics"),
    )

    eval_dict = eval_res.model_dump() if hasattr(eval_res, "model_dump") else eval_res
    objective_met = eval_dict.get("objective_met", False)
    trigger_next_q = eval_dict.get("trigger_next_question", False)

    evaluations = list(state.get("evaluations", [])) + [eval_dict]

    min_turns = MIN_TURNS_PER_STAGE.get(current_stage, 1)
    min_turns_met = turns_in_stage >= min_turns
    should_advance = (objective_met and min_turns_met) or turns_in_stage >= 10 or time_exceeded
    should_end = state.get("should_end", False)

    # Multi-question logic: Strictly guard question switching.
    # NEVER switch to the next question while the candidate is debugging, speaking, or if tests have not passed!
    questions = state.get("ai_selected_questions", [])
    current_idx = state.get("active_question_index", 0)
    active_question_index = current_idx
    is_last_question = current_idx >= len(questions) - 1

    question_end_stages = {
        "dsa": [InterviewStage.DSA_TESTING.value],
        "hr": [InterviewStage.BEHAVIORAL_FOLLOWUP.value],
        "pm": [InterviewStage.PM_METRICS_AND_EXECUTION.value],
        "ai_ml": [InterviewStage.AIML_SYSTEM.value],
        "system_design": [InterviewStage.SYSTEM_DESIGN_DEEP_DIVE.value],
    }
    allowed_end_stages = question_end_stages.get(normalized_type, [])

    # In DSA, the problem is ONLY finished if candidate ran code, all tests passed, and trigger_next_q is True
    if normalized_type == "dsa":
        exec_raw = state.get("latest_execution") or {}
        tests_passed = False
        if isinstance(exec_raw, dict):
            status_str = str(exec_raw.get("status", "")).lower()
            raw_info = exec_raw.get("raw") or {}
            p = raw_info.get("passed_tests", 0)
            t = raw_info.get("total_tests", 0)
            if (status_str == "accepted" or (t > 0 and p == t)):
                tests_passed = True
        # Strictly require explicit next-question trigger AND verified tests passed
        is_question_finished = (
            current_stage in allowed_end_stages
            and trigger_next_q
            and tests_passed
            and not is_last_question
        )
    else:
        # For non-coding tracks, require explicit trigger_next_q
        is_question_finished = (
            current_stage in allowed_end_stages
            and trigger_next_q
            and not is_last_question
        )

    if is_question_finished and not is_last_question:
        if normalized_type == "dsa":
            next_stage = InterviewStage.DSA_PRESENTATION.value
        elif normalized_type == "hr":
            next_stage = InterviewStage.BEHAVIORAL_QUESTION.value
        elif normalized_type == "pm":
            next_stage = InterviewStage.PM_PROBLEM_FRAMING.value
        elif normalized_type == "ai_ml":
            next_stage = InterviewStage.AIML_FUNDAMENTALS.value
        elif normalized_type == "system_design":
            next_stage = InterviewStage.SYSTEM_DESIGN_REQUIREMENTS.value
        else:
            next_stage = InterviewStage.RESUME_PROBE.value

        active_question_index = current_idx + 1
        turns_in_stage = 0
        state["latest_code"] = None
        state["latest_execution"] = None
    elif current_stage == InterviewStage.COMPLETED.value:
        next_stage = InterviewStage.COMPLETED.value
        should_end = True
    elif current_stage == InterviewStage.WRAP_UP.value:
        if should_advance or turns_in_stage >= 4:
            next_stage = InterviewStage.COMPLETED.value
            turns_in_stage = 0
            should_end = True
        else:
            next_stage = current_stage
    elif time_exceeded:
        next_stage = InterviewStage.WRAP_UP.value
        turns_in_stage = 0
    elif should_advance:
        if current_stage in flow:
            idx = flow.index(current_stage)
            next_stage = flow[idx + 1] if idx + 1 < len(flow) else InterviewStage.COMPLETED.value
        else:
            next_stage = InterviewStage.WRAP_UP.value
        turns_in_stage = 0
    else:
        next_stage = current_stage

    if next_stage == InterviewStage.COMPLETED.value:
        should_end = True

    return {
        "stage": next_stage,
        "turns_in_stage": turns_in_stage,
        "evaluations": evaluations,
        "should_end": should_end,
        "active_question_index": active_question_index,
    }
