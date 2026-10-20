import contextlib
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


def parse_traceback(tb_str: str) -> str:
    """Subtracts line offset from python traceback to point to user code."""
    if not tb_str:
        return ""

    def replace_line(match):
        line_num = int(match.group(1))
        return f"line {max(1, line_num - 5)}"

    return re.sub(r"line (\d+)", replace_line, tb_str)


def parse_cpp_error(err_msg: str, test_harness: str) -> str:
    """Subtracts the dynamic offset from main.cpp line numbers."""
    if not err_msg or not test_harness:
        return err_msg
    if "// USER_CODE_START" in test_harness:
        offset = test_harness.split("// USER_CODE_START")[0].count("\n") + 1
    elif "{{user_code}}" in test_harness:
        offset = test_harness.split("{{user_code}}")[0].count("\n") + 1
    else:
        offset = 0

    def replace_cpp_line(match):
        line_num = int(match.group(1))
        return f"solution.cpp:{max(1, line_num - offset)}"

    return re.sub(r"(?:/home/user/main\.cpp|main\.cpp):(\d+)", replace_cpp_line, err_msg)


def normalize_val(v: Any) -> Any:
    """Recursively normalizes nested lists, tuples, and sets for order-independent comparison."""
    if isinstance(v, (list, tuple)):
        normalized_items = [normalize_val(x) for x in v]
        try:
            return sorted(normalized_items, key=lambda x: str(x))
        except Exception:
            return normalized_items
    if isinstance(v, set):
        try:
            return sorted([normalize_val(x) for x in v], key=lambda x: str(x))
        except Exception:
            return list(v)
    if isinstance(v, dict):
        return {k: normalize_val(val) for k, val in sorted(v.items())}
    return v


def compare(actual: Any, expected: Any, mode: str, mutated_arg: Any = None, return_type: str | None = None) -> bool:
    """Compares actual output with expected output based on comparison mode."""
    # If function mutated in-place and returned None:
    if (
        actual is None
        and mutated_arg is not None
        and (return_type == "void" or (return_type is None and compare(mutated_arg, expected, mode, return_type="void")))
    ):
        actual = mutated_arg

    # Normalize stringified JSON in expected or actual
    if isinstance(expected, str) and not isinstance(actual, str):
        trimmed = expected.strip()
        if (trimmed.startswith("[") and trimmed.endswith("]")) or (trimmed.startswith("{") and trimmed.endswith("}")):
            with contextlib.suppress(Exception):
                expected = json.loads(trimmed)
        elif trimmed == "true":
            expected = True
        elif trimmed == "false":
            expected = False
        elif trimmed.lstrip("-").isdigit():
            expected = int(trimmed)

    if isinstance(actual, str) and not isinstance(expected, str):
        trimmed = actual.strip()
        if (trimmed.startswith("[") and trimmed.endswith("]")) or (trimmed.startswith("{") and trimmed.endswith("}")):
            with contextlib.suppress(Exception):
                actual = json.loads(trimmed)
        elif trimmed == "true":
            actual = True
        elif trimmed == "false":
            actual = False
        elif trimmed.lstrip("-").isdigit():
            actual = int(trimmed)

    if mode in ("unordered", "unordered_nested"):
        if isinstance(actual, (list, tuple)) and isinstance(expected, (list, tuple)):
            return normalize_val(actual) == normalize_val(expected)
        return actual == expected

    if mode == "float_tolerance" or isinstance(expected, float):
        try:
            return abs(float(actual) - float(expected)) < 1e-5
        except Exception:
            return False

    if mode == "any_of":
        if isinstance(expected, list):
            return actual in expected or normalize_val(actual) in [
                normalize_val(e) for e in expected
            ]
        return actual == expected

    if isinstance(actual, (list, tuple)) and isinstance(expected, (list, tuple)):
        return actual == expected

    return actual == expected


