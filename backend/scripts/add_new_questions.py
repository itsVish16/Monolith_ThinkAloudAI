import json
import os

DSA_FILE = "data/canonical_dsa_questions.json"
SD_FILE = "data/canonical_system_design_questions.json"

new_dsa_questions = [
    {
        "title": "Course Schedule",
        "description": "There are a total of `numCourses` courses you have to take, labeled from `0` to `numCourses - 1`. You are given an array `prerequisites` where `prerequisites[i] = [a_i, b_i]` indicates that you **must** take course `b_i` first if you want to take course `a_i`.\n\n- For example, the pair `[0, 1]` indicates that to take course `0` you have to first take course `1`.\n\nReturn `true` if you can finish all courses. Otherwise, return `false`.\n\n### Example 1:\n```\nInput: numCourses = 2, prerequisites = [[1,0]]\nOutput: true\nExplanation: There are a total of 2 courses to take. To take course 1 you should have finished course 0. So it is possible.\n```\n\n### Example 2:\n```\nInput: numCourses = 2, prerequisites = [[1,0],[0,1]]\nOutput: false\nExplanation: There are a total of 2 courses to take. To take course 1 you should have finished course 0, and to take course 0 you should also have finished course 1. So it is impossible.\n```\n\n### Constraints:\n- `1 <= numCourses <= 2000`\n- `0 <= prerequisites.length <= 5000`\n- `prerequisites[i].length == 2`\n- `0 <= a_i, b_i < numCourses`\n- All the pairs `prerequisites[i]` are **unique**.",
        "difficulty": "Medium",
        "function_name": "canFinish",
        "python_starter_code": "class Solution:\n    def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool:\n        # Implement your solution here\n        pass\n",
        "cpp_starter_code": "class Solution {\npublic:\n    bool canFinish(int numCourses, vector<vector<int>>& prerequisites) {\n        // Implement your solution here\n        return false;\n    }\n};\n",
        "cpp_test_harness": """#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include <queue>
using namespace std;

vector<vector<int>> parseVectorVectorInt(const string& s) {
    vector<vector<int>> res;
    size_t i = 0;
    while (i < s.size()) {
        if (s[i] == '[') {
            size_t end = s.find(']', i);
            if (end != string::npos) {
                string sub = s.substr(i + 1, end - i - 1);
                if (!sub.empty() && sub.find('[') == string::npos) {
                    vector<int> row;
                    stringstream ss(sub);
                    string item;
                    while (getline(ss, item, ',')) {
                        if (!item.empty()) row.push_back(stoi(item));
                    }
                    if(!row.empty()) res.push_back(row);
                }
            }
        }
        i++;
    }
    return res;
}

{{user_code}}

int main() {
    int numCourses;
    if (!(cin >> numCourses)) return 0;
    string prereq_str;
    if (!getline(cin >> ws, prereq_str)) return 0;
    vector<vector<int>> prerequisites = parseVectorVectorInt(prereq_str);
    Solution sol;
    cout << (sol.canFinish(numCourses, prerequisites) ? "true" : "false") << endl;
    return 0;
}
""",
        "test_cases": json.dumps({
            "function_name": "canFinish",
            "params": [
                {"name": "numCourses", "type": "int"},
                {"name": "prerequisites", "type": "int[][]"}
            ],
            "return_type": "boolean",
            "comparison": "exact",
            "cases": [
                {"args": {"numCourses": 2, "prerequisites": [[1, 0]]}, "expected": True},
                {"args": {"numCourses": 2, "prerequisites": [[1, 0], [0, 1]]}, "expected": False},
                {"args": {"numCourses": 1, "prerequisites": []}, "expected": True},
                {"args": {"numCourses": 3, "prerequisites": [[0, 1], [0, 2], [1, 2]]}, "expected": True},
                {"args": {"numCourses": 4, "prerequisites": [[1, 0], [2, 0], [3, 1], [3, 2]]}, "expected": True},
                {"args": {"numCourses": 4, "prerequisites": [[1, 0], [2, 1], [3, 2], [1, 3]]}, "expected": False},
                {"args": {"numCourses": 5, "prerequisites": [[1, 4], [2, 4], [3, 1], [3, 2]]}, "expected": True}
            ]
        }),
        "hints": [
            "This problem is equivalent to detecting a cycle in a directed graph. If a cycle exists, no topological order is possible and you cannot finish all courses.",
            "You can use Kahn's Algorithm (BFS topological sort using in-degrees) or DFS with 3-state coloring (unvisited, visiting, visited)."
        ],
        "optimal_time_complexity": "O(V + E)",
        "optimal_space_complexity": "O(V + E)",
        "tags": ["Graph", "Breadth-First Search", "Depth-First Search", "Topological Sort"]
    },
    {
        "title": "Subarray Sum Equals K",
        "description": "Given an array of integers `nums` and an integer `k`, return *the total number of subarrays whose sum equals to* `k`.\n\nA subarray is a contiguous **non-empty** sequence of elements within an array.\n\n### Example 1:\n```\nInput: nums = [1,1,1], k = 2\nOutput: 2\nExplanation: Subarrays [1, 1] at indices [0, 1] and [1, 2] both sum to 2.\n```\n\n### Example 2:\n```\nInput: nums = [1,2,3], k = 3\nOutput: 2\nExplanation: Subarrays [1, 2] and [3] both sum to 3.\n```\n\n### Constraints:\n- `1 <= nums.length <= 2 * 10^4`\n- `-1000 <= nums[i] <= 1000`\n- `-10^7 <= k <= 10^7`",
        "difficulty": "Medium",
        "function_name": "subarraySum",
        "python_starter_code": "class Solution:\n    def subarraySum(self, nums: List[int], k: int) -> int:\n        # Implement your solution here\n        pass\n",
        "cpp_starter_code": "class Solution {\npublic:\n    int subarraySum(vector<int>& nums, int k) {\n        // Implement your solution here\n        return 0;\n    }\n};\n",
        "cpp_test_harness": """#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include <unordered_map>
using namespace std;

vector<int> parseVectorInt(const string& s) {
    vector<int> res;
    string temp = s;
    temp.erase(remove(temp.begin(), temp.end(), '['), temp.end());
    temp.erase(remove(temp.begin(), temp.end(), ']'), temp.end());
    temp.erase(remove(temp.begin(), temp.end(), ' '), temp.end());
    stringstream ss(temp);
    string item;
    while(getline(ss, item, ',')) {
        if(!item.empty()) res.push_back(stoi(item));
    }
    return res;
}

{{user_code}}

int main() {
    string nums_str;
    if (!getline(cin >> ws, nums_str)) return 0;
    vector<int> nums = parseVectorInt(nums_str);
    int k;
    if (!(cin >> k)) return 0;
    Solution sol;
    cout << sol.subarraySum(nums, k) << endl;
    return 0;
}
""",
        "test_cases": json.dumps({
            "function_name": "subarraySum",
            "params": [
                {"name": "nums", "type": "int[]"},
                {"name": "k", "type": "int"}
            ],
            "return_type": "int",
            "comparison": "exact",
            "cases": [
                {"args": {"nums": [1, 1, 1], "k": 2}, "expected": 2},
                {"args": {"nums": [1, 2, 3], "k": 3}, "expected": 2},
                {"args": {"nums": [1, -1, 0], "k": 0}, "expected": 3},
                {"args": {"nums": [3, 4, 7, 2, -3, 1, 4, 2], "k": 7}, "expected": 4},
                {"args": {"nums": [1], "k": 0}, "expected": 0},
                {"args": {"nums": [-1, -1, 1], "k": 0}, "expected": 1},
                {"args": {"nums": [0, 0, 0, 0, 0], "k": 0}, "expected": 15}
            ]
        }),
        "hints": [
            "Can you maintain a running cumulative sum (prefix sum) as you iterate through nums?",
            "If the cumulative sum up to index j is S_j, we are looking for earlier indices i where S_j - S_i = k, which means S_i = S_j - k. A hash map tracking the frequency of seen prefix sums allows O(1) lookups."
        ],
        "optimal_time_complexity": "O(N)",
        "optimal_space_complexity": "O(N)",
        "tags": ["Array", "Hash Table", "Prefix Sum"]
    }
]

