# Frontend Audit & Actionable Fixes

**Target Project:** `Frontend/` (AI Interview Frontend)  
**Stack:** React 19 (`^19.2.6`), Vite 8 (`^8.0.12`), TypeScript 6 (`~6.0.2`), Tailwind CSS v4 (`^4.3.1`)  
**Audit Date:** October 2026  
**Status:** Audit Completed · Fixes Documented  

---

## 1. Executive Summary & Health Metrics

| Metric | Current State | Target / Healthy State | Priority |
| :--- | :--- | :--- | :--- |
| **Initial JS Bundle Size** | **3.86 MB (1,181 kB gzip)** | **< 400 kB gzip** | 🔴 High |
| **Route Code Splitting** | ❌ None (All 18 pages statically imported) | ✅ Dynamic `React.lazy` per route | 🔴 High |
| **React 19 Peer Deps** | ⚠️ `@excalidraw/excalidraw` peer conflicts | ✅ Resolved via `package.json` overrides | 🔴 High |
| **Dead Code & Packages** | Unreferenced `AssistantUI.tsx`, unused `zustand`, unused `puppeteer` | ✅ Pruned and uninstalled | 🔴 High |
| **ESLint Warnings & Errors** | 411 problems (398 errors, 13 warnings) | 0 errors | 🟡 Medium |
| **Mixed Service Imports** | Rollup warnings on dynamic vs static imports | Single import pattern per module | 🟡 Medium |
| **Routing Architecture** | Custom `window.history` SPA router | Type-safe router (TanStack / React Router v7) | 🟢 Long-Term |

---

## 2. Prioritized Fixes & Implementation Guides

---

### Fix 1: Route-Based Lazy Loading (Bundle Size Reduction)
* **File:** [`src/App.tsx`](src/App.tsx)
* **Problem:** Every page (including heavyweight pages like Monaco Code Editor, Excalidraw, Three.js, KaTeX, and Chart.js) is imported statically at the top of `App.tsx`. A user visiting just the landing page or login page is forced to download all 3.86 MB of JavaScript.
* **Solution:** Convert route components into dynamic `React.lazy()` imports and wrap the page switcher in a React `<Suspense>` boundary with a fallback loader.

#### Implementation Guide:
```tsx
import React, { Suspense, lazy } from 'react';
import LoadingSpinner from './components/LoadingSpinner'; // or lightweight skeleton

// Keep critical entry pages static or lazy
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

// Heavyweight pages MUST be lazily loaded
const DSAInterview = lazy(() => import('./pages/DSAInterview'));
const SystemDesignInterview = lazy(() => import('./pages/SystemDesignInterview'));
const GeneralInterview = lazy(() => import('./pages/GeneralInterview'));
const DSAPractice = lazy(() => import('./pages/DSAPractice'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const InterviewAnalysis = lazy(() => import('./pages/InterviewAnalysis'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const RoadmapsPage = lazy(() => import('./pages/RoadmapsPage'));
const CodeArenaPage = lazy(() => import('./pages/CodeArenaPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

// Inside App render:
<Suspense fallback={
  <div className="flex items-center justify-center min-h-screen bg-[#08090a]">
    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
}>
  {renderCurrentPage()}
</Suspense>
```
* **Expected Impact:** Initial bundle size drops from **3.86 MB to ~350 kB** (over 90% reduction in initial payload).

---

### Fix 2: Excalidraw & React 19 Dependency Resolution
* **File:** [`package.json`](package.json)
* **Problem:** `@excalidraw/excalidraw@0.18.1` has peer dependencies specifying `"react": "^16.8 || ^17.0 || ^18.0"`. When installed with `react@19`, npm throws `ELSPROBLEMS invalid: react@19.2.7`, causing CI/CD pipeline failures unless `--legacy-peer-deps` is used.
* **Solution:** Add an `overrides` section in `package.json` to instruct npm to resolve React 19 for Excalidraw's sub-dependencies.

#### Implementation Guide:
Add to [`package.json`](package.json):
```json
"overrides": {
  "@excalidraw/excalidraw": {
    "react": "$react",
    "react-dom": "$react-dom"
  }
}
```
Then run:
```bash
npm install
```

---

### Fix 3: Remove Dead Code and Unused Dependencies
* **Files:**
  - [`src/components/chat/AssistantUI.tsx`](src/components/chat/AssistantUI.tsx)
  - [`package.json`](package.json)