def _normalize_single_test_case(tc: dict[str, Any]) -> dict[str, Any]:
    """Normalizes various test case schemas (args dict vs input string, stringified expected)."""
    if not isinstance(tc, dict):
        return {"args": {}, "expected": None}
    res = dict(tc)
    if "args" not in res and "input" in res:
        raw_input = res["input"]
        if isinstance(raw_input, dict):
            res["args"] = raw_input
        elif isinstance(raw_input, str):
            args_dict = {}
            parts = re.findall(r'(\w+)\s*=\s*(\[[^\]]*\]|"[^"]*"|\'[^\']*\'|[^,]+)', raw_input)
            for k, v in parts:
                v = v.strip()
                try:
                    args_dict[k] = json.loads(v)
                except Exception:
                    try:
                        args_dict[k] = int(v) if v.lstrip("-").isdigit() else float(v)
                    except Exception:
                        args_dict[k] = v
            res["args"] = args_dict
        else:
            res["args"] = {"input": raw_input}

    if "expected" in res and isinstance(res["expected"], str):
        trimmed = res["expected"].strip()
        if (trimmed.startswith("[") and trimmed.endswith("]")) or (trimmed.startswith("{") and trimmed.endswith("}")):
            with contextlib.suppress(Exception):
                res["expected"] = json.loads(trimmed)
        elif trimmed == "true":
            res["expected"] = True
        elif trimmed == "false":
            res["expected"] = False
        elif trimmed.lstrip("-").isdigit():
            res["expected"] = int(trimmed)

    return res


def _parse_test_cases(
    test_cases_input: Any, default_function_name: str
) -> tuple[list[dict[str, Any]], str, str, list[dict[str, Any]], str | None]:
    """
    Parses test case schema and returns:
    (test_cases, comparison_mode, function_name, params, return_type)
    """
    try:
        if isinstance(test_cases_input, str):
            schema = json.loads(test_cases_input)
        elif isinstance(test_cases_input, (dict, list)):
            schema = test_cases_input
        else:
            schema = {}

        if isinstance(schema, dict):
            raw_cases = schema.get("cases", [])
            comparison_mode = schema.get("comparison", "exact")
            func_name = schema.get("function_name", default_function_name) or default_function_name
            params = schema.get("params", [])
            return_type = schema.get("return_type")
        elif isinstance(schema, list):
            raw_cases = schema
            comparison_mode = "exact"
            func_name = default_function_name
            params = []
            return_type = None
        else:
            raw_cases = []
            comparison_mode = "exact"
            func_name = default_function_name
            params = []
            return_type = None

        test_cases = [_normalize_single_test_case(c) for c in raw_cases]
    except Exception:
        test_cases = []
        comparison_mode = "exact"
        func_name = default_function_name
        params = []
        return_type = None

    return test_cases, comparison_mode, func_name, params, return_type


def _build_python_runner(
    code: str,
    test_cases: list[dict[str, Any]],
    function_name: str,
) -> str:
    """Builds Python test harness runner script."""
    test_cases_escaped = json.dumps(json.dumps(test_cases))
    return f"""# -*- coding: utf-8 -*-
import json
import time
import sys
import copy
import traceback
from typing import *

# User code start
{code}
# User code end

test_cases = json.loads({test_cases_escaped})
function_name = "{function_name}"

results = []
start_time = time.perf_counter()

for tc in test_cases:
    tc_start = time.perf_counter()
    try:
        solution_instance = None
        if 'Solution' in locals():
            solution_instance = locals()['Solution']()

        raw_args = tc.get('args', {{}})
        kwargs = copy.deepcopy(raw_args)

        func = None
        if solution_instance and hasattr(solution_instance, function_name):
            func = getattr(solution_instance, function_name)
        elif function_name in locals():
            func = locals()[function_name]
        elif solution_instance:
            methods = [m for m in dir(solution_instance) if not m.startswith('_')]
            if methods:
                func = getattr(solution_instance, methods[0])

        if not func:
            results.append({{"output": None, "mutated": None, "error": f"Function '{{function_name}}' not found.", "time_ms": 0.0}})
            continue

        try:
            result = func(**kwargs)
        except TypeError as te:
            if "unexpected keyword argument" in str(te) or "positional argument" in str(te):
                result = func(*kwargs.values())
            else:
                raise

        # Capture in-place mutations (e.g. for sortColors, rotate, moveZeroes)
        mutated = None
        for key in ['nums', 'matrix', 'board', 'intervals']:
            if key in kwargs and isinstance(kwargs[key], (list, dict)):
                mutated = kwargs[key]
                break
        if mutated is None and len(kwargs) == 1:
            first_val = next(iter(kwargs.values()))
            if isinstance(first_val, (list, dict)):
                mutated = first_val

        tc_time = (time.perf_counter() - tc_start) * 1000
        results.append({{"output": result, "mutated": mutated, "error": None, "time_ms": tc_time}})
    except Exception as e:
        tc_time = (time.perf_counter() - tc_start) * 1000
        results.append({{"output": None, "mutated": None, "error": traceback.format_exc(), "time_ms": tc_time}})

execution_time_ms = (time.perf_counter() - start_time) * 1000
print(json.dumps({{"results": results, "time_ms": execution_time_ms}}, default=str))
"""


