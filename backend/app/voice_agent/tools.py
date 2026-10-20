"""
ThinkAloudAI — Real-Time Voice Agent Interview Tools.
Provides tool declarations, schemas, and execution handlers for:
- open_code_editor
- close_code_editor
- update_code_editor (with line highlight)
- run_candidate_code
- capture_candidate_photo
- set_interview_stage
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger("voice_agent_tools")

# ============================================================
# OpenAI-Compatible Tool Declarations
# ============================================================
INTERVIEW_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "open_code_editor",
            "description": (
                "Reveal and open the live DSA code editor workspace on the candidate's screen. "
                "Call this ONLY when transitioning from the spoken introduction / background discussion "
                "to the coding problem phase, or when presenting a new algorithmic challenge."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "problem_title": {
                        "type": "string",
                        "description": "Title of the problem, e.g. 'LRU Cache' or 'Course Schedule II'",
                    },
                    "difficulty": {
                        "type": "string",
                        "enum": ["Easy", "Medium", "Hard"],
                        "description": "Difficulty level of the problem",
                    },
                    "problem_statement": {
                        "type": "string",
                        "description": "Clear description of the problem, constraints, and 1-2 input/output examples",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["python", "cpp", "javascript"],
                        "description": "Programming language for the starter template (default: 'python')",
                    },
                    "starter_code": {
                        "type": "string",
                        "description": "Complete starter code template with function signature and test harness",
                    },
                    "time_complexity_target": {
                        "type": "string",
                        "description": "Target Big-O time complexity, e.g. 'O(n)' or 'O(n log n)'",
                    },
                    "space_complexity_target": {
                        "type": "string",
                        "description": "Target Big-O space complexity, e.g. 'O(1)' or 'O(n)'",
                    },
                },
                "required": ["problem_title", "difficulty", "problem_statement", "language", "starter_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "close_code_editor",
            "description": (
                "Hide and close the code editor workspace, returning the candidate's screen to the "
                "full dual-video conversation focus view. Call this when concluding the coding phase "
                "to discuss Big-O complexity analysis, architectural trade-offs, final wrap-up Q&A, "
                "or when the candidate asks to close the editor."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation for closing the workspace (e.g. 'Transitioning to complexity defense')",
                    },
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_code_editor",
            "description": (
                "Modify or replace the code in the candidate's editor, or highlight a specific line "
                "where a bug or edge-case exists to draw their attention."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "The updated code to insert into the editor (or empty string if only highlighting)",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["python", "cpp", "javascript"],
                        "description": "Optional language switch",
                    },
                    "highlight_line": {
                        "type": "integer",
                        "description": "Optional 1-indexed line number in the candidate's code to highlight (e.g. line 14 has off-by-one)",
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Brief note on what was changed or why this line is highlighted",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_candidate_code",
            "description": (
                "Trigger execution of the candidate's current code in the sandbox and inspect stdout/stderr. "
                "Call this to test their solution yourself or verify edge-case handling."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Brief note on what you are testing (e.g. 'Testing empty array edge case')",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "capture_candidate_photo",
            "description": (
                "Request an instantaneous webcam photo capture of the candidate. "
                "Call this when you want to visually observe their facial expression, gaze, posture, "
                "or if they are gesturing or referencing notes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Why you are requesting visual inspection (e.g. 'Observing problem decomposition posture')",
                    },
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_interview_stage",
            "description": "Update the interview stage indicator on the candidate interface.",
            "parameters": {
                "type": "object",
                "properties": {
                    "stage": {
                        "type": "string",
                        "description": "Stage label: 'Introduction', 'Problem Formulation', 'Live Implementation', 'Complexity Analysis', 'Evaluation Wrap-up'",
                    },
                },
                "required": ["stage"],
            },
        },
    },
]

# System prompt fragment describing tools for models that need inline descriptions
TOOL_SYSTEM_INSTRUCTION = """
AVAILABLE INTERACTIVE INTERVIEW TOOLS:
You have direct control over the candidate's workspace interface via tools:
- open_code_editor(problem_title, difficulty, problem_statement, language, starter_code, time_complexity_target, space_complexity_target): Opens Monaco editor.
- close_code_editor(reason): Closes editor back to dual-video view for complexity analysis or wrap-up.
- update_code_editor(code, language, highlight_line, explanation): Modifies code or highlights a buggy line.
- run_candidate_code(reason): Executes current code in sandbox.
- capture_candidate_photo(reason): Takes instant webcam snapshot to observe candidate posture/gaze.
- set_interview_stage(stage): Updates interview stage indicator.

