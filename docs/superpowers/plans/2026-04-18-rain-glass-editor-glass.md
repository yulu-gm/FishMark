# Rain Glass Editor Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active editor surface in `Rain Glass` read like the welcome-card `empty-inner` glass panel.

**Architecture:** Keep the change CSS-only. Use `.document-editor` as the single visual glass card, then keep inner CodeMirror layers transparent or nearly transparent so the host card remains the visual base.

**Tech Stack:** Electron, React, TypeScript, CodeMirror 6, CSS theme packages

---

### Task 1: Turn The Editor Host Into The Glass Card

**Files:**
- Modify: `fixtures/themes/rain-glass/styles/ui.css`
- Modify: `fixtures/themes/rain-glass/styles/editor.css`

- [ ] **Step 1: Add the host glass treatment**
- [ ] **Step 2: Keep the CodeMirror root visually transparent**
- [ ] **Step 3: Add a very light inner veil only if readability needs support**

### Task 2: Mirror The Running Dev Theme Copy

**Files:**
- Modify: `C:/Users/yulu/AppData/Roaming/Yulora-dev/themes/rain-glass/styles/ui.css`
- Modify: `C:/Users/yulu/AppData/Roaming/Yulora-dev/themes/rain-glass/styles/editor.css`

- [ ] **Step 1: Mirror the repository CSS changes into the dev theme copy**
- [ ] **Step 2: Keep selectors and values aligned with the repo version**

### Task 3: Sanity Check Scope

**Files:**
- Review only: `docs/superpowers/specs/2026-04-18-rain-glass-editor-glass-design.md`

- [ ] **Step 1: Confirm the implemented surfaces match the spec scope**
- [ ] **Step 2: Stop after CSS-only work; do not widen into runtime refactors**