BITS_STDCPP_HEADER = """// Comprehensive C++ Standard Library Precompiled Header compatibility (bits/stdc++.h)
#ifndef _BITS_STDCPP_H
#define _BITS_STDCPP_H

// C system & math headers
#include <cassert>
#include <cctype>
#include <cerrno>
#include <cfloat>
#include <ciso646>
#include <climits>
#include <clocale>
#include <cmath>
#include <csetjmp>
#include <csignal>
#include <cstdarg>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cinttypes>
#include <cstdint>

// C++ STL containers & algorithms
#include <algorithm>
#include <array>
#include <atomic>
#include <bitset>
#include <chrono>
#include <complex>
#include <condition_variable>
#include <deque>
#include <exception>
#include <forward_list>
#include <fstream>
#include <functional>
#include <future>
#include <initializer_list>
#include <iomanip>
#include <ios>
#include <iosfwd>
#include <iostream>
#include <istream>
#include <iterator>
#include <limits>
#include <list>
#include <locale>
#include <map>
#include <memory>
#include <mutex>
#include <new>
#include <numeric>
#include <ostream>
#include <queue>
#include <random>
#include <ratio>
#include <regex>
#include <scoped_allocator>
#include <set>
#include <sstream>
#include <stack>
#include <stdexcept>
#include <streambuf>
#include <string>
#include <system_error>
#include <thread>
#include <tuple>
#include <typeindex>
#include <typeinfo>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <valarray>
#include <vector>

#endif // _BITS_STDCPP_H
"""