You may invoke tools natively or by emitting an inline block:
<tool_call>
{"name": "open_code_editor", "parameters": {"problem_title": "...", "difficulty": "...", "problem_statement": "...", "language": "python", "starter_code": "..."}}
</tool_call>
"""


def extract_inline_tool_calls(text: str) -> tuple[str, list[dict[str, Any]]]:
    """
    Parses any `<tool_call>...</tool_call>` blocks from generated text,
    returns (cleaned_text_for_speech, list_of_parsed_tool_calls).
    """
    tool_calls: list[dict[str, Any]] = []
    pattern = r"<tool_call>([\s\S]*?)</tool_call>"

    for match in re.finditer(pattern, text):
        raw_json = match.group(1).strip()
        try:
            parsed = json.loads(raw_json)
            tool_calls.append(parsed)
        except Exception as e:
            logger.warning(f"Failed to parse inline tool call: {raw_json} error: {e}")

    cleaned = re.sub(pattern, "", text).strip()
    return cleaned, tool_calls


async def execute_agent_tool(
    name: str,
    args: dict[str, Any],
    agent: Any,
) -> dict[str, Any]:
    """
    Executes an AI interview tool by modifying agent state and publishing
    DataChannel packets down to the connected LiveKit room participants.
    """
    logger.info(f"Executing agent tool: {name} with args: {args}")

    async def _publish(payload: dict[str, Any]) -> None:
        if agent.room and agent.room.local_participant:
            try:
                data = json.dumps(payload).encode("utf-8")
                await agent.room.local_participant.publish_data(data, reliable=True)
            except Exception as e:
                logger.warning(f"Failed to publish DataChannel payload for tool {name}: {e}")

    # 1. OPEN CODE EDITOR
    if name == "open_code_editor":
        active_idx = agent.state.get("active_question_index", 0)
        questions = agent.state.get("ai_selected_questions", [])
        active_q = questions[active_idx] if active_idx < len(questions) else {}

        prob_title = args.get("problem_title") or active_q.get("title") or "DSA Challenge"
        prob_diff = args.get("difficulty") or active_q.get("difficulty") or "Medium"
        prob_desc = args.get("problem_statement") or active_q.get("description") or ""
        lang = (args.get("language") or "python").lower()
        starter = args.get("starter_code") or active_q.get("python_starter_code") or ""
        tc = args.get("time_complexity_target") or "O(n)"
        sc = args.get("space_complexity_target") or "O(1)"

        agent.state["is_editor_open"] = True
        agent.state["stage"] = "dsa_coding"
        if starter:
            agent.state["latest_code"] = starter
            agent.latest_code = starter

        payload = {
            "type": "ai_tool_call",
            "tool": "open_code_editor",
            "payload": {
                "problemTitle": prob_title,
                "difficulty": prob_diff,
                "problemStatement": prob_desc,
                "language": lang,
                "starterCode": starter,
                "timeComplexityTarget": tc,
                "spaceComplexityTarget": sc,
            },
        }
        await _publish(payload)
        # Also broadcast legacy event for compatibility
        await _publish({"type": "reveal_problem"})
        return {"status": "success", "message": f"Opened code editor for '{prob_title}'"}

    # 2. CLOSE CODE EDITOR
    elif name == "close_code_editor":
        reason = args.get("reason", "Returning to dual-video conversation focus")
        agent.state["is_editor_open"] = False
        payload = {
            "type": "ai_tool_call",
            "tool": "close_code_editor",
            "payload": {"reason": reason},
        }
        await _publish(payload)
        return {"status": "success", "message": f"Closed code editor: {reason}"}

    # 3. UPDATE CODE EDITOR (WITH LINE HIGHLIGHT)
    elif name == "update_code_editor":
        code_update = args.get("code")
        lang = args.get("language")
        highlight_line = args.get("highlight_line")
        explanation = args.get("explanation", "")

        if code_update:
            agent.state["latest_code"] = code_update
            agent.latest_code = code_update
        if highlight_line:
            agent.state["highlight_line"] = highlight_line

        payload = {
            "type": "ai_tool_call",
            "tool": "update_code_editor",
            "payload": {
                "code": code_update,
                "language": lang,
                "highlightLine": highlight_line,
                "explanation": explanation,
            },
        }
        await _publish(payload)
        return {"status": "success", "message": f"Updated code editor (highlight line: {highlight_line})"}

    # 4. RUN CANDIDATE CODE
    elif name == "run_candidate_code":
        reason = args.get("reason", "AI verification")
        payload = {
            "type": "ai_tool_call",
            "tool": "run_candidate_code",
            "payload": {"reason": reason},
        }
        await _publish(payload)
        return {"status": "success", "message": f"Triggered candidate code execution: {reason}"}

    # 5. CAPTURE CANDIDATE PHOTO SNAPSHOT
    elif name == "capture_candidate_photo":
        reason = args.get("reason", "Visual inspection")
        agent._waiting_for_photo = True
        payload = {
            "type": "ai_tool_call",
            "tool": "capture_candidate_photo",
            "payload": {"reason": reason},
        }
        await _publish(payload)
        return {"status": "success", "message": f"Requested candidate webcam snapshot: {reason}"}

    # 6. SET INTERVIEW STAGE
    elif name == "set_interview_stage":
        stage = args.get("stage", "")
        if stage:
            payload = {
                "type": "ai_tool_call",
                "tool": "set_interview_stage",
                "payload": {"stage": stage},
            }
            await _publish(payload)
        return {"status": "success", "message": f"Set stage to '{stage}'"}

    logger.warning(f"Unknown tool invoked: {name}")
    return {"status": "error", "message": f"Unknown tool: {name}"}
