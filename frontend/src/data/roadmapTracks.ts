export interface DeepDiveInfo {
  keyObjectives: string[];
  criticalPitfalls: string[];
  interviewerQuestions: string[];
}

export interface NodeAction {
  type: 'practice' | 'system_design' | 'mock_interview' | 'chat';
  label: string;
  questionId?: string;
  templateId?: string;
  targetPage?: string;
}

export interface RoadmapNode {
  id: string;
  title: string;
  summary: string;
  category: 'DSA' | 'System Design' | 'Concurrency' | 'Architecture' | 'Mock Round';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedHours: string;
  prerequisites: string[]; // Node IDs that precede this
  deepDive: DeepDiveInfo;
  action: NodeAction;
}

export interface RoadmapStage {
  id: string;
  stageNumber: number;
  title: string;
  subtitle: string;
  nodes: RoadmapNode[];
}

export interface RoadmapTrack {
  id: string;
  name: string;
  roleBadge: string;
  headline: string;
  summary: string;
  estimatedWeeks: string;
  stages: RoadmapStage[];
}

export const CURATED_TRACKS: RoadmapTrack[] = [
  {
    id: 'backend-distributed',
    name: 'Distributed Systems & Backend',
    roleBadge: 'L5–L6 Systems Specialist',
    headline: 'High-Throughput Services, Consensus & Fault Tolerance',
    summary: 'Master the engineering patterns behind planetary-scale infrastructure: Raft consensus, consistent hashing, LSM trees, lock-free concurrency, and distributed resilience.',
    estimatedWeeks: '10-Week Master Track',
    stages: [
      {
        id: 'be-stage-1',
        stageNumber: 1,
        title: 'Core Algorithmic Engines & Memory Layout',
        subtitle: 'Foundational algorithmic data structures with cache-conscious memory layouts and amortized analysis.',
        nodes: [
          {
            id: 'be-n1-hashmaps',
            title: 'Hash Maps & Amortized Arrays',
            summary: 'Collision resolution, open addressing vs robin hood hashing, and CPU cache-line locality.',
            category: 'DSA',
            difficulty: 'Easy',
            estimatedHours: '3 hrs',
            prerequisites: [],
            deepDive: {
              keyObjectives: [
                'Understand amortized O(1) vs worst-case O(n) lookup with adversarial keys',
                'Implement hash collision resolution using open addressing and chaining',
                'Analyze memory overhead, bucket re-indexing, and load factor resizing'
              ],
              criticalPitfalls: [
                'Underestimating hash flooding attacks causing DoS',
                'Ignoring GC pressure caused by high allocation rates during table growth'
              ],
              interviewerQuestions: [
                'How does Java HashMap prevent worst-case O(n) collision degradation?',
                'Why are flat arrays often faster than linked buckets despite theoretical similarities?'
              ]
            },
            action: {
              type: 'practice',
              label: 'Solve Two Sum in Arena',
              questionId: 'two-sum'
            }
          },
          {
            id: 'be-n2-lru',
            title: 'LRU Cache & Memory Paging',
            summary: 'O(1) get/put cache eviction combining doubly linked lists and hash tables with memory eviction bounds.',
            category: 'DSA',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: ['be-n1-hashmaps'],
            deepDive: {
              keyObjectives: [
                'Design doubly-linked sentinel nodes for zero-branch boundary updates',
                'Guarantee constant time O(1) eviction under high mutation throughput',
                'Architect thread-safe access using striped locks or RCU primitives'
              ],
              criticalPitfalls: [
                'Off-by-one errors when managing dummy head and tail sentinel pointers',
                'Memory leaks resulting from lingering references in hash map entries'
              ],
              interviewerQuestions: [
                'How would you scale this LRU cache to handle 100k concurrent read/write threads?',
                'When does LFU (Least Frequently Used) or ARC (Adaptive Replacement) outperform LRU?'
              ]
            },
            action: {
              type: 'practice',
              label: 'Solve LRU Cache in Arena',
              questionId: 'lru-cache'
            }
          },
          {
            id: 'be-n3-string-dp',
            title: 'Dynamic Programming & State Transitions',
            summary: 'DAG state representations, memoization tables, and spatial optimization for complex sequences.',
            category: 'DSA',
            difficulty: 'Medium',
            estimatedHours: '5 hrs',
            prerequisites: ['be-n1-hashmaps'],
            deepDive: {
              keyObjectives: [
                'Formulate recursive state equations with clean base cases',
                'Compress 2D space matrices into 1D rolling buffers',
                'Analyze longest subproblem topologies and expand-around-center optimizations'
              ],
              criticalPitfalls: [
                'Stack overflow exceptions during recursive depth search without tail recursion',
                'Redundant state recomputation when boundary states are mishandled'
              ],
              interviewerQuestions: [
                'How do you identify whether a problem satisfies optimal substructure?',
                'Can Manacher’s algorithm achieve O(n) string symmetry, and what are its memory tradeoffs?'
              ]
            },
            action: {
              type: 'practice',
              label: 'Solve Longest Palindrome',
              questionId: 'longest-palindromic-substring'
            }
          }
        ]
      },
      {
        id: 'be-stage-2',
        stageNumber: 2,
        title: 'Concurrency, I/O & Storage Engines',
        subtitle: 'Low-level thread synchronization, non-blocking I/O event loops, and append-only LSM storage.',
        nodes: [
          {
            id: 'be-n4-lsm-storage',
            title: 'LSM-Trees vs B+ Trees',
            summary: 'Write-Ahead Log (WAL), MemTable skiplists, SSTables, Bloom filters, and compaction strategies.',
            category: 'Architecture',
            difficulty: 'Hard',
            estimatedHours: '6 hrs',
            prerequisites: ['be-n2-lru'],
            deepDive: {
              keyObjectives: [
                'Contrast random vs sequential disk I/O performance on NVMe drives',
                'Design SSTable tiered and leveled compaction routines',
                'Implement Bloom filters to eliminate unnecessary disk seeks for missing keys'
              ],
              criticalPitfalls: [
                'Write amplification exhausting SSD write endurance cycles',
                'Read amplification during heavy concurrent compaction windows'
              ],
              interviewerQuestions: [
                'Why do modern write-heavy systems like Cassandra and RocksDB prefer LSM over B-Tree?',
                'How does WAL crash recovery guarantee ACID durability across kernel panics?'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design Key-Value Storage Engine',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          },
          {
            id: 'be-n5-locks-concurrency',
            title: 'Lock-Free Queues & Memory Fences',
            summary: 'Compare-And-Swap (CAS), false sharing, cache line padding, and memory barriers across CPU cores.',
            category: 'Concurrency',
            difficulty: 'Hard',
            estimatedHours: '5 hrs',
            prerequisites: ['be-n2-lru'],
            deepDive: {
              keyObjectives: [
                'Implement Michael-Scott non-blocking concurrent queues',
                'Mitigate the ABA problem using tagged pointers or hazard pointers',
                'Eliminate false sharing using 64-byte hardware cache line alignment'
              ],
              criticalPitfalls: [
                'Spinlock CPU starvation under intense thread contention',
                'Compiler memory reordering violating acquire/release memory semantics'
              ],
              interviewerQuestions: [
                'What is the difference between sequential consistency and relaxed memory ordering?',
                'How does Go channel implementation handle goroutine parking and wakeups?'
              ]
            },
            action: {
              type: 'chat',
              label: 'Deep Dive with AI Mentor'
            }
          }
        ]
      },
      {
        id: 'be-stage-3',
        stageNumber: 3,
        title: 'Distributed Consensus & Scale',
        subtitle: 'Partition tolerance, consistent hashing rings, leader election, and resilient rate limiting.',
        nodes: [
          {
            id: 'be-n6-consistent-hashing',
            title: 'Consistent Hashing & Virtual Nodes',
            summary: 'Ring topology, bounded load distribution, virtual node scaling, and graceful node churn.',
            category: 'System Design',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: ['be-n4-lsm-storage'],
            deepDive: {
              keyObjectives: [
                'Map nodes and keys onto a 2^32 or 2^64 cryptographic ring hash space',
                'Tune virtual node counts to minimize variance and hotspot clustering',
                'Design gossip protocol heartbeats for topology propagation'
              ],
              criticalPitfalls: [
                'Cascading failure cascades when a single high-capacity node drops offline',
                'Data migration bottlenecks during dynamic cluster re-sharding'
              ],
              interviewerQuestions: [
                'How does DynamoDB combine consistent hashing with sloppy quorums and hinted handoff?',
                'What hash function would you select: Murmur3, xxHash, or SHA-256 and why?'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design Distributed Cache Ring',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          },
          {
            id: 'be-n7-rate-limiter',
            title: 'Distributed Token Bucket & Leaky Bucket',
            summary: 'Redis cluster Lua script atomicity, sliding window logs, and API gateway throttling.',
            category: 'System Design',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: ['be-n4-lsm-storage'],
            deepDive: {
              keyObjectives: [
                'Implement sliding window counter with millisecond granularity',
                'Prevent Redis round-trip latency using atomic Lua evaluation',
                'Design graceful fallback headers (X-RateLimit-Retry-After, 429 Too Many Requests)'
              ],
              criticalPitfalls: [
                'Race conditions in check-then-set workflows causing quota breaches',
                'Clock skew across distributed API servers causing inconsistent window boundaries'
              ],
              interviewerQuestions: [
                'How would you enforce 100 requests/sec across 50 independent edge server locations?',
                'Compare Token Bucket vs Sliding Window Log in terms of memory footprint and burst tolerance.'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design Distributed Rate Limiter',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          },
          {
            id: 'be-n8-raft-consensus',
            title: 'Raft Consensus & Replicated State',
            summary: 'Leader election, log matching property, split vote mitigation, and joint consensus reconfigurations.',
            category: 'Architecture',
            difficulty: 'Hard',
            estimatedHours: '7 hrs',
            prerequisites: ['be-n5-locks-concurrency', 'be-n6-consistent-hashing'],
            deepDive: {
              keyObjectives: [
                'State machine transitions: Follower, Candidate, and Leader terms',
                'Quorum calculation: N/2 + 1 voting majorities and log replication commits',
                'Handling network partitions, split-brain isolation, and uncommitted log truncation'
              ],
              criticalPitfalls: [
                'Heartbeat timeout misconfiguration triggering continuous election storms',
                'Applying state changes to the state machine before majority acknowledgement'
              ],
              interviewerQuestions: [
                'How does Raft guarantee that a newly elected leader has all committed entries from past terms?',
                'What is the difference between Raft and Multi-Paxos regarding complexity and correctness?'
              ]
            },
            action: {
              type: 'chat',
              label: 'Simulate Raft Election in Chat'
            }
          }
        ]
      },
      {
        id: 'be-stage-4',
        stageNumber: 4,
        title: 'Production Capstone & Live Mock Defense',
        subtitle: 'Simulate real FAANG/tier-1 technical interviews with strict rubric evaluation and live speech telemetry.',
        nodes: [
          {
            id: 'be-n9-staff-mock-sys',
            title: 'Staff System Design: Global Video Streaming',
            summary: 'Multi-region ingestion, adaptive bitrate transcoding, CDN edge caching, and real-time telemetry.',
            category: 'Mock Round',
            difficulty: 'Hard',
            estimatedHours: '2 hrs',
            prerequisites: ['be-n7-rate-limiter', 'be-n8-raft-consensus'],
            deepDive: {
              keyObjectives: [
                'Drive end-to-end requirement clarification: DAU, write/read ratio, SLA guarantees',
                'Formulate back-of-envelope calculations: bandwidth, storage egress, compute cores',
                'Defend trade-offs in front of an AI Staff Engineer with real-time audio grilling'
              ],
              criticalPitfalls: [
                'Jumping directly into architecture diagrams before clarifying non-functional constraints',
                'Neglecting single points of failure (SPOF) and disaster recovery protocols'
              ],
              interviewerQuestions: [
                'How do you prevent thundering herds when 10 million users hit the stream simultaneously?',
                'Design the metadata storage schema for video chapters and search indexing.'
              ]
            },
            action: {
              type: 'mock_interview',
              label: 'Start Live System Design Mock',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          },
          {
            id: 'be-n10-live-dsa-mock',
            title: 'Live Technical Coding: Concurrency & Graph Traversal',
            summary: 'Timed 45-minute live audio coding round with AI evaluation on time complexity, tests, and syntax.',
            category: 'Mock Round',
            difficulty: 'Hard',
            estimatedHours: '2 hrs',
            prerequisites: ['be-n8-raft-consensus'],
            deepDive: {
              keyObjectives: [
                'Think aloud continuously while formulating algorithmic approaches',
                'Write modular, clean code with defensive input validation',
                'Test corner cases proactively before declaring completion'
              ],
              criticalPitfalls: [
                'Coding in silence without explaining mental models to the interviewer',
                'Failing to verify time and space complexity under extreme bounds'
              ],
              interviewerQuestions: [
                'Can you optimize the auxiliary memory usage to O(1)?',
                'What happens if the graph contains negative weight cycles?'
              ]
            },
            action: {
              type: 'mock_interview',
              label: 'Launch Live DSA Interview',
              templateId: 'dsa',
              targetPage: 'dsa-interview'
            }
          }
        ]
      }
    ]
  },
  {
    id: 'fullstack-systems',
    name: 'Fullstack Systems Architect',
    roleBadge: 'L4–L5 Product & Core Eng',
    headline: 'End-to-End Delivery: Client Performance to Resilient Backends',
    summary: 'Bridge the entire web stack: React 19 rendering mechanics, real-time WebSocket fanouts, database sharding, caching tiers, and full-fidelity observability.',
    estimatedWeeks: '12-Week Master Track',
    stages: [
      {
        id: 'fs-stage-1',
        stageNumber: 1,
        title: 'Modern Runtime Engines & Algorithmic Base',
        subtitle: 'JavaScript V8 JIT internals, Event Loop phases, and high-frequency array data structures.',
        nodes: [
          {
            id: 'fs-n1-event-loop',
            title: 'Event Loop & Macro/Microtask Queues',
            summary: 'Call stack execution, Promise resolution order, process.nextTick, and UI frame render scheduling.',
            category: 'Architecture',
            difficulty: 'Medium',
            estimatedHours: '3 hrs',
            prerequisites: [],
            deepDive: {
              keyObjectives: [
                'Trace task queues vs microtask checkpoints in browser and Node.js environments',
                'Prevent main thread jank using requestAnimationFrame and scheduler.yield',
                'Diagnose memory leaks created by uncollected closures and detached DOM nodes'
              ],
              criticalPitfalls: [
                'Starving macro-task queues by infinitely scheduling microtask promises',
                'Blocking the main thread with heavy computational regex or JSON parsing'
              ],
              interviewerQuestions: [
                'What is the precise execution order of setTimeout(fn, 0), Promise.resolve().then(fn), and queueMicrotask(fn)?',
                'How does React 19 Concurrent Mode break work into time slices without locking the UI?'
              ]
            },
            action: {
              type: 'practice',
              label: 'Solve Two Sum in Arena',
              questionId: 'two-sum'
            }
          },
          {
            id: 'fs-n2-react-fiber',
            title: 'React Fiber Architecture & Reconciliation',
            summary: 'Double-buffering work-in-progress trees, lane-based priority scheduling, and virtual DOM diffing.',
            category: 'Architecture',
            difficulty: 'Hard',
            estimatedHours: '5 hrs',
            prerequisites: ['fs-n1-event-loop'],
            deepDive: {
              keyObjectives: [
                'Understand singly-linked Fiber tree traversal (child, sibling, return)',
                'Analyze O(n) heuristic reconciliation rules and keyed list heuristics',
                'Optimize re-renders using immutable state trees and fine-grained selectors'
              ],
              criticalPitfalls: [
                'Using index keys on dynamically re-ordered arrays causing state corruption',
                'Triggering cascading render cascades through synchronous state setters in layout effects'
              ],
              interviewerQuestions: [
                'Why did React rewrite the reconciler from Stack to Fiber?',
                'How does Suspense interrupt and resume rendering on the client vs server?'
              ]
            },
            action: {
              type: 'chat',
              label: 'Explore Fiber Mechanics'
            }
          }
        ]
      },
      {
        id: 'fs-stage-2',
        stageNumber: 2,
        title: 'Real-Time State & Edge Caching',
        subtitle: 'Bidirectional streaming, optimistic user experiences, and client-server synchronization.',
        nodes: [
          {
            id: 'fs-n3-websocket-pubsub',
            title: 'WebSocket Fan-Out & Redis Pub/Sub',
            summary: 'Horizontal connection termination, heartbeats, backpressure, and sticky session load balancing.',
            category: 'System Design',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: ['fs-n2-react-fiber'],
            deepDive: {
              keyObjectives: [
                'Architect horizontally scalable WebSocket clusters with Redis Streams',
                'Implement reconnect backoff with jitter and client message replay buffers',
                'Manage socket connection limits using epoll and file descriptor tuning'
              ],
              criticalPitfalls: [
                'Message loss during server deploys when graceful drain isn’t implemented',
                'Memory exhaustion when slow mobile clients fail to drain server buffers'
              ],
              interviewerQuestions: [
                'How do you handle 1 million concurrent WebSocket connections across 20 server instances?',
                'When should you pick WebSockets vs Server-Sent Events (SSE) vs WebTransport?'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design Real-Time Collab App',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          },
          {
            id: 'fs-n4-lru-cache-client',
            title: 'Client-Side Data Normalized Caching',
            summary: 'Apollo/TanStack query normalized cache graphs, optimistic mutation rollbacks, and garbage collection.',
            category: 'DSA',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: ['fs-n2-react-fiber'],
            deepDive: {
              keyObjectives: [
                'Construct normalized entity tables (entitiesById) to prevent state fragmentation',
                'Implement LRU eviction bounds to keep memory consumption low on mobile devices',
                'Rollback optimistic updates cleanly when backend network mutations fail'
              ],
              criticalPitfalls: [
                'Stale read inconsistencies when mutations update only a subset of denormalized views',
                'Memory leaks from uncollected query subscriptions after component unmount'
              ],
              interviewerQuestions: [
                'How does an LRU cache integrate with offline persistence (IndexedDB)?',
                'Design a cache invalidation strategy for deeply nested relationship graphs.'
              ]
            },
            action: {
              type: 'practice',
              label: 'Implement LRU Cache',
              questionId: 'lru-cache'
            }
          }
        ]
      },
      {
        id: 'fs-stage-3',
        stageNumber: 3,
        title: 'Fullstack Systems & Data Engineering',
        subtitle: 'Relational data normalization, query plan optimization, API gateways, and distributed idempotency.',
        nodes: [
          {
            id: 'fs-n5-sql-indexing',
            title: 'PostgreSQL Indexing & Query Plans',
            summary: 'B-tree index mechanics, composite indexes, EXPLAIN ANALYZE, and vacuum transaction wrap-around.',
            category: 'Architecture',
            difficulty: 'Hard',
            estimatedHours: '5 hrs',
            prerequisites: ['fs-n3-websocket-pubsub'],
            deepDive: {
              keyObjectives: [
                'Analyze sequential scan vs index scan vs bitmap index scan',
                'Design covering indexes to achieve index-only scans without table page fetches',
                'Mitigate N+1 database queries through batching and dataloaders'
              ],
              criticalPitfalls: [
                'Creating indexes on low-cardinality boolean columns wasting write IOPS',
                'Neglecting table bloat and autovacuum tuning under heavy UPDATE workloads'
              ],
              interviewerQuestions: [
                'Why can a query with an index still perform a full table scan?',
                'Explain how MVCC (Multi-Version Concurrency Control) prevents dirty reads without locking.'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design E-Commerce Checkout API',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          },
          {
            id: 'fs-n6-idempotency',
            title: 'Payment Idempotency & Distributed Transactions',
            summary: 'Two-Phase Commit vs Saga orchestration, idempotency keys, and outbox transactional patterns.',
            category: 'System Design',
            difficulty: 'Hard',
            estimatedHours: '6 hrs',
            prerequisites: ['fs-n5-sql-indexing'],
            deepDive: {
              keyObjectives: [
                'Enforce exactly-once business semantics using client-generated idempotency tokens',
                'Implement the Transactional Outbox pattern with Debezium/Kafka CDC',
                'Design compensating transactions for distributed rollback'
              ],
              criticalPitfalls: [
                'Processing duplicate webhook events causing double-charging of credit cards',
                'Deadlocks when multiple microservices lock cross-domain resources out of order'
              ],
              interviewerQuestions: [
                'How does Stripe guarantee idempotent payment charges across network retries?',
                'Compare Choreography vs Orchestration in the Saga pattern.'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design Distributed Payment Gateway',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          }
        ]
      },
      {
        id: 'fs-stage-4',
        stageNumber: 4,
        title: 'Fullstack Interview Capstone',
        subtitle: 'Live end-to-end evaluation covering both architectural depth and behavioral leadership.',
        nodes: [
          {
            id: 'fs-n7-fullstack-mock',
            title: 'Live System Design: Collaborative Document Editor',
            summary: 'CRDT vs Operational Transformation (OT), presence cursors, local-first offline syncing.',
            category: 'Mock Round',
            difficulty: 'Hard',
            estimatedHours: '2 hrs',
            prerequisites: ['fs-n6-idempotency'],
            deepDive: {
              keyObjectives: [
                'Compare Lamport timestamps and vector clocks for concurrent character insertions',
                'Design delta compression and snapshotting for long-lived documents',
                'Address permission changes and revoking active user session tokens in real time'
              ],
              criticalPitfalls: [
                'O(n^2) document explosion when CRDT tombstones are never garbage collected',
                'Failing to specify conflict resolution rules for rich text formatting'
              ],
              interviewerQuestions: [
                'How does Google Docs handle 50 concurrent typists on the same paragraph?',
                'What are the bandwidth and latency tradeoffs between Yjs and Automerge?'
              ]
            },
            action: {
              type: 'mock_interview',
              label: 'Start Fullstack System Mock',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          },
          {
            id: 'fs-n8-behavioral-mock',
            title: 'Executive Behavioral & Engineering Leadership',
            summary: 'STAR methodology: Resolving architectural deadlocks, cross-functional ambiguity, and mentorship.',
            category: 'Mock Round',
            difficulty: 'Medium',
            estimatedHours: '1 hr',
            prerequisites: ['fs-n7-fullstack-mock'],
            deepDive: {
              keyObjectives: [
                'Structure answers using Situation, Task, Action, Result with quantifiable metrics',
                'Demonstrate ownership and retrospective growth from production outages',
                'Exhibit empathy and alignment when driving contentious technical migrations'
              ],
              criticalPitfalls: [
                'Speaking in vague generalities ("We built a thing") instead of specific personal contributions',
                'Blaming teammates or past management during conflict scenarios'
              ],
              interviewerQuestions: [
                'Tell me about a time you had a strong disagreement with a Principal Engineer on architecture.',
                'Describe a critical production incident you caused and how you resolved it.'
              ]
            },
            action: {
              type: 'mock_interview',
              label: 'Launch Behavioral Round',
              templateId: 'behavioral',
              targetPage: 'general-interview'
            }
          }
        ]
      }
    ]
  },
  {
    id: 'frontend-performance',
    name: 'Frontend Systems & Web Platform',
    roleBadge: 'L5+ Web Platform Engineer',
    headline: 'Rendering Engines, Web Workers & Large-Scale UI Architecture',
    summary: 'Dive deep into browser internals: Critical Rendering Path, memory profiling, WebAssembly runtimes, microfrontends, and buttery smooth 120 FPS performance.',
    estimatedWeeks: '8-Week Master Track',
    stages: [
      {
        id: 'fe-stage-1',
        stageNumber: 1,
        title: 'Browser Internals & Rendering Pipeline',
        subtitle: 'DOM/CSSOM construction, Render Tree, Layout reflows, Composite layers, and GPU rasterization.',
        nodes: [
          {
            id: 'fe-n1-crp',
            title: 'Critical Rendering Path & Layout Thrashing',
            summary: 'Forced synchronous layouts, requestAnimationFrame, will-change GPU promotion, and frame budget limits.',
            category: 'Architecture',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: [],
            deepDive: {
              keyObjectives: [
                'Analyze layout vs paint vs composite trigger properties in modern browsers',
                'Prevent layout thrashing caused by interleaved DOM reads and writes',
                'Leverage CSS Containment and content-visibility for ultra-large DOM trees'
              ],
              criticalPitfalls: [
                'Overusing will-change causing runaway GPU VRAM allocation',
                'Reading offsetTop or getBoundingClientRect inside animation loops'
              ],
              interviewerQuestions: [
                'What happens inside the browser engine between a user keydown event and pixel paint on screen?',
                'How do modern browsers implement OffscreenCanvas and workers to avoid main thread contention?'
              ]
            },
            action: {
              type: 'practice',
              label: 'Solve String Algorithm',
              questionId: 'longest-palindromic-substring'
            }
          },
          {
            id: 'fe-n2-virtual-lists',
            title: 'Virtual Scrolling & DOM Recycling',
            summary: 'Render 100,000 items in O(1) DOM nodes using windowing math, dynamic row heights, and overscan.',
            category: 'DSA',
            difficulty: 'Hard',
            estimatedHours: '5 hrs',
            prerequisites: ['fe-n1-crp'],
            deepDive: {
              keyObjectives: [
                'Calculate start/end index slices from scroll offset and total container height',
                'Handle dynamic row heights using binary search on estimated prefix sum arrays',
                'Support smooth trackpad inertial scrolling without white-screen flickering'
              ],
              criticalPitfalls: [
                'Sub-pixel rounding errors causing scroll jitter on high-DPI displays',
                'Focus management loss when keyboard-navigating recycled elements'
              ],
              interviewerQuestions: [
                'How would you build a virtual list supporting variable height cards with lazy image expansion?',
                'Compare DOM recycling vs absolute positioning transforms in performance.'
              ]
            },
            action: {
              type: 'practice',
              label: 'Solve LRU Cache',
              questionId: 'lru-cache'
            }
          }
        ]
      },
      {
        id: 'fe-stage-2',
        stageNumber: 2,
        title: 'Bundle Topology & Asset Optimization',
        subtitle: 'Tree shaking AST analysis, module federation, Brotli compression, and Core Web Vitals.',
        nodes: [
          {
            id: 'fe-n3-web-vitals',
            title: 'Core Web Vitals Optimization (INP, LCP, CLS)',
            summary: 'Interaction to Next Paint (INP), Largest Contentful Paint (LCP), and Cumulative Layout Shift (CLS).',
            category: 'Architecture',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: ['fe-n2-virtual-lists'],
            deepDive: {
              keyObjectives: [
                'Deconstruct INP: input delay, processing duration, and presentation delay',
                'Optimize LCP using early hints (103 Early Hints), fetchpriority="high", and preloading',
                'Eliminate CLS through explicit aspect ratio boxes and font-display: optional'
              ],
              criticalPitfalls: [
                'Blocking hydration on massive monolithic client bundles',
                'Client-side redirect chains destroying mobile LCP scores'
              ],
              interviewerQuestions: [
                'How does INP differ from FID (First Input Delay), and why did Google make the shift?',
                'How do you debug an INP regression occurring only in low-end Android mobile devices?'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design Global Media Player',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          }
        ]
      },
      {
        id: 'fe-stage-3',
        stageNumber: 3,
        title: 'Staff Frontend Mock Assessment',
        subtitle: 'Simulate high-stakes frontend system design and technical architecture defense.',
        nodes: [
          {
            id: 'fe-n4-design-system-mock',
            title: 'Live Staff System Design: Design System & Microfrontends',
            summary: 'Multi-app architecture, versioning contracts, state sharing, and zero-runtime CSS-in-JS.',
            category: 'Mock Round',
            difficulty: 'Hard',
            estimatedHours: '2 hrs',
            prerequisites: ['fe-n3-web-vitals'],
            deepDive: {
              keyObjectives: [
                'Architect Module Federation runtime with shared vendor singletons',
                'Design accessible keyboard navigation for complex nested comboboxes and tree-views',
                'Defend bundle size budgeting with automated CI regression gates'
              ],
              criticalPitfalls: [
                'CSS specificity collisions across microfrontends without shadow DOM or scoping',
                'Multiple duplicate React runtime instances triggering hook violation crashes'
              ],
              interviewerQuestions: [
                'How would you design a high-frequency trading dashboard that updates 1,000 UI cells/sec?',
                'Describe your approach to deprecating legacy component props across 50 engineering teams.'
              ]
            },
            action: {
              type: 'mock_interview',
              label: 'Launch Frontend System Mock',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          }
        ]
      }
    ]
  },
  {
    id: 'ai-ml-systems',
    name: 'AI & ML Systems Engineering',
    roleBadge: 'Staff AI Infrastructure',
    headline: 'LLM Inference Engines, Vector Indices & Agent Runtime Systems',
    summary: 'Master the high-performance AI stack: KV-cache optimization, vLLM PagedAttention, HNSW vector search, RAG chunking pipelines, and autonomous agent loops.',
    estimatedWeeks: '10-Week Master Track',
    stages: [
      {
        id: 'ai-stage-1',
        stageNumber: 1,
        title: 'Vector Embeddings & Spatial Indexing',
        subtitle: 'High-dimensional geometry, HNSW approximate nearest neighbors, and quantization.',
        nodes: [
          {
            id: 'ai-n1-hnsw',
            title: 'HNSW & Vector Index Topologies',
            summary: 'Hierarchical Navigable Small World graphs, cosine similarity, product quantization, and recall tradeoffs.',
            category: 'DSA',
            difficulty: 'Hard',
            estimatedHours: '5 hrs',
            prerequisites: [],
            deepDive: {
              keyObjectives: [
                'Analyze skip-list hierarchical graph layers for logarithmic vector search',
                'Understand Product Quantization (PQ) reducing vector memory by 8x to 16x',
                'Balance search latency vs recall percentage under high query volumes'
              ],
              criticalPitfalls: [
                'Catastrophic recall drop when indexing unbalanced high-dimension clusters',
                'High memory footprint when running unquantized FP32 embeddings'
              ],
              interviewerQuestions: [
                'Why does HNSW outperform IVF (Inverted File) indexes in low-latency search?',
                'How do you update an HNSW index concurrently while serving real-time queries?'
              ]
            },
            action: {
              type: 'practice',
              label: 'Solve Two Sum in Arena',
              questionId: 'two-sum'
            }
          },
          {
            id: 'ai-n2-rag-pipeline',
            title: 'High-Accuracy RAG & Semantic Chunking',
            summary: 'Recursive character splitting, hybrid BM25 + dense search, cross-encoder reranking, and hallucination gates.',
            category: 'Architecture',
            difficulty: 'Medium',
            estimatedHours: '4 hrs',
            prerequisites: ['ai-n1-hnsw'],
            deepDive: {
              keyObjectives: [
                'Implement semantic boundary chunking preserving table and code context',
                'Build hybrid search fusion (Reciprocal Rank Fusion - RRF)',
                'Apply Cross-Encoder reranking models to filter false-positive context chunks'
              ],
              criticalPitfalls: [
                'Context window stuffing causing lost-in-the-middle recall degradation',
                'Ignoring document permissions and metadata filtering in vector queries'
              ],
              interviewerQuestions: [
                'How would you reduce RAG pipeline end-to-end latency from 1.5s to 300ms?',
                'When should you use fine-tuning instead of Retrieval-Augmented Generation?'
              ]
            },
            action: {
              type: 'system_design',
              label: 'Design Enterprise RAG Platform',
              templateId: 'system_design',
              targetPage: 'system-design-interview'
            }
          }
        ]
      },
      {
        id: 'ai-stage-2',
        stageNumber: 2,
        title: 'LLM Serving & Inference Engines',
        subtitle: 'GPU memory bandwidth limits, KV-cache management, continuous batching, and speculative decoding.',
        nodes: [
          {
            id: 'ai-n3-paged-attention',
            title: 'PagedAttention & KV-Cache Management',
            summary: 'Virtual memory paging for GPU VRAM, dynamic token allocation, and continuous batching.',
            category: 'System Design',
            difficulty: 'Hard',
            estimatedHours: '6 hrs',
            prerequisites: ['ai-n2-rag-pipeline'],
            deepDive: {
              keyObjectives: [
                'Calculate KV-cache size: 2 * 2 * n_layers * n_heads * d_head * seq_len * dtype_size',
                'Implement block table virtual paging to eliminate GPU VRAM fragmentation',
                'Enable prefix caching across multi-turn chat sessions and shared system prompts'
              ],
              criticalPitfalls: [
                'Out-of-memory (OOM) crashes under variable-length generation bursts',
                'Memory bandwidth bottlenecks during autoregressive token generation phase'
              ],
              interviewerQuestions: [
                'How does vLLM achieve 2x–4x higher throughput compared to HuggingFace TGI?',
                'Explain how Speculative Decoding uses a small draft model to speed up generation.'
              ]
            },
            action: {
              type: 'chat',
              label: 'Explore vLLM Internals'
            }
          }
        ]
      },
      {
        id: 'ai-stage-3',
        stageNumber: 3,
        title: 'AI Systems Capstone & Live Mock',
        subtitle: 'Design multi-modal model architectures and defend trade-offs in live mock interviews.',
        nodes: [
          {
            id: 'ai-n4-aiml-mock',
            title: 'Live Staff AI Mock: Planetary-Scale Code Assistant',
            summary: 'Streaming inference, context caching, speculative parsing, and telemetry for 10M developers.',
            category: 'Mock Round',
            difficulty: 'Hard',
            estimatedHours: '2 hrs',
            prerequisites: ['ai-n3-paged-attention'],
            deepDive: {
              keyObjectives: [
                'Design sub-100ms time-to-first-token (TTFT) architectures at global scale',
                'Handle multi-tenancy rate limiting, quota enforcement, and tier prioritizing',
                'Defend model evaluation frameworks (Evals, LLM-as-a-judge, safety guardrails)'
              ],
              criticalPitfalls: [
                'Neglecting cold-start GPU node provisioning latency in cloud autoscalers',
                'Failing to handle abrupt context degradation when generation runs out of tokens'
              ],
              interviewerQuestions: [
                'How would you architect GPU cluster autoscaling across Spot vs Reserved instances?',
                'Design the feedback loop to capture user acceptance/rejection of generated code snippets.'
              ]
            },
            action: {
              type: 'mock_interview',
              label: 'Start AI System Design Mock',
              templateId: 'aiml',
              targetPage: 'general-interview'
            }
          }
        ]
      }
    ]
  }
];
