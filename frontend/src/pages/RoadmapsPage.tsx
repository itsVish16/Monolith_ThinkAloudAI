import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Sparkle, 
  Check, 
  Lock, 
  Cpu, 
  Database, 
  Rocket,
  Stack,
  GitBranch,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsIn,
  ArrowClockwise,
  Lightning,
  Plus,
  ArrowSquareOut,
  ArrowLeft,
  Fire,
  Star,
  FileText,
  X
} from '@phosphor-icons/react';
import { RoadmapCatalog } from '../components/roadmaps/RoadmapCatalog';
import { getRoadmaps, toggleRoadmapItem, type Roadmap } from '../services/roadmapService';
import '../styles/RoadmapsPage.css';

interface RoadmapsPageProps {
  onNavigate: (page: string, params?: any) => void;
  user?: any;
  embedded?: boolean;
  backendRoadmaps?: Roadmap[];
}

export interface DAGNode {
  id: string;
  title: string;
  category: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  type: 'dsa' | 'interview' | 'system_design';
  questionId?: string;
  templateId?: string;
  targetPage?: string;
  progressPercent: number; // 0 - 100
  totalProblems?: number;
  completedProblems?: number;
  prerequisites: string[]; // parent node IDs
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface DAGTrack {
  id: string;
  name: string;
  badge: string;
  description: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  nodes: DAGNode[];
}

// ============================================================================
// CURATED DAG TRACKS (Matching the NeetCode.io Tree Structure 1:1)
// ============================================================================

const DSA_CORE_NODES: DAGNode[] = [
  // Root Level 0
  {
    id: 'arrays-hashing',
    title: 'Arrays & Hashing',
    category: 'DSA',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 9,
    completedProblems: 9,
    prerequisites: [],
    x: 470,
    y: 35,
    width: 145,
    height: 42
  },

  // Level 1
  {
    id: 'two-pointers',
    title: 'Two Pointers',
    category: 'DSA',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 5,
    completedProblems: 5,
    prerequisites: ['arrays-hashing'],
    x: 390,
    y: 150,
    width: 130,
    height: 42
  },
  {
    id: 'stack',
    title: 'Stack',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 40,
    totalProblems: 7,
    completedProblems: 3,
    prerequisites: ['arrays-hashing'],
    x: 560,
    y: 150,
    width: 120,
    height: 42
  },

  // Level 2
  {
    id: 'binary-search',
    title: 'Binary Search',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 7,
    completedProblems: 7,
    prerequisites: ['two-pointers'],
    x: 250,
    y: 260,
    width: 135,
    height: 42
  },
  {
    id: 'sliding-window',
    title: 'Sliding Window',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 6,
    completedProblems: 6,
    prerequisites: ['two-pointers'],
    x: 415,
    y: 260,
    width: 135,
    height: 42
  },
  {
    id: 'linked-list',
    title: 'Linked List',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'lru-cache',
    progressPercent: 80,
    totalProblems: 6,
    completedProblems: 5,
    prerequisites: ['two-pointers'],
    x: 585,
    y: 260,
    width: 125,
    height: 42
  },

  // Level 3 (Convergence)
  {
    id: 'trees',
    title: 'Trees',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 85,
    totalProblems: 14,
    completedProblems: 12,
    prerequisites: ['binary-search', 'sliding-window', 'linked-list'],
    x: 425,
    y: 370,
    width: 125,
    height: 42
  },

  // Level 4
  {
    id: 'tries',
    title: 'Tries',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 3,
    completedProblems: 3,
    prerequisites: ['trees'],
    x: 280,
    y: 480,
    width: 120,
    height: 42
  },
  {
    id: 'heap-priority-queue',
    title: 'Heap / Priority Queue',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 60,
    totalProblems: 7,
    completedProblems: 4,
    prerequisites: ['trees'],
    x: 410,
    y: 570,
    width: 140,
    height: 48
  },
  {
    id: 'backtracking',
    title: 'Backtracking',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 65,
    totalProblems: 9,
    completedProblems: 6,
    prerequisites: ['trees'],
    x: 570,
    y: 480,
    width: 125,
    height: 42
  },

  // Level 5
  {
    id: 'intervals',
    title: 'Intervals',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 6,
    completedProblems: 6,
    prerequisites: ['heap-priority-queue'],
    x: 130,
    y: 680,
    width: 125,
    height: 42
  },
  {
    id: 'greedy',
    title: 'Greedy',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 8,
    completedProblems: 8,
    prerequisites: ['heap-priority-queue'],
    x: 290,
    y: 720,
    width: 125,
    height: 42
  },
  {
    id: 'advanced-graphs',
    title: 'Advanced Graphs',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 6,
    completedProblems: 6,
    prerequisites: ['heap-priority-queue'],
    x: 435,
    y: 700,
    width: 140,
    height: 42
  },
  {
    id: 'graphs',
    title: 'Graphs',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 70,
    totalProblems: 13,
    completedProblems: 9,
    prerequisites: ['backtracking'],
    x: 565,
    y: 590,
    width: 125,
    height: 42
  },
  {
    id: '1d-dynamic-programming',
    title: '1-D Dynamic Programming',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'longest-palindromic-substring',
    progressPercent: 100,
    totalProblems: 12,
    completedProblems: 12,
    prerequisites: ['backtracking'],
    x: 720,
    y: 580,
    width: 145,
    height: 48
  },

  // Level 6
  {
    id: '2d-dynamic-programming',
    title: '2-D Dynamic Programming',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'longest-palindromic-substring',
    progressPercent: 100,
    totalProblems: 11,
    completedProblems: 11,
    prerequisites: ['graphs', '1d-dynamic-programming'],
    x: 620,
    y: 725,
    width: 145,
    height: 48
  },
  {
    id: 'bit-manipulation',
    title: 'Bit Manipulation',
    category: 'DSA',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 7,
    completedProblems: 7,
    prerequisites: ['1d-dynamic-programming'],
    x: 790,
    y: 720,
    width: 135,
    height: 42
  },

  // Level 7 (Terminal)
  {
    id: 'math-geometry',
    title: 'Math & Geometry',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 75,
    totalProblems: 8,
    completedProblems: 6,
    prerequisites: ['2d-dynamic-programming', 'bit-manipulation'],
    x: 725,
    y: 835,
    width: 135,
    height: 42
  }
];

const SYSTEM_DESIGN_NODES: DAGNode[] = [
  {
    id: 'sys-protocols',
    title: 'Networking & Protocols',
    category: 'Architecture',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 4,
    completedProblems: 4,
    prerequisites: [],
    x: 460,
    y: 35,
    width: 165,
    height: 42
  },
  {
    id: 'sys-lb',
    title: 'Load Balancing & Proxies',
    category: 'Architecture',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 4,
    completedProblems: 4,
    prerequisites: ['sys-protocols'],
    x: 350,
    y: 150,
    width: 160,
    height: 42
  },
  {
    id: 'sys-cache',
    title: 'Distributed Caching (Redis)',
    category: 'Architecture',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'lru-cache',
    progressPercent: 85,
    totalProblems: 5,
    completedProblems: 4,
    prerequisites: ['sys-protocols'],
    x: 580,
    y: 150,
    width: 165,
    height: 42
  },
  {
    id: 'sys-storage',
    title: 'Databases (SQL vs LSM)',
    category: 'Architecture',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'lru-cache',
    progressPercent: 70,
    totalProblems: 6,
    completedProblems: 4,
    prerequisites: ['sys-lb', 'sys-cache'],
    x: 460,
    y: 260,
    width: 165,
    height: 42
  },
  {
    id: 'sys-rings',
    title: 'Consistent Hashing & Rings',
    category: 'Architecture',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 3,
    completedProblems: 3,
    prerequisites: ['sys-storage'],
    x: 310,
    y: 380,
    width: 165,
    height: 42
  },
  {
    id: 'sys-consensus',
    title: 'Consensus (Raft & Paxos)',
    category: 'Architecture',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 60,
    totalProblems: 4,
    completedProblems: 2,
    prerequisites: ['sys-storage'],
    x: 485,
    y: 380,
    width: 160,
    height: 42
  },
  {
    id: 'sys-kafka',
    title: 'Message Streaming (Kafka)',
    category: 'Architecture',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 5,
    completedProblems: 5,
    prerequisites: ['sys-storage'],
    x: 655,
    y: 380,
    width: 165,
    height: 42
  },
  {
    id: 'sys-resilience',
    title: 'Rate Limiting & Resiliency',
    category: 'Architecture',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 90,
    totalProblems: 4,
    completedProblems: 3,
    prerequisites: ['sys-rings', 'sys-consensus'],
    x: 350,
    y: 500,
    width: 165,
    height: 42
  },
  {
    id: 'sys-sharding',
    title: 'High Availability & Sharding',
    category: 'Architecture',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 75,
    totalProblems: 4,
    completedProblems: 3,
    prerequisites: ['sys-consensus', 'sys-kafka'],
    x: 600,
    y: 500,
    width: 165,
    height: 42
  },
  {
    id: 'sys-defense',
    title: 'Live System Design Defense',
    category: 'Interview',
    difficulty: 'Hard',
    type: 'interview',
    targetPage: 'system-design-interview',
    templateId: 'system_design',
    progressPercent: 50,
    totalProblems: 1,
    completedProblems: 0,
    prerequisites: ['sys-resilience', 'sys-sharding'],
    x: 460,
    y: 630,
    width: 185,
    height: 46
  }
];

const FULLSTACK_NODES: DAGNode[] = [
  {
    id: 'fs-browser',
    title: 'Browser Engine & DOM',
    category: 'Frontend',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 5,
    completedProblems: 5,
    prerequisites: [],
    x: 460,
    y: 35,
    width: 160,
    height: 42
  },
  {
    id: 'fs-react',
    title: 'React Fiber & Concurrency',
    category: 'Frontend',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 6,
    completedProblems: 6,
    prerequisites: ['fs-browser'],
    x: 350,
    y: 150,
    width: 165,
    height: 42
  },
  {
    id: 'fs-apis',
    title: 'APIs & Realtime WebSockets',
    category: 'Backend',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 80,
    totalProblems: 5,
    completedProblems: 4,
    prerequisites: ['fs-browser'],
    x: 580,
    y: 150,
    width: 165,
    height: 42
  },
  {
    id: 'fs-ssr',
    title: 'SSR & Edge Runtime',
    category: 'Fullstack',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 65,
    totalProblems: 4,
    completedProblems: 2,
    prerequisites: ['fs-react', 'fs-apis'],
    x: 460,
    y: 260,
    width: 160,
    height: 42
  },
  {
    id: 'fs-query',
    title: 'Database Query Optimization',
    category: 'Backend',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 90,
    totalProblems: 4,
    completedProblems: 3,
    prerequisites: ['fs-ssr'],
    x: 350,
    y: 380,
    width: 170,
    height: 42
  },
  {
    id: 'fs-auth',
    title: 'Distributed Auth (JWT/OAuth)',
    category: 'Security',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 3,
    completedProblems: 3,
    prerequisites: ['fs-ssr'],
    x: 580,
    y: 380,
    width: 165,
    height: 42
  },
  {
    id: 'fs-interview',
    title: 'Fullstack Mock Interview',
    category: 'Interview',
    difficulty: 'Hard',
    type: 'interview',
    targetPage: 'general-interview',
    templateId: 'fullstack',
    progressPercent: 50,
    totalProblems: 1,
    completedProblems: 0,
    prerequisites: ['fs-query', 'fs-auth'],
    x: 460,
    y: 510,
    width: 180,
    height: 46
  }
];

const AI_ML_NODES: DAGNode[] = [
  {
    id: 'ai-vector-math',
    title: 'Vector Math & Embeddings',
    category: 'AI',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 4,
    completedProblems: 4,
    prerequisites: [],
    x: 460,
    y: 35,
    width: 165,
    height: 42
  },
  {
    id: 'ai-vector-db',
    title: 'Vector DBs & HNSW Indexing',
    category: 'AI',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 4,
    completedProblems: 4,
    prerequisites: ['ai-vector-math'],
    x: 350,
    y: 150,
    width: 170,
    height: 42
  },
  {
    id: 'ai-transformers',
    title: 'Attention & Transformers',
    category: 'AI',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 75,
    totalProblems: 5,
    completedProblems: 4,
    prerequisites: ['ai-vector-math'],
    x: 580,
    y: 150,
    width: 165,
    height: 42
  },
  {
    id: 'ai-rag',
    title: 'RAG Pipeline & Retrieval',
    category: 'AI',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 85,
    totalProblems: 4,
    completedProblems: 3,
    prerequisites: ['ai-vector-db', 'ai-transformers'],
    x: 460,
    y: 260,
    width: 165,
    height: 42
  },
  {
    id: 'ai-quantization',
    title: 'Quantization & LoRA',
    category: 'AI',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 60,
    totalProblems: 3,
    completedProblems: 2,
    prerequisites: ['ai-transformers'],
    x: 350,
    y: 380,
    width: 160,
    height: 42
  },
  {
    id: 'ai-vllm',
    title: 'vLLM & PagedAttention',
    category: 'AI',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 4,
    completedProblems: 4,
    prerequisites: ['ai-rag', 'ai-quantization'],
    x: 580,
    y: 380,
    width: 165,
    height: 42
  },
  {
    id: 'ai-agents',
    title: 'Autonomous Agent Workflows',
    category: 'AI',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 90,
    totalProblems: 4,
    completedProblems: 3,
    prerequisites: ['ai-vllm'],
    x: 460,
    y: 500,
    width: 170,
    height: 42
  },
  {
    id: 'ai-interview',
    title: 'Live AI Engineering Defense',
    category: 'Interview',
    difficulty: 'Hard',
    type: 'interview',
    targetPage: 'general-interview',
    templateId: 'ai_engineer',
    progressPercent: 50,
    totalProblems: 1,
    completedProblems: 0,
    prerequisites: ['ai-agents'],
    x: 460,
    y: 630,
    width: 185,
    height: 46
  }
];

// ============================================================================
// CURATED SHEETS (Blind 75, Striver SDE, FAANG High-Frequency)
// ============================================================================

const BLIND_75_NODES: DAGNode[] = [
  // Level 0
  {
    id: 'b75-arrays',
    title: 'Arrays & Hashing',
    category: 'DSA',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 9,
    completedProblems: 9,
    prerequisites: [],
    x: 470,
    y: 35,
    width: 145,
    height: 42
  },
  // Level 1
  {
    id: 'b75-two-pointers',
    title: 'Two Pointers',
    category: 'DSA',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 5,
    completedProblems: 5,
    prerequisites: ['b75-arrays'],
    x: 380,
    y: 140,
    width: 135,
    height: 42
  },
  {
    id: 'b75-stack',
    title: 'Stack & Syntax',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 66,
    totalProblems: 3,
    completedProblems: 2,
    prerequisites: ['b75-arrays'],
    x: 570,
    y: 140,
    width: 140,
    height: 42
  },
  // Level 2
  {
    id: 'b75-binary-search',
    title: 'Binary Search',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 5,
    completedProblems: 5,
    prerequisites: ['b75-two-pointers'],
    x: 250,
    y: 250,
    width: 135,
    height: 42
  },
  {
    id: 'b75-sliding-window',
    title: 'Sliding Window',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 6,
    completedProblems: 6,
    prerequisites: ['b75-two-pointers'],
    x: 415,
    y: 250,
    width: 140,
    height: 42
  },
  {
    id: 'b75-linked-list',
    title: 'Linked List',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'lru-cache',
    progressPercent: 80,
    totalProblems: 6,
    completedProblems: 5,
    prerequisites: ['b75-two-pointers'],
    x: 585,
    y: 250,
    width: 130,
    height: 42
  },
  // Level 3 (Convergence to Trees)
  {
    id: 'b75-trees',
    title: 'Binary Trees & BST',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 85,
    totalProblems: 14,
    completedProblems: 12,
    prerequisites: ['b75-binary-search', 'b75-sliding-window', 'b75-linked-list'],
    x: 420,
    y: 360,
    width: 145,
    height: 42
  },
  // Level 4
  {
    id: 'b75-tries',
    title: 'Tries & Prefixes',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 3,
    completedProblems: 3,
    prerequisites: ['b75-trees'],
    x: 280,
    y: 470,
    width: 135,
    height: 42
  },
  {
    id: 'b75-heap',
    title: 'Heap / Priority Queue',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 75,
    totalProblems: 4,
    completedProblems: 3,
    prerequisites: ['b75-trees'],
    x: 440,
    y: 470,
    width: 145,
    height: 42
  },
  {
    id: 'b75-backtracking',
    title: 'Backtracking',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 50,
    totalProblems: 4,
    completedProblems: 2,
    prerequisites: ['b75-trees'],
    x: 610,
    y: 470,
    width: 135,
    height: 42
  },
  // Level 5
  {
    id: 'b75-graphs',
    title: 'Graphs & BFS/DFS',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 75,
    totalProblems: 8,
    completedProblems: 6,
    prerequisites: ['b75-tries', 'b75-heap'],
    x: 340,
    y: 580,
    width: 145,
    height: 42
  },
  {
    id: 'b75-1d-dp',
    title: '1D Dynamic Prog',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'longest-palindromic-substring',
    progressPercent: 85,
    totalProblems: 8,
    completedProblems: 7,
    prerequisites: ['b75-backtracking'],
    x: 550,
    y: 580,
    width: 155,
    height: 42
  },
  // Level 6
  {
    id: 'b75-intervals',
    title: 'Intervals',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 6,
    completedProblems: 6,
    prerequisites: ['b75-graphs'],
    x: 340,
    y: 690,
    width: 130,
    height: 42
  },
  {
    id: 'b75-2d-dp',
    title: '2D Dynamic Prog',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'longest-palindromic-substring',
    progressPercent: 60,
    totalProblems: 5,
    completedProblems: 3,
    prerequisites: ['b75-1d-dp'],
    x: 550,
    y: 690,
    width: 155,
    height: 42
  },
  // Level 7 (Capstone)
  {
    id: 'b75-capstone',
    title: 'Blind 75 Live Capstone Defense',
    category: 'Mock Round',
    difficulty: 'Hard',
    type: 'interview',
    targetPage: 'dsa-interview',
    templateId: 'dsa',
    progressPercent: 0,
    totalProblems: 1,
    completedProblems: 0,
    prerequisites: ['b75-intervals', 'b75-2d-dp'],
    x: 430,
    y: 800,
    width: 210,
    height: 46
  }
];

const STRIVER_SDE_NODES: DAGNode[] = [
  // Level 0
  {
    id: 'striver-arrays',
    title: 'Arrays Part I & II',
    category: 'DSA',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 12,
    completedProblems: 12,
    prerequisites: [],
    x: 460,
    y: 35,
    width: 150,
    height: 42
  },
  // Level 1
  {
    id: 'striver-linked-list',
    title: 'Linked List & Pointers',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'lru-cache',
    progressPercent: 85,
    totalProblems: 12,
    completedProblems: 10,
    prerequisites: ['striver-arrays'],
    x: 350,
    y: 140,
    width: 160,
    height: 42
  },
  {
    id: 'striver-greedy',
    title: 'Greedy Algorithms',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 8,
    completedProblems: 8,
    prerequisites: ['striver-arrays'],
    x: 570,
    y: 140,
    width: 150,
    height: 42
  },
  // Level 2
  {
    id: 'striver-recursion',
    title: 'Recursion & Backtracking',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 70,
    totalProblems: 10,
    completedProblems: 7,
    prerequisites: ['striver-linked-list'],
    x: 300,
    y: 250,
    width: 175,
    height: 42
  },
  {
    id: 'striver-binary-search',
    title: 'Binary Search Divide & Conq',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 85,
    totalProblems: 8,
    completedProblems: 7,
    prerequisites: ['striver-greedy'],
    x: 570,
    y: 250,
    width: 185,
    height: 42
  },
  // Level 3
  {
    id: 'striver-heaps',
    title: 'Heaps & Priority Queues',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 8,
    completedProblems: 8,
    prerequisites: ['striver-recursion', 'striver-binary-search'],
    x: 440,
    y: 360,
    width: 170,
    height: 42
  },
  // Level 4
  {
    id: 'striver-stack-queue',
    title: 'Stack & Monotonic Queue',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 80,
    totalProblems: 10,
    completedProblems: 8,
    prerequisites: ['striver-heaps'],
    x: 320,
    y: 470,
    width: 175,
    height: 42
  },
  {
    id: 'striver-strings',
    title: 'String Algorithms & KMP',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 70,
    totalProblems: 10,
    completedProblems: 7,
    prerequisites: ['striver-heaps'],
    x: 570,
    y: 470,
    width: 170,
    height: 42
  },
  // Level 5
  {
    id: 'striver-trees',
    title: 'Binary Trees & BST Master',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 88,
    totalProblems: 18,
    completedProblems: 16,
    prerequisites: ['striver-stack-queue', 'striver-strings'],
    x: 440,
    y: 580,
    width: 175,
    height: 42
  },
  // Level 6
  {
    id: 'striver-graphs',
    title: 'Graph Traversal & Shortest Path',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 75,
    totalProblems: 16,
    completedProblems: 12,
    prerequisites: ['striver-trees'],
    x: 320,
    y: 690,
    width: 195,
    height: 42
  },
  {
    id: 'striver-dp',
    title: 'Dynamic Programming Master',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'longest-palindromic-substring',
    progressPercent: 70,
    totalProblems: 20,
    completedProblems: 14,
    prerequisites: ['striver-trees'],
    x: 570,
    y: 690,
    width: 190,
    height: 42
  },
  // Level 7
  {
    id: 'striver-capstone',
    title: 'Striver SDE Onsite Simulation',
    category: 'Mock Round',
    difficulty: 'Hard',
    type: 'interview',
    targetPage: 'dsa-interview',
    templateId: 'dsa',
    progressPercent: 0,
    totalProblems: 1,
    completedProblems: 0,
    prerequisites: ['striver-graphs', 'striver-dp'],
    x: 435,
    y: 800,
    width: 210,
    height: 46
  }
];

const FAANG_TOP_NODES: DAGNode[] = [
  // Level 0
  {
    id: 'faang-core-hashing',
    title: 'Meta/Google High-Freq Arrays',
    category: 'DSA',
    difficulty: 'Easy',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 100,
    totalProblems: 10,
    completedProblems: 10,
    prerequisites: [],
    x: 450,
    y: 35,
    width: 185,
    height: 42
  },
  // Level 1
  {
    id: 'faang-sliding-twoptr',
    title: 'Amazon Sliding Window & Ptrs',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 88,
    totalProblems: 8,
    completedProblems: 7,
    prerequisites: ['faang-core-hashing'],
    x: 340,
    y: 140,
    width: 185,
    height: 42
  },
  {
    id: 'faang-lru-cache',
    title: 'Apple/Meta LRU & Structures',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'lru-cache',
    progressPercent: 100,
    totalProblems: 6,
    completedProblems: 6,
    prerequisites: ['faang-core-hashing'],
    x: 580,
    y: 140,
    width: 185,
    height: 42
  },
  // Level 2
  {
    id: 'faang-trees-graphs',
    title: 'Google Graph Traversals & Trees',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 78,
    totalProblems: 14,
    completedProblems: 11,
    prerequisites: ['faang-sliding-twoptr', 'faang-lru-cache'],
    x: 440,
    y: 250,
    width: 200,
    height: 42
  },
  // Level 3
  {
    id: 'faang-backtracking',
    title: 'Netflix Combinatorics & Paths',
    category: 'DSA',
    difficulty: 'Medium',
    type: 'dsa',
    questionId: 'two-sum',
    progressPercent: 75,
    totalProblems: 8,
    completedProblems: 6,
    prerequisites: ['faang-trees-graphs'],
    x: 320,
    y: 360,
    width: 190,
    height: 42
  },
  {
    id: 'faang-dp-opt',
    title: 'Meta/Amazon DP Optimizations',
    category: 'DSA',
    difficulty: 'Hard',
    type: 'dsa',
    questionId: 'longest-palindromic-substring',
    progressPercent: 66,
    totalProblems: 12,
    completedProblems: 8,
    prerequisites: ['faang-trees-graphs'],
    x: 570,
    y: 360,
    width: 190,
    height: 42
  },
  // Level 4
  {
    id: 'faang-concurrency',
    title: 'Google System Concurrency',
    category: 'Architecture',
    difficulty: 'Hard',
    type: 'system_design',
    questionId: 'two-sum',
    progressPercent: 50,
    totalProblems: 6,
    completedProblems: 3,
    prerequisites: ['faang-backtracking', 'faang-dp-opt'],
    x: 440,
    y: 470,
    width: 195,
    height: 44
  },
  // Level 5
  {
    id: 'faang-capstone',
    title: 'FAANG E5/L5 Onsite Simulation',
    category: 'Mock Round',
    difficulty: 'Hard',
    type: 'interview',
    targetPage: 'dsa-interview',
    templateId: 'dsa',
    progressPercent: 0,
    totalProblems: 1,
    completedProblems: 0,
    prerequisites: ['faang-concurrency'],
    x: 440,
    y: 580,
    width: 205,
    height: 46
  }
];

export const CURATED_DAG_TRACKS: DAGTrack[] = [
  {
    id: 'dsa-core',
    name: 'DSA Core (NeetCode 150)',
    badge: 'NeetCode 150 Foundation',
    description: 'Algorithmic tree covering all essential patterns with progressive prerequisites.',
    viewBoxWidth: 980,
    viewBoxHeight: 920,
    nodes: DSA_CORE_NODES
  },
  {
    id: 'sheet-blind-75',
    name: 'Blind 75 Essentials',
    badge: 'Blind 75 Curated Sheet',
    description: 'The definitive 75 LeetCode problems to master algorithmic interview patterns.',
    viewBoxWidth: 980,
    viewBoxHeight: 900,
    nodes: BLIND_75_NODES
  },
  {
    id: 'sheet-striver-sde',
    name: 'Striver SDE Sheet',
    badge: 'Top SDE Interview Problems',
    description: 'Comprehensive curated problem sheet for top product-based company interviews.',
    viewBoxWidth: 980,
    viewBoxHeight: 900,
    nodes: STRIVER_SDE_NODES
  },
  {
    id: 'sheet-faang-top',
    name: 'FAANG High-Frequency 100',
    badge: 'FAANG Top 100 Patterns',
    description: 'Top recurring questions asked in Meta, Google, Amazon, Apple & Netflix interviews.',
    viewBoxWidth: 980,
    viewBoxHeight: 680,
    nodes: FAANG_TOP_NODES
  },
  {
    id: 'sys-design',
    name: 'System Design Architecture',
    badge: 'L5-L7 Systems Architecture',
    description: 'Distributed systems roadmap from network protocols to live system defenses.',
    viewBoxWidth: 980,
    viewBoxHeight: 740,
    nodes: SYSTEM_DESIGN_NODES
  },
  {
    id: 'fullstack',
    name: 'Fullstack Systems',
    badge: 'End-to-End Architecture',
    description: 'Modern web platforms from DOM concurrency to distributed microfrontends.',
    viewBoxWidth: 980,
    viewBoxHeight: 620,
    nodes: FULLSTACK_NODES
  },
  {
    id: 'ai-ml',
    name: 'AI & ML Infrastructure',
    badge: 'LLM & Retrieval Engineering',
    description: 'Modern AI infrastructure covering vector search, vLLM, and autonomous agents.',
    viewBoxWidth: 980,
    viewBoxHeight: 740,
    nodes: AI_ML_NODES
  }
];

export const RoadmapsPage: React.FC<RoadmapsPageProps> = ({ 
  onNavigate, 
  user,
  embedded = false,
  backendRoadmaps: propBackendRoadmaps
}) => {
  const [viewMode, setViewMode] = useState<'catalog' | 'graph'>('catalog');
  const [selectedTrackId, setSelectedTrackId] = useState<string>('dsa-core');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Completed items set
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('thinkaloud_completed_nodes');
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set([
      'arrays-hashing', 'two-pointers', 'binary-search', 'sliding-window', 'tries', 
      'intervals', 'greedy', 'advanced-graphs', '1d-dynamic-programming', 
      '2d-dynamic-programming', 'bit-manipulation', 'b75-arrays', 'b75-two-pointers', 
      'striver-arrays', 'faang-core-hashing'
    ]);
  });

  // Custom AI path modal state
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [genCompany, setGenCompany] = useState('Google');
  const [genRole, setGenRole] = useState('Senior Systems');
  const [isGenerating, setIsGenerating] = useState(false);

  // Custom user tracks in state
  const [customTracks, setCustomTracks] = useState<DAGTrack[]>(() => {
    try {
      const stored = localStorage.getItem('thinkaloud_custom_dag_tracks');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  const handleDeleteCustomTrack = (trackId: string) => {
    setCustomTracks(prev => {
      const updated = prev.filter(t => t.id !== trackId);
      try {
        localStorage.setItem('thinkaloud_custom_dag_tracks', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    if (selectedTrackId === trackId) {
      setSelectedTrackId('dsa-core');
    }
  };

  const allTracks = useMemo(() => {
    return [...CURATED_DAG_TRACKS, ...customTracks];
  }, [customTracks]);

  const activeTrack = useMemo(() => {
    return allTracks.find(t => t.id === selectedTrackId) || allTracks[0];
  }, [allTracks, selectedTrackId]);

  // Pan & Zoom Canvas state
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Auto-center graph when track changes
  const resetOrFitView = useCallback(() => {
    if (!canvasViewportRef.current || !activeTrack) return;
    const vp = canvasViewportRef.current.getBoundingClientRect();
    const availableWidth = vp.width || 1200;
    const availableHeight = vp.height || 750;

    const targetWidth = activeTrack.viewBoxWidth + 80;
    const targetHeight = activeTrack.viewBoxHeight + 80;

    const scaleX = availableWidth / targetWidth;
    const scaleY = availableHeight / targetHeight;
    const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY) * 0.94, 0.65), 1.15);

    const initialX = (availableWidth - activeTrack.viewBoxWidth * fitScale) / 2;
    const initialY = Math.max(20, (availableHeight - activeTrack.viewBoxHeight * fitScale) / 2);

    setZoomScale(fitScale);
    setPanOffset({ x: initialX, y: initialY });
  }, [activeTrack]);

  useEffect(() => {
    if (viewMode === 'graph') {
      const timer = setTimeout(() => {
        resetOrFitView();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode, selectedTrackId, resetOrFitView]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || true) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoomScale(prev => Math.min(Math.max(prev * zoomFactor, 0.5), 1.9));
    }
  };

  // Mouse drag pan
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking on empty canvas (not on node card or button)
    const target = e.target as HTMLElement;
    if (target.closest('.dag-node-pill') || target.closest('button')) return;
    setIsPanning(true);
    startPanPos.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - startPanPos.current.x,
      y: e.clientY - startPanPos.current.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Direct Node Navigation (As requested: immediately redirects to Code Arena or Interview!)
  const handleNodeClick = (node: DAGNode, e: React.MouseEvent) => {
    // Don't trigger if user clicked the toggle button
    const target = e.target as HTMLElement;
    if (target.closest('.dag-node-toggle-btn')) return;

    if (node.targetPage) {
      onNavigate(node.targetPage, {
        templateId: node.templateId,
        questionId: node.questionId
      });
    } else if (node.type === 'interview') {
      onNavigate('dsa-interview', {
        questionId: node.questionId || 'two-sum',
        templateId: node.templateId || 'dsa'
      });
    } else {
      // DSA Problem node: DIRECTLY navigates to Code Arena for this problem!
      onNavigate('practice', {
        questionId: node.questionId || 'two-sum'
      });
    }
  };

  // Toggle node completion in-place
  const handleToggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompletedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      try {
        localStorage.setItem('thinkaloud_completed_nodes', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Compute stats for current track
  const trackStats = useMemo(() => {
    const total = activeTrack.nodes.length;
    const completed = activeTrack.nodes.filter(n => completedNodes.has(n.id) || n.progressPercent === 100).length;
    const percent = Math.round((completed / (total || 1)) * 100);
    return { total, completed, percent };
  }, [activeTrack, completedNodes]);

  // Compute bezier connectors between nodes
  const connectors = useMemo(() => {
    const nodeMap = new Map<string, DAGNode>();
    activeTrack.nodes.forEach(n => nodeMap.set(n.id, n));

    const edges: Array<{
      id: string;
      fromId: string;
      toId: string;
      pathD: string;
      isCompleted: boolean;
      isActive: boolean;
    }> = [];

    activeTrack.nodes.forEach(node => {
      if (!node.prerequisites || node.prerequisites.length === 0) return;

      const toNode = node;
      const toW = toNode.width || 135;
      const toX = toNode.x + toW / 2;
      const toY = toNode.y; // Top center of child

      node.prerequisites.forEach(prereqId => {
        const fromNode = nodeMap.get(prereqId);
        if (!fromNode) return;

        const fromW = fromNode.width || 135;
        const fromH = fromNode.height || 42;
        const fromX = fromNode.x + fromW / 2;
        const fromY = fromNode.y + fromH; // Bottom center of parent

        // Smooth cubic bezier S-curve exactly like NeetCode
        const midY = (fromY + toY) / 2;
        const pathD = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;

        const isFromDone = completedNodes.has(fromNode.id) || fromNode.progressPercent === 100;
        const isToDone = completedNodes.has(toNode.id) || toNode.progressPercent === 100;

        edges.push({
          id: `${fromNode.id}->${toNode.id}`,
          fromId: fromNode.id,
          toId: toNode.id,
          pathD,
          isCompleted: isFromDone && isToDone,
          isActive: isFromDone && !isToDone
        });
      });
    });

    return edges;
  }, [activeTrack, completedNodes]);

  // Custom AI Track Generator
  const handleGenerateCustomPath = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const customId = `custom-${Date.now()}`;
      const newTrack: DAGTrack = {
        id: customId,
        name: `${genCompany} Fast-Track`,
        badge: `${genCompany} ${genRole}`,
        description: `Custom synthesized DAG roadmap for ${genCompany} interview loops.`,
        viewBoxWidth: 980,
        viewBoxHeight: 650,
        nodes: [
          {
            id: `${customId}-1`,
            title: 'Arrays & Dynamic Windows',
            category: 'DSA',
            difficulty: 'Medium',
            type: 'dsa',
            questionId: 'two-sum',
            progressPercent: 100,
            totalProblems: 5,
            completedProblems: 5,
            prerequisites: [],
            x: 460,
            y: 40,
            width: 170,
            height: 42
          },
          {
            id: `${customId}-2`,
            title: 'LRU Cache & Memory Layouts',
            category: 'DSA',
            difficulty: 'Medium',
            type: 'dsa',
            questionId: 'lru-cache',
            progressPercent: 50,
            totalProblems: 4,
            completedProblems: 2,
            prerequisites: [`${customId}-1`],
            x: 350,
            y: 160,
            width: 175,
            height: 42
          },
          {
            id: `${customId}-3`,
            title: 'Consistent Hashing & Rings',
            category: 'Architecture',
            difficulty: 'Hard',
            type: 'dsa',
            questionId: 'two-sum',
            progressPercent: 30,
            totalProblems: 4,
            completedProblems: 1,
            prerequisites: [`${customId}-1`],
            x: 580,
            y: 160,
            width: 170,
            height: 42
          },
          {
            id: `${customId}-4`,
            title: 'Distributed Consensus & Raft',
            category: 'Architecture',
            difficulty: 'Hard',
            type: 'dsa',
            questionId: 'two-sum',
            progressPercent: 0,
            totalProblems: 3,
            completedProblems: 0,
            prerequisites: [`${customId}-2`, `${customId}-3`],
            x: 460,
            y: 280,
            width: 175,
            height: 42
          },
          {
            id: `${customId}-5`,
            title: `${genCompany} Live Mock Interview`,
            category: 'Interview',
            difficulty: 'Hard',
            type: 'interview',
            targetPage: 'dsa-interview',
            templateId: 'dsa',
            progressPercent: 0,
            totalProblems: 1,
            completedProblems: 0,
            prerequisites: [`${customId}-4`],
            x: 460,
            y: 420,
            width: 185,
            height: 46
          }
        ]
      };

      const updated = [newTrack, ...customTracks];
      setCustomTracks(updated);
      try {
        localStorage.setItem('thinkaloud_custom_dag_tracks', JSON.stringify(updated));
      } catch {}
      setSelectedTrackId(customId);
      setViewMode('graph');
      setIsGenerating(false);
      setIsGeneratorOpen(false);
    }, 700);
  };

  const getTrackIcon = (id: string) => {
    if (id.includes('blind-75')) return <Fire size={14} weight="fill" />;
    if (id.includes('striver')) return <FileText size={14} weight="duotone" />;
    if (id.includes('faang')) return <Star size={14} weight="fill" />;
    if (id.includes('dsa')) return <Lightning size={14} weight="fill" />;
    if (id.includes('sys')) return <Database size={14} weight="duotone" />;
    if (id.includes('fullstack')) return <Stack size={14} weight="duotone" />;
    if (id.includes('ai')) return <Cpu size={14} weight="duotone" />;
    return <Rocket size={14} weight="duotone" />;
  };

  return (
    <div className={`neet-roadmap-wrapper ${embedded ? 'is-embedded' : ''}`}>
      
      {viewMode === 'catalog' ? (
        /* =================================================================== */
        /* VIEW 1: ROADMAP CATALOG & DIRECTORY                                 */
        /* =================================================================== */
        <RoadmapCatalog
          tracks={allTracks}
          completedNodes={completedNodes}
          onSelectTrack={(trackId) => {
            setSelectedTrackId(trackId);
            setViewMode('graph');
          }}
          onCreateCustom={() => setIsGeneratorOpen(true)}
          onDeleteCustomTrack={handleDeleteCustomTrack}
        />
      ) : (
        /* =================================================================== */
        /* VIEW 2: INTERACTIVE DAG GRAPH VIEW                                  */
        /* =================================================================== */
        <div className="graph-view-enter" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', flex: 1, minHeight: 0 }}>
          
          {/* COMPACT TOP NAVIGATION BAR */}
          <header className="neet-topbar">
            {/* Left: Back Button + Brand Badge + Active Track Info */}
            <div className="neet-topbar-left">
              <button 
                type="button" 
                className="neet-back-catalog-btn"
                onClick={() => setViewMode('catalog')}
                title="Return to Roadmaps Directory"
              >
                <ArrowLeft size={16} weight="bold" />
                <span>All Roadmaps</span>
              </button>

              <div className="neet-logo-badge">
                <span className="neet-pulse-ring" />
                <span className="neet-logo-text">ROADMAP</span>
              </div>

              <div className="neet-track-info">
                <h1 className="neet-track-title">{activeTrack.name}</h1>
                <span className="neet-track-desc">{activeTrack.description}</span>
              </div>
            </div>

            {/* Center: Track Switcher Tabs */}
            <div className="neet-track-tabs">
              {allTracks.map(track => {
                const isActive = track.id === selectedTrackId;
                return (
                  <button
                    key={track.id}
                    className={`neet-track-tab-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedTrackId(track.id)}
                  >
                    {getTrackIcon(track.id)}
                    <span>{track.name.replace(' (NeetCode 150)', '')}</span>
                  </button>
                );
              })}
            </div>

            {/* Right: Progress Metric + Custom AI Path */}
            <div className="neet-topbar-right">
              <div className="neet-stats-badge">
                <span className="neet-stat-num">{trackStats.completed}</span>
                <span className="neet-stat-slash">/</span>
                <span className="neet-stat-total">{trackStats.total}</span>
                <span className="neet-stat-label">Solved</span>
                <span className="neet-stat-pct">({trackStats.percent}%)</span>
              </div>

              <button 
                className="neet-btn-custom-path"
                onClick={() => setIsGeneratorOpen(true)}
                title="Generate custom company pathway"
              >
                <Plus size={13} weight="bold" />
                <span>Custom Path</span>
              </button>
            </div>
          </header>

          {/* INTERACTIVE GRAPH CANVAS (Pan, Zoom, S-Curve Bezier Connectors) */}
          <div 
            className="neet-canvas-container"
            ref={canvasViewportRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          >
            {/* Canvas Grid Background */}
            <div className="neet-canvas-grid-bg" />

            {/* Scaled & Panned Graph Root */}
            <div 
              className="neet-graph-stage"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                transformOrigin: '0 0',
                width: `${activeTrack.viewBoxWidth}px`,
                height: `${activeTrack.viewBoxHeight}px`
              }}
            >
              {/* SVG Connector Layer */}
              <svg 
                className="neet-svg-layer"
                width={activeTrack.viewBoxWidth}
                height={activeTrack.viewBoxHeight}
              >
                <defs>
                  <linearGradient id="edgeGlowActive" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
                  </linearGradient>
                  <linearGradient id="edgeGlowDone" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0.6" />
                  </linearGradient>
                </defs>

                {connectors.map(edge => {
                  const isHovered = hoveredNodeId === edge.fromId || hoveredNodeId === edge.toId;

                  return (
                    <g key={edge.id}>
                      {/* Subtle Shadow Path */}
                      <path
                        d={edge.pathD}
                        className="neet-edge-shadow"
                      />
                      {/* Main Bezier Connector */}
                      <path
                        d={edge.pathD}
                        className={`neet-edge-path ${edge.isCompleted ? 'completed' : edge.isActive ? 'active' : 'locked'} ${isHovered ? 'hovered' : ''}`}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* HTML Interactive Nodes Layer */}
              <div className="neet-nodes-layer">
                {activeTrack.nodes.map(node => {
                  const isCompleted = completedNodes.has(node.id) || node.progressPercent === 100;
                  const isPartial = !isCompleted && node.progressPercent > 0;
                  const isHovered = hoveredNodeId === node.id;
                  const nodeWidth = node.width || 135;
                  const nodeHeight = node.height || 42;

                  return (
                    <div
                      key={node.id}
                      className={`dag-node-pill ${isCompleted ? 'is-completed' : isPartial ? 'is-partial' : 'is-default'} ${isHovered ? 'is-hovered' : ''}`}
                      style={{
                        left: `${node.x}px`,
                        top: `${node.y}px`,
                        width: `${nodeWidth}px`,
                        minHeight: `${nodeHeight}px`
                      }}
                      onClick={(e) => handleNodeClick(node, e)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      title={`Click to solve in Code Arena (${node.completedProblems || 0}/${node.totalProblems || 1} solved)`}
                    >
                      {/* Quick in-place toggle checkmark */}
                      <button
                        type="button"
                        className={`dag-node-toggle-btn ${isCompleted ? 'done' : ''}`}
                        onClick={(e) => handleToggleNode(node.id, e)}
                        title={isCompleted ? "Mark incomplete" : "Mark completed"}
                      >
                        <Check size={11} weight="bold" />
                      </button>

                      {/* Node Label / Title */}
                      <div className="dag-node-title-wrap">
                        <span className="dag-node-title">{node.title}</span>
                      </div>

                      {/* Slim Underline Progress Bar */}
                      <div className="dag-node-progress-track">
                        <div 
                          className={`dag-node-progress-fill ${isCompleted ? 'full' : ''}`}
                          style={{ width: `${isCompleted ? 100 : node.progressPercent}%` }}
                        />
                      </div>

                      {/* Hover Floating Action Tooltip */}
                      {isHovered && (
                        <div className="dag-node-hover-badge">
                          <span>{node.type === 'interview' ? 'Start Interview' : 'Open in Code Arena'}</span>
                          <ArrowSquareOut size={12} weight="bold" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Floating Zoom & Canvas Controls */}
            <div className="neet-floating-controls">
              <button 
                className="neet-ctrl-btn"
                onClick={() => setZoomScale(s => Math.min(s + 0.12, 1.8))}
                title="Zoom In"
              >
                <MagnifyingGlassPlus size={15} />
              </button>
              <span className="neet-ctrl-scale">{Math.round(zoomScale * 100)}%</span>
              <button 
                className="neet-ctrl-btn"
                onClick={() => setZoomScale(s => Math.max(s - 0.12, 0.5))}
                title="Zoom Out"
              >
                <MagnifyingGlassMinus size={15} />
              </button>
              <div className="neet-ctrl-divider" />
              <button 
                className="neet-ctrl-btn"
                onClick={resetOrFitView}
                title="Fit to Screen"
              >
                <ArrowsIn size={15} />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MINIMAL CUSTOM ROADMAP GENERATOR MODAL                              */}
      {/* =================================================================== */}
      {isGeneratorOpen && (
        <div 
          className="neet-modal-backdrop"
          onClick={() => !isGenerating && setIsGeneratorOpen(false)}
        >
          <div 
            className="neet-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="neet-modal-header">
              <div>
                <h3 className="neet-modal-title">Generate Custom Pathway</h3>
                <p className="neet-modal-desc">Synthesize a tailor-made DAG roadmap for targeted interviews.</p>
              </div>
              <button 
                className="neet-modal-close"
                onClick={() => setIsGeneratorOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="neet-modal-body">
              <div>
                <label className="neet-form-label">Target Company</label>
                <div className="neet-form-pills">
                  {['Google', 'Meta', 'Amazon', 'Apple', 'Netflix', 'Uber'].map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`neet-pill-option ${genCompany === c ? 'active' : ''}`}
                      onClick={() => setGenCompany(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="neet-form-label">Target Role</label>
                <div className="neet-form-pills">
                  {['Staff Distributed Systems', 'Senior Systems', 'L5 Fullstack', 'AI/ML Infrastructure'].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={`neet-pill-option ${genRole === r ? 'active' : ''}`}
                      onClick={() => setGenRole(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="neet-modal-footer">
              <button 
                type="button"
                className="neet-btn-cancel"
                onClick={() => setIsGeneratorOpen(false)}
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button 
                type="button"
                className="neet-btn-submit"
                onClick={handleGenerateCustomPath}
                disabled={isGenerating}
              >
                <Sparkle size={14} weight="fill" />
                <span>{isGenerating ? 'Synthesizing DAG...' : 'Build Custom Roadmap'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RoadmapsPage;