new_sd_question = {
    "title": "Design a Real-Time Collaborative Whiteboard (Figma / Miro / Excalidraw)",
    "domain": "Real-Time Systems / Distributed Collaboration",
    "role": "Principal Distributed Systems / Full-Stack Architect",
    "description": """ > **Summary:** Design a distributed, ultra-low latency collaborative whiteboard system (similar to Figma, Miro, or Excalidraw) enabling thousands of concurrent users to co-create diagrams, shapes, freehand paths, and text on an infinite canvas with sub-50ms sync latency, multi-user cursor awareness, offline resilience, and conflict-free state convergence.


### 1. Requirements & Scope

**Functional Requirements:**

- **Infinite Canvas & Element Creation:** Users can pan, zoom, create, transform, edit, and delete canvas objects (rectangles, ellipses, sticky notes, connectors, freehand paths, text frames).
- **Real-Time Collaboration:** All modifications made by any active participant must be reflected on all other peers' screens in sub-50ms (p99).
- **Live User Presence & Multi-Cursor Streaming:** Display live cursor positions, active selections, and participant avatars with smooth interpolation.
- **Undo / Redo (Multi-User Aware):** Users must be able to undo/redo their own actions without reverting edits made concurrently by other users.
- **Offline Edits & Reconnection Convergence:** If a user loses internet connectivity, they can continue drafting locally and seamlessly sync on reconnect without losing work.
- **Export & Version Snapshots:** Periodic and on-demand version history snapshots with point-in-time recovery and SVG/PNG export.

**Non-Functional Requirements:**

- **Ultra-Low Latency:** P99 end-to-end propagation latency < 50ms within the same continental region; < 120ms globally.
- **High Availability & Fault Tolerance:** 99.99% system uptime. Failure of any single gateway or room coordinator must not cause data corruption or board state loss.
- **Scalability:** Support 1,000+ simultaneous active viewers and up to 100 simultaneous active writers on a single massive canvas without UI frame drops (maintain 60fps on client canvas).
- **Strong Eventual Consistency:** All connected clients must converge to the exact same visual state once all concurrent operations are delivered.


### 2. Capacity & Back-of-the-Envelope Estimations

**User Traffic & Concurrency:**

- **Daily Active Users (DAU):** 50 Million DAU.
- **Peak Concurrent Active Sessions:** 2 Million concurrent connected users.
- **Average Room Concurrency:** 5 users per active board; 99th percentile: 500 users on an all-hands brainstorming board.
- **Average Canvas Complexity:** 5,000 vector elements per active canvas.

**Throughput & Bandwidth Estimations:**

- **Cursor Movements:** Each actively moving user emits ~20 cursor position events/sec.
  - Cursor payload: `x` (4 bytes), `y` (4 bytes), `user_id` (16 bytes), `timestamp` (8 bytes) $\\approx$ 50 bytes per packet.
  - 10 active editors in a room: $10 \\times 20 \\times 50\\text{ bytes} = 10\\text{ KB/sec}$ egress per participant.
- **Element Mutation Events:** Average 2 mutations/sec per active editor.
  - Mutation payload (delta / CRDT message): $\\approx 200\\text{ bytes}$.
  - Ingestion throughput for 2M concurrent users (assuming 20% active editors): $400,000 \\times 2\\text{ ops/sec} = 800,000\\text{ ops/sec}$ peak system write throughput.

**Storage Estimations:**

- **Active Board State:** $5,000\\text{ elements} \\times 500\\text{ bytes/element} = 2.5\\text{ MB}$ uncompressed ($\\approx 400\\text{ KB}$ gzipped JSON / binary protobuf).
- **Delta Operation Log:** $800,000\\text{ ops/sec} \\times 200\\text{ bytes} = 160\\text{ MB/sec} = 13.8\\text{ TB/day}$ across all boards.
- **Canvas Snapshots:** Taken every 5 minutes or 100 mutations $\\rightarrow$ compressed snapshots stored in S3/Blob storage with 30-day hot retention and Glacier cold tiering.


### 3. High-Level Architecture

```mermaid
flowchart TD
    subgraph Clients["Collaborative Clients (Browsers / Desktop Apps)"]
        C1["Client A (WebGL / WASM / Yjs CRDT)"]
        C2["Client B (WebGL / WASM / Yjs CRDT)"]
        C3["Client C (Viewer)"]
    end

    subgraph Edge["Edge & Ingress Layer"]
        DNS["Geo-DNS / Anycast Global Accelerator"]
        CDN["CloudFront / Cloudflare Edge CDN (Static Assets & WASM)"]
        WSS["WebSocket Gateway Cluster (Sticky Routing by Room Hash)"]
    end

    subgraph RealTime["Real-Time Synchronization Core"]
        RoomCoord["Room Coordinator Workers (In-Memory Canvas Actor / CRDT Sync)"]
        Presence["Ephemeral Presence Broker (Redis Cluster Pub/Sub)"]
        EventStream["Ordered Delta Event Log (Apache Kafka / Redpanda)"]
    end

    subgraph Persistence["Storage & Background Services"]
        SnapWorker["Snapshot & Compaction Engine"]
        S3["Object Storage (S3 / Cloud Storage - Vector Snapshots)"]
        PG[("PostgreSQL Cluster (Metadata, Permissions, Board ACL)")]
        SearchEngine[("Elasticsearch / Meilisearch (Board Text Search)")]
    end

    C1 <-->|WebSocket / WebRTC| WSS
    C2 <-->|WebSocket / WebRTC| WSS
    C3 <-->|WebSocket| WSS
    DNS --> WSS
    WSS <--> Presence
    WSS <--> RoomCoord
    RoomCoord -->|Stream Mutations| EventStream
    EventStream --> SnapWorker
    SnapWorker -->|Write Periodic Snapshot| S3
    SnapWorker -->|Update Version Pointer| PG
    RoomCoord -->|Load Initial State| S3
    WSS -->|Auth & Room Metadata| PG
```


### 4. Data Model & Database Design

**Relational Schema (PostgreSQL):**

```sql
-- Canvas Document Metadata
CREATE TABLE whiteboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id),
    current_version INT NOT NULL DEFAULT 1,
    latest_snapshot_url TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Board Version History & Snapshots
CREATE TABLE whiteboard_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    version INT NOT NULL,
    snapshot_s3_key TEXT NOT NULL,
    element_count INT NOT NULL,
    byte_size INT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(whiteboard_id, version)
);

-- User Access & Collaborative Permissions
CREATE TABLE whiteboard_collaborators (
    whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
    last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (whiteboard_id, user_id)
);
```

**CRDT Canvas Object Schema (Binary / JSON Protobuf):**

```json
{
  "element_id": "rect_8f29c4ba",
  "client_id": 49281,
  "lamport_timestamp": 1042,
  "type": "rectangle",
  "x": 1240.5,
  "y": 850.0,
  "width": 320.0,
  "height": 180.0,
  "rotation": 0.0,
  "stroke_color": "#4A90E2",
  "fill_color": "#E8F4FD",
  "stroke_width": 2,
  "z_index": 45,
  "deleted": false,
  "parent_group_id": null
}
```

**Redis In-Memory State:**

- `presence:room:{board_id}`: Redis Hash mapping `user_id` $\\rightarrow$ `{cursor_x, cursor_y, active_element_id, selected_ids, last_ping_ms}`. TTL: 15 seconds (heartbeat refreshed).
- `room_route:{board_id}`: String mapping board ID to active Room Coordinator node IP/Port for sticky routing.


### 5. Technical Deep Dive & Key Trade-offs

### Deep Dive & Engineering Trade-offs:

1. **State Synchronization: CRDT vs. Operational Transformation (OT)**
   - *Operational Transformation (OT):* Used by Google Docs. Requires a single centralized authority to order all incoming operations and transform conflicting client operations.
   - *Conflict-Free Replicated Data Types (CRDTs - e.g. Yjs / Automerge / LWW-Map):* Mathematically guaranteed convergence regardless of operation arrival order. Enables true peer-to-peer and offline editing because clients can generate updates locally while disconnected. For 2D spatial objects, a **Last-Write-Wins Map (LWW-Map) with Lamport Clocks** combined with an **Ordered Tree/R-Tree for Z-Ordering** provides deterministic, conflict-free state resolution without centralized locks.

2. **Ephemeral Presence vs. Durable Canvas Operations**
   - Live cursor updates are high-frequency, loss-tolerant, and ephemeral: if a cursor packet is dropped, subsequent packets supersede it. We route cursor presence through Redis Pub/Sub or WebRTC Data Channels (UDP-like loss tolerance) without persisting to disk.
   - Canvas shape mutations are durable and zero-loss: sent via WebSocket TCP, acknowledged by the Room Coordinator actor, and appended to an append-only Kafka commit log.

3. **Infinite Canvas Rendering & Spatial Indexing (QuadTree / R-Tree)**
   - Rendering 100,000 elements on an infinite canvas in JavaScript DOM creates massive memory pressure.
   - *Solution:* Modern whiteboards (Figma, Miro) use a WebAssembly (WASM) rendering engine with WebGL/WebGPU. Elements are indexed in an in-memory **R-Tree / QuadTree**. The engine queries only elements intersecting the user's current viewport bounding box (Viewport Culling), easily rendering 60 FPS even on massive canvases.
   - On the backend, delta updates for massive boards can be spatially sharded: viewers zoomed in on Section A only subscribe to deltas within bounding box coordinates $[X_1, Y_1, X_2, Y_2]$.

4. **Multi-User Undo / Redo Mechanism**
   - Standard undo/redo pops from a single stack, which would inadvertently undo other users' edits.
   - *Solution:* Selective Undo: Each user maintains their own local action history. When user invokes Undo on an element modification, the client calculates the inverse delta for *that specific element* and submits it as a new forward CRDT operation with a newer Lamport timestamp.

5. **Snapshotting, Compaction, and Room Lifecycles**
   - Replaying millions of delta operations when a board loads would take seconds.
   - *Solution:* The Room Coordinator maintains the current state in RAM. Every 5 minutes or 250 operations, it compresses the state into FlatBuffers/Protobuf and flushes to AWS S3. New joining clients download the latest S3 snapshot and replay only subsequent Kafka log deltas (tail catchup < 100ms). When all users disconnect, the room coordinator commits the final snapshot and safely unloads from memory.
"""
}