def _build_cpp_runner(
    code: str,
    test_harness: str,
    test_cases: list[dict[str, Any]],
    params: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    """Prepares C++ code and Python compilation/execution runner."""
    cpp_headers = """#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <map>
#include <set>
#include <queue>
#include <stack>
#include <deque>
#include <algorithm>
#include <cmath>
#include <sstream>
#include <numeric>
#include <climits>
#include <cstring>
#include <cctype>
#include <utility>
#include <functional>
#include <bitset>
#include <tuple>
#include <iomanip>
#include <cassert>
"""
    cpp_code = cpp_headers + "\n" + test_harness.replace("// USER_CODE_START\n// USER_CODE_END", code).replace("{{user_code}}", code)

    test_cases_escaped = json.dumps(json.dumps(test_cases))
    ordered_params_escaped = json.dumps([p["name"] for p in (params or []) if isinstance(p, dict) and "name" in p])
    bits_header_escaped = json.dumps(BITS_STDCPP_HEADER)

    runner_script = f"""# -*- coding: utf-8 -*-
import json
import subprocess
import time
import sys
import os

# Automatically provision bits/stdc++.h compatibility header for isolated VMs / Clang
os.makedirs("bits", exist_ok=True)
bits_path = os.path.join("bits", "stdc++.h")
if not os.path.exists(bits_path):
    with open(bits_path, "w", encoding="utf-8") as f:
        f.write({bits_header_escaped})

compiler = "g++" if __import__('shutil').which('g++') else "clang++"
compile_proc = subprocess.run([compiler, "-O2", "-std=c++17", "-I.", "main.cpp", "-o", "sol"], capture_output=True, text=True)
if compile_proc.returncode != 0:
    print(json.dumps({{"compile_error": compile_proc.stderr}}))
    sys.exit(0)

test_cases = json.loads({test_cases_escaped})
ordered_params = {ordered_params_escaped}
results = []
start_time = time.perf_counter()

for tc in test_cases:
    stdin_data = ""
    tc_args = tc.get('args', {{}})
    param_keys = [k for k in ordered_params if k in tc_args] if ordered_params else list(tc_args.keys())
    for k in tc_args.keys():
        if k not in param_keys:
            param_keys.append(k)
    for param_name in param_keys:
        param_val = tc_args[param_name]
        if isinstance(param_val, list):
            stdin_data += "[" + ",".join(map(str, param_val)) + "]\\n"
        elif isinstance(param_val, bool):
            stdin_data += ("true" if param_val else "false") + "\\n"
        else:
            stdin_data += str(param_val) + "\\n"

    tc_start = time.perf_counter()
    try:
        proc = subprocess.run(["./sol"], input=stdin_data, capture_output=True, text=True, timeout=3)
        tc_time = (time.perf_counter() - tc_start) * 1000
        if proc.returncode != 0:
            results.append({{"output": None, "error": f"Exit code {{proc.returncode}}. Stderr: {{proc.stderr}}", "time_ms": tc_time}})
        else:
            out = proc.stdout.strip()
            try:
                if out == "true": parsed_out = True
                elif out == "false": parsed_out = False
                else: parsed_out = json.loads(out)
            except Exception:
                parsed_out = out
            results.append({{"output": parsed_out, "error": None, "time_ms": tc_time}})

    except subprocess.TimeoutExpired:
        tc_time = (time.perf_counter() - tc_start) * 1000
        results.append({{"output": None, "error": "Time Limit Exceeded", "time_ms": tc_time}})

execution_time_ms = (time.perf_counter() - start_time) * 1000
print(json.dumps({{"results": results, "time_ms": execution_time_ms}}, default=str))
"""
    return cpp_code, runner_script


def _execute_in_e2b(runner_script: str, cpp_code: str | None, language: str, timeout: int = 30) -> tuple[int, str, str, bool]:
    """Runs code in E2B cloud sandbox."""
    from e2b_code_interpreter import Sandbox

    create_kwargs = {}
    if settings.e2b_api_key:
        create_kwargs["api_key"] = settings.e2b_api_key

    with Sandbox.create(**create_kwargs) as sandbox:
        filename = "/home/user/runner.py"
        cmd = "python3 /home/user/runner.py"
        sandbox.files.write(filename, runner_script)
        if language == "cpp" and cpp_code:
            sandbox.files.write("/home/user/main.cpp", cpp_code)
            try:
                # Pre-provision bits/stdc++.h into E2B micro-VM sandbox filesystem
                sandbox.commands.run("mkdir -p /home/user/bits")
                sandbox.files.write("/home/user/bits/stdc++.h", BITS_STDCPP_HEADER)
            except Exception as bits_err:
                logger.debug(f"e2b_bits_provision_notice: {bits_err}")

        try:
            execution = sandbox.commands.run(cmd, timeout=timeout)
            return execution.exit_code, execution.stdout or "", execution.stderr or "", False
        except Exception as e:
            if hasattr(e, "exit_code"):
                return e.exit_code, getattr(e, "stdout", ""), getattr(e, "stderr", ""), False
            if "TimeoutException" in repr(e) or "timeout" in str(e).lower():
                return 1, "", "Execution timed out", True
            raise


def _execute_local(runner_script: str, cpp_code: str | None, language: str, timeout: int = 15) -> tuple[int, str, str, bool]:
    """Executes runner script locally inside an isolated temporary directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        runner_path = os.path.join(tmpdir, "runner.py")
        with open(runner_path, "w", encoding="utf-8") as f:
            f.write(runner_script)

        if language == "cpp" and cpp_code:
            main_path = os.path.join(tmpdir, "main.cpp")
            with open(main_path, "w", encoding="utf-8") as f:
                f.write(cpp_code)

            # Pre-provision bits/stdc++.h in isolated temporary directory
            bits_dir = os.path.join(tmpdir, "bits")
            os.makedirs(bits_dir, exist_ok=True)
            with open(os.path.join(bits_dir, "stdc++.h"), "w", encoding="utf-8") as f:
                f.write(BITS_STDCPP_HEADER)

        try:
            proc = subprocess.run(
                [sys.executable, "runner.py"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return proc.returncode, proc.stdout, proc.stderr, False
        except subprocess.TimeoutExpired:
            return 1, "", "Execution timed out", True


def run_code_isolated(
    code: str,
    function_name: str,
    test_cases_json: Any,
    language: str = "python",
    test_harness: str | None = None,
    return_type: str | None = None,
) -> dict[str, Any]:
    """
    Executes code against test cases in an isolated sandbox.
    Uses E2B Cloud Sandbox when configured, with seamless local subprocess fallback.
    Returns structured results including per-test case results.
    """
    if language not in ["python", "cpp"]:
        return {
            "status": "Unsupported Language",
            "passed_tests": 0,
            "total_tests": 0,
            "error_message": f"Language '{language}' is not supported.",
            "execution_time_ms": 0.0,
            "memory_used_kb": 0.0,
            "test_results": [],
        }

    test_cases, comparison_mode, resolved_func_name, params, extracted_return_type = _parse_test_cases(
        test_cases_json, function_name
    )
    if not return_type:
        return_type = extracted_return_type
    total_tests = len(test_cases)
    if total_tests == 0:
        return {
            "status": "Configuration Error",
            "passed_tests": 0,
            "total_tests": 0,
            "error_message": "No test cases configured.",
            "execution_time_ms": 0.0,
            "memory_used_kb": 0.0,
            "test_results": [],
        }

    cpp_code = None
    if language == "python":
        runner_script = _build_python_runner(code, test_cases, resolved_func_name)
    elif language == "cpp":
        if not test_harness:
            return {
                "status": "Runtime Error",
                "passed_tests": 0,
                "total_tests": total_tests,
                "error_message": "C++ test harness not found for this question.",
                "execution_time_ms": 0.0,
                "memory_used_kb": 0.0,
                "test_results": [],
            }
        cpp_code, runner_script = _build_cpp_runner(code, test_harness, test_cases, params)

    # Execute in E2B if API key is configured, else fallback to local runner
    exit_code, stdout, stderr, is_timeout = 0, "", "", False
    used_e2b = False

    if bool(settings.e2b_api_key):
        try:
            exit_code, stdout, stderr, is_timeout = _execute_in_e2b(
                runner_script, cpp_code, language
            )
            used_e2b = True
        except Exception as e:
            logger.warning(f"e2b_execution_fallback: {e}")
            used_e2b = False

    if not used_e2b:
        try:
            exit_code, stdout, stderr, is_timeout = _execute_local(
                runner_script, cpp_code, language
            )
        except Exception as e:
            return {
                "status": "System Error",
                "passed_tests": 0,
                "total_tests": total_tests,
                "error_message": f"Local execution failed: {str(e)}",
                "execution_time_ms": 0.0,
                "memory_used_kb": 0.0,
                "test_results": [],
            }

    if is_timeout:
        return {
            "status": "Time Limit Exceeded",
            "passed_tests": 0,
            "total_tests": total_tests,
            "error_message": "Code execution exceeded time limit.",
            "execution_time_ms": 15000.0,
            "memory_used_kb": 0.0,
            "test_results": [],
        }

    # Parse JSON output from runner
    out_data = None
    stdout_lines = stdout.strip().split("\n")
    for line in reversed(stdout_lines):
        line = line.strip()
        if line.startswith("{"):
            try:
                out_data = json.loads(line)
                break
            except json.JSONDecodeError:
                pass

    if not out_data:
        err_msg = stderr.strip() or stdout.strip()
        if language == "cpp" and cpp_code:
            err_msg = parse_cpp_error(err_msg, cpp_code)
        elif language == "python" and err_msg:
            err_msg = parse_traceback(err_msg)
        return {
            "status": "Runtime Error" if exit_code != 0 else "Execution Error",
            "passed_tests": 0,
            "total_tests": total_tests,
            "error_message": err_msg or "Failed to parse test results from execution runner.",
            "execution_time_ms": 0.0,
            "memory_used_kb": 0.0,
            "test_results": [],
        }

    if "compile_error" in out_data:
        comp_err = out_data["compile_error"]
        if language == "cpp" and cpp_code:
            comp_err = parse_cpp_error(comp_err, cpp_code)
        return {
            "status": "Compilation Error",
            "passed_tests": 0,
            "total_tests": total_tests,
            "error_message": comp_err,
            "execution_time_ms": 0.0,
            "memory_used_kb": 0.0,
            "test_results": [],
        }

    results = out_data.get("results", [])
    total_time_ms = out_data.get("time_ms", 0.0)

    passed = 0
    first_error = None
    test_results: list[dict[str, Any]] = []

    for i, res in enumerate(results):
        if i >= len(test_cases):
            break
        tc = test_cases[i]
        tc_args = tc.get("args")
        expected = tc.get("expected")
        tc_time = res.get("time_ms", 0.0)

        if res.get("error"):
            err = res["error"]
            if language == "python":
                err = parse_traceback(err)
            if not first_error:
                first_error = f"Test {i+1} failed with error: {err}"
            test_results.append(
                {
                    "test_case_index": i + 1,
                    "status": "error",
                    "input_args": tc_args,
                    "expected_output": expected,
                    "actual_output": None,
                    "error_message": err,
                    "execution_time_ms": tc_time,
                }
            )
            continue

        actual = res.get("output")
        mutated = res.get("mutated")
        is_correct = compare(actual, expected, comparison_mode, mutated_arg=mutated, return_type=return_type)

        if actual is None and mutated is not None and (return_type == "void" or (return_type is None and is_correct)):
            actual_to_report = mutated
        else:
            actual_to_report = actual
        if is_correct:
            passed += 1
            test_results.append(
                {
                    "test_case_index": i + 1,
                    "status": "passed",
                    "input_args": tc_args,
                    "expected_output": expected,
                    "actual_output": actual_to_report,
                    "error_message": None,
                    "execution_time_ms": tc_time,
                }
            )
        else:
            if not first_error:
                first_error = (
                    f"Test {i+1} failed.\nInput: {tc_args}\nExpected: {expected}\nGot: {actual_to_report}"
                )
            test_results.append(
                {
                    "test_case_index": i + 1,
                    "status": "failed",
                    "input_args": tc_args,
                    "expected_output": expected,
                    "actual_output": actual_to_report,
                    "error_message": f"Expected {expected}, got {actual_to_report}",
                    "execution_time_ms": tc_time,
                }
            )

    status = "Accepted" if passed == total_tests else "Wrong Answer"
    if passed < total_tests and first_error:
        if "Exit code" in first_error or "Traceback" in first_error:
            status = "Runtime Error"
        elif "Time Limit" in first_error:
            status = "Time Limit Exceeded"

    return {
        "status": status,
        "passed_tests": passed,
        "total_tests": total_tests,
        "error_message": first_error,
        "execution_time_ms": total_time_ms,
        "memory_used_kb": 1024.0,  # approximate baseline
        "memory_kb": 1024.0,
        "memory_mb": 1.0,
        "test_results": test_results,
    }
