import json

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dsa.models import DSAQuestion, ProblemTag
from app.modules.dsa.runner import compare, run_code_isolated


def test_compare_normalization():
    assert compare([1, 2], [2, 1], mode="unordered") is True
    assert compare([[1, 2], [3, 4]], [[3, 4], [2, 1]], mode="unordered") is True
    assert compare(3.1415926, 3.14159, mode="float_tolerance") is True
    assert compare(42, [10, 20, 42], mode="any_of") is True
    assert compare([1, 2], [1, 2], mode="exact") is True
    assert compare([1, 2], [2, 1], mode="exact") is False


def test_runner_python_success():
    code = """
def twoSum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        diff = target - n
        if diff in seen:
            return [seen[diff], i]
        seen[n] = i
    return []
"""
    test_cases = json.dumps([
        {"args": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
        {"args": {"nums": [3, 2, 4], "target": 6}, "expected": [1, 2]},
    ])

    result = run_code_isolated(
        code=code,
        function_name="twoSum",
        test_cases_json=test_cases,
        language="python",
    )

    assert result["status"] == "Accepted"
    assert result["passed_tests"] == 2
    assert result["total_tests"] == 2
    assert len(result["test_results"]) == 2
    assert result["test_results"][0]["status"] == "passed"


def test_runner_python_wrong_answer():
    code = """
def twoSum(nums, target):
    return [0, 0]
"""
    test_cases = json.dumps([
        {"args": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
    ])

    result = run_code_isolated(
        code=code,
        function_name="twoSum",
        test_cases_json=test_cases,
        language="python",
    )

    assert result["status"] == "Wrong Answer"
    assert result["passed_tests"] == 0
    assert result["total_tests"] == 1


def test_runner_python_runtime_error():
    code = """
def twoSum(nums, target):
    return 1 / 0
"""
    test_cases = json.dumps([
        {"args": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
    ])

    result = run_code_isolated(
        code=code,
        function_name="twoSum",
        test_cases_json=test_cases,
        language="python",
    )

    assert result["status"] == "Runtime Error"
    assert "ZeroDivisionError" in result["error_message"]


def test_runner_in_place_mutation():
    code = """
def moveZeroes(nums):
    insert_pos = 0
    for n in nums:
        if n != 0:
            nums[insert_pos] = n
            insert_pos += 1
    while insert_pos < len(nums):
        nums[insert_pos] = 0
        insert_pos += 1
"""
    test_cases = json.dumps([
        {"args": {"nums": [0, 1, 0, 3, 12]}, "expected": [1, 3, 12, 0, 0]},
    ])

    result = run_code_isolated(
        code=code,
        function_name="moveZeroes",
        test_cases_json=test_cases,
        language="python",
    )

    assert result["status"] == "Accepted"
    assert result["passed_tests"] == 1


@pytest.mark.asyncio
async def test_dsa_endpoints(client: AsyncClient, test_db_session: AsyncSession):
    # 1. Seed a sample question
    test_cases_json = json.dumps([
        {"args": {"nums": [1, 2, 3, 1]}, "expected": True},
        {"args": {"nums": [1, 2, 3, 4]}, "expected": False},
    ])
    question = DSAQuestion(
        title="Contains Duplicate",
        slug="contains-duplicate",
        description="Given an integer array nums, return true if any value appears at least twice.",
        difficulty="Easy",
        function_name="containsDuplicate",
        python_starter_code="class Solution:\n    def containsDuplicate(self, nums: List[int]) -> bool:\n        pass",
        test_cases=test_cases_json,
    )
    test_db_session.add(question)
    await test_db_session.flush()

    tag = ProblemTag(question_id=question.id, tag_name="Array")
    test_db_session.add(tag)
    await test_db_session.commit()

    # 2. List questions
    res = await client.get("/api/v1/dsa/questions")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Contains Duplicate"
    assert "Array" in data["items"][0]["tags"]

    # Filter by difficulty
    res_easy = await client.get("/api/v1/dsa/questions?difficulty=Easy")
    assert res_easy.status_code == 200
    assert len(res_easy.json()["items"]) == 1

    res_hard = await client.get("/api/v1/dsa/questions?difficulty=Hard")
    assert res_hard.status_code == 200
    assert len(res_hard.json()["items"]) == 0

    # 3. Get question by ID and by Slug
    res_by_id = await client.get(f"/api/v1/dsa/questions/{question.id}")
    assert res_by_id.status_code == 200
    assert res_by_id.json()["title"] == "Contains Duplicate"

    res_by_slug = await client.get("/api/v1/dsa/questions/contains-duplicate")
    assert res_by_slug.status_code == 200
    assert res_by_slug.json()["id"] == question.id

    # 4. Dry run code
    valid_solution = """
class Solution:
    def containsDuplicate(self, nums):
        return len(nums) != len(set(nums))
"""
    res_run = await client.post(
        f"/api/v1/dsa/questions/{question.id}/run",
        json={"code": valid_solution, "language": "python"},
    )
    assert res_run.status_code == 200
    run_data = res_run.json()
    assert run_data["status"] == "Accepted"
    assert run_data["passed_tests"] == 2

    # 5. Submit code
    res_submit = await client.post(
        f"/api/v1/dsa/questions/{question.id}/submit",
        json={
            "session_id": "test_session_user_1",
            "code": valid_solution,
            "language": "python",
        },
    )
    assert res_submit.status_code == 200
    submit_data = res_submit.json()
    assert submit_data["status"] == "Accepted"
    assert submit_data["submission_id"] is not None

    # 6. Check submissions history
    res_history = await client.get(
        f"/api/v1/dsa/questions/{question.id}/submissions?session_id=test_session_user_1"
    )
    assert res_history.status_code == 200
    history_data = res_history.json()
    assert len(history_data) == 1
    assert history_data[0]["status"] == "Accepted"

    # 7. Check recommendations
    res_rec = await client.get("/api/v1/dsa/recommendations?session_id=test_session_user_1")
    assert res_rec.status_code == 200

    # 8. Test dry run by SLUG with raw list custom_test_cases and verify memory metrics
    res_slug_run = await client.post(
        "/api/v1/dsa/questions/contains-duplicate/run",
        json={
            "code": valid_solution,
            "language": "python",
            "custom_test_cases": [
                {"args": {"nums": [9, 9, 8]}, "expected": True},
                {"args": {"nums": [1, 2, 3]}, "expected": False},
            ],
        },
    )
    assert res_slug_run.status_code == 200
    slug_run_data = res_slug_run.json()
    assert slug_run_data["status"] == "Accepted"
    assert slug_run_data["passed_tests"] == 2
    assert slug_run_data["total_tests"] == 2
    assert "memory_kb" in slug_run_data
    assert "memory_mb" in slug_run_data

    # 9. Test submit and submissions history by SLUG
    res_slug_submit = await client.post(
        "/api/v1/dsa/questions/contains-duplicate/submit",
        json={
            "session_id": "test_session_user_1",
            "code": valid_solution,
            "language": "python",
        },
    )
    assert res_slug_submit.status_code == 200
    assert res_slug_submit.json()["status"] == "Accepted"

    res_slug_history = await client.get(
        "/api/v1/dsa/questions/contains-duplicate/submissions?session_id=test_session_user_1"
    )
    assert res_slug_history.status_code == 200
    assert len(res_slug_history.json()) == 2


def test_runner_python_none_return_non_void():
    code = """
class Solution:
    def twoSum(self, nums, target):
        pass
"""
    test_cases = [
        {"args": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
    ]
    result = run_code_isolated(
        code=code,
        function_name="twoSum",
        test_cases_json=test_cases,
        language="python",
        return_type="int[]",
    )
    assert result["status"] == "Wrong Answer"
    assert result["passed_tests"] == 0
    test_res = result["test_results"][0]
    # Crucial bug fix: Should NOT report input [2, 7, 11, 15] as actual output when function returns None
    assert test_res["actual_output"] is None or test_res["actual_output"] == "None"


def test_runner_custom_test_cases_formats():
    code = """
def twoSum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        diff = target - n
        if diff in seen:
            return [seen[diff], i]
        seen[n] = i
    return []
"""
    # 1. Raw Python list of dicts
    raw_list = [
        {"args": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]}
    ]
    res1 = run_code_isolated(
        code=code,
        function_name="twoSum",
        test_cases_json=raw_list,
        language="python",
    )
    assert res1["status"] == "Accepted"
    assert res1["passed_tests"] == 1

    # 2. String input / expected format
    str_cases = [
        {"input": "nums = [2, 7, 11, 15], target = 9", "expected": "[0, 1]"}
    ]
    res2 = run_code_isolated(
        code=code,
        function_name="twoSum",
        test_cases_json=str_cases,
        language="python",
    )
    assert res2["status"] == "Accepted"
    assert res2["passed_tests"] == 1


def test_runner_cpp_with_bits_stdcxx():
    """Verifies that C++ submissions containing #include <bits/stdc++.h> compile and execute cleanly."""
    cpp_code = """
#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> mp;
        for (int i = 0; i < (int)nums.size(); i++) {
            int comp = target - nums[i];
            if (mp.count(comp)) {
                return {mp[comp], i};
            }
            mp[nums[i]] = i;
        }
        return {};
    }
};
"""
    test_harness = """
// USER_CODE_START
// USER_CODE_END

int main() {
    string line;
    while (getline(cin, line)) {
        if (line.empty()) continue;
        vector<int> nums;
        string inner = line.substr(1, line.size() - 2);
        stringstream ss(inner);
        string item;
        while (getline(ss, item, ',')) {
            if (!item.empty()) nums.push_back(stoi(item));
        }
        getline(cin, line);
        int target = stoi(line);
        Solution sol;
        vector<int> ans = sol.twoSum(nums, target);
        cout << "[" << ans[0] << "," << ans[1] << "]" << endl;
    }
    return 0;
}
"""
    test_cases = [
        {"args": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
        {"args": {"nums": [3, 2, 4], "target": 6}, "expected": [1, 2]},
    ]
    params = [{"name": "nums"}, {"name": "target"}]

    result = run_code_isolated(
        code=cpp_code,
        function_name="twoSum",
        test_cases_json={"cases": test_cases, "function_name": "twoSum", "params": params},
        language="cpp",
        test_harness=test_harness,
    )

    assert result["status"] == "Accepted"
    assert result["passed_tests"] == 2
    assert result["total_tests"] == 2
    assert len(result["test_results"]) == 2