* **Problem:**
  - `AssistantUI.tsx` is an orphan component not imported anywhere (the actual chat interface used in the app is [`src/components/chat/ChatScreen.tsx`](src/components/chat/ChatScreen.tsx)). It imports `@ai-sdk/openai` and unnecessary UI elements.
  - `"zustand": "^5.0.14"` is installed in dependencies but is never imported in `src/` (state is handled via `chatReducer.ts` and React hooks).
  - `"puppeteer": "^25.2.1"` is listed in `devDependencies` and pulls down Chromium (~300MB+), but has no build or test scripts referencing it.
* **Solution:**
  1. Delete `src/components/chat/AssistantUI.tsx`.
  2. Uninstall unused packages:
     ```bash
     npm uninstall zustand puppeteer
     ```

---

### Fix 4: Fix Mixed Static & Dynamic Service Imports
* **Files:**
  - [`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx)
  - [`src/services/interviewService.ts`](src/services/interviewService.ts)
  - [`src/services/dsaService.ts`](src/services/dsaService.ts)
  - [`src/services/roadmapService.ts`](src/services/roadmapService.ts)
* **Problem:**
  Vite/Rollup outputs build warnings:
  ```
  src/services/interviewService.ts is dynamically imported by src/pages/Dashboard.tsx but also statically imported by ...
  ```
  This confuses Rollup chunking heuristics, preventing clean chunk splits.
* **Solution:**
  In [`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx), replace the inline `await import('../services/interviewService')` calls with top-level static imports (once route-level lazy loading is enabled via Fix 1, `Dashboard.tsx` itself will already be in its own async chunk).

---

### Fix 5: Clean Up ESLint Violations
* **Files:**
  - [`eslint.config.js`](eslint.config.js)
  - [`src/services/apiClient.ts`](src/services/apiClient.ts)
  - [`src/services/langgraphService.ts`](src/services/langgraphService.ts)
  - [`src/services/dsaService.ts`](src/services/dsaService.ts)
  - [`src/utils/formatDescription.ts`](src/utils/formatDescription.ts)
* **Problem:** `npm run lint` fails with 411 errors, primarily due to strict `@typescript-eslint/no-explicit-any` rules and minor variable declarations.
* **Solution:**
  1. Adjust ESLint rule severity in [`eslint.config.js`](eslint.config.js) during gradual refactoring:
     ```js
     rules: {
       ...
       '@typescript-eslint/no-explicit-any': 'warn',
     }
     ```
  2. Fix simple syntax warnings:
     - Remove unused `_sessionId` in `langgraphService.ts`.
     - Remove unused `token` parameter in `authService.ts`.
     - Replace unused `let` with `const` for `response` in `apiClient.ts:33`.
     - Replace unused `let` with `const` for `cleaned` in `formatDescription.ts:5`.
     - Handle or omit unused error objects in empty catch blocks in `dsaService.ts`.

---

### Fix 6: Long-Term Architecture - Modern Type-Safe Routing
* **Target:** Migrate [`src/App.tsx`](src/App.tsx) custom router to **TanStack Router** or **React Router v7**.
* **Rationale:**
  - The current custom router relies on `window.history.pushState` and string matching without search parameter serialization/validation.
  - A modern router provides native nested layouts (retaining IDE sidebars or interview states across view transitions), automatic route pre-fetching, and declarative error/loading boundaries.

---

## 3. Implementation Checklist

| Status | Task | Target File | Impact |
| :---: | :--- | :--- | :--- |
| [ ] | **Implement `React.lazy()` route splitting** | [`src/App.tsx`](src/App.tsx) | Bundle size drops from 3.86 MB to ~350 kB |
| [ ] | **Add Excalidraw overrides** | [`package.json`](package.json) | Fixes npm React 19 peer conflict in CI/CD |
| [ ] | **Uninstall unused packages (`zustand`, `puppeteer`)** | [`package.json`](package.json) | Saves ~350 MB disk & install time |
| [ ] | **Delete dead `AssistantUI.tsx`** | [`src/components/chat/AssistantUI.tsx`](src/components/chat/AssistantUI.tsx) | Code hygiene & bundle cleanup |
| [ ] | **Standardize service imports in `Dashboard.tsx`** | [`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx) | Removes Vite chunking warnings |
| [ ] | **Tune ESLint `no-explicit-any` to `warn` & fix vars** | [`eslint.config.js`](eslint.config.js) | Brings CI linting to green |
| [ ] | **Adopt TanStack Router / React Router v7** | Architecture | Type-safe navigation & query params |