def main():
    # 1. Update DSA Questions
    with open(DSA_FILE, "r") as f:
        dsa = json.load(f)
    
    existing_dsa_titles = {q["title"] for q in dsa}
    dsa_added = 0
    for q in new_dsa_questions:
        if q["title"] not in existing_dsa_titles:
            dsa.append(q)
            dsa_added += 1
            print(f"Added DSA Question: {q['title']}")
        else:
            print(f"DSA Question already exists: {q['title']}")
            
    with open(DSA_FILE, "w") as f:
        json.dump(dsa, f, indent=2)
    print(f"Total DSA questions now: {len(dsa)} (Added: {dsa_added})")

    # 2. Update System Design Questions
    with open(SD_FILE, "r") as f:
        sd = json.load(f)
        
    existing_sd_titles = {q["title"] for q in sd}
    sd_added = 0
    if new_sd_question["title"] not in existing_sd_titles:
        sd.append(new_sd_question)
        sd_added += 1
        print(f"Added SD Question: {new_sd_question['title']}")
    else:
        print(f"SD Question already exists: {new_sd_question['title']}")
        
    with open(SD_FILE, "w") as f:
        json.dump(sd, f, indent=2)
    print(f"Total SD questions now: {len(sd)} (Added: {sd_added})")

if __name__ == "__main__":
    main()
