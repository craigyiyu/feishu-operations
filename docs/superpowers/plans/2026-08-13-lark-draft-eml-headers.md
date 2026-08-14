# Lark Draft EML Header Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce Lark-compatible draft EMLs that include the mandatory Date and Message-ID headers.

**Architecture:** Keep the existing narrow Node.js draft helper. Generate the two headers within `buildRawMessage`, using a current UTC timestamp and a random local identifier, then rely on the current base64url transport path.

**Tech Stack:** Node.js, node:test, official Feishu Mail draft endpoint.

## Global Constraints

- The helper creates drafts only; it must never call a send endpoint.
- EML uses LF-only newlines.
- No credentials, message body, or upstream error text may be emitted in diagnostics.

---

### Task 1: Lock in EML header requirements

**Files:**
- Modify: `tests/test_email_draft_helper.mjs`
- Modify: `scripts/create-feishu-email-draft`

**Interfaces:**
- Consumes: `buildRawMessage({from, to, cc, bcc, subject, body, attachments})`
- Produces: base64url EML containing `Date` and `Message-ID` headers.

- [ ] **Step 1: Write the failing test**

Add assertions that the decoded EML includes a UTC `Date` header and a unique `Message-ID` ending in `@larksuite-cli`.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test tests/test_email_draft_helper.mjs`

Expected: FAIL because the existing EML has neither header.

- [ ] **Step 3: Write the minimal implementation**

Generate both headers from a single current `Date`, placing them in `commonHeaders` before MIME body headers.

- [ ] **Step 4: Run targeted and full local tests**

Run: `node --test tests/test_email_draft_helper.mjs tests/test_local_mcp.mjs && zsh tests/test_feishu_helpers.zsh`

Expected: PASS.

- [ ] **Step 5: Cache-bust and reinstall**

Run the Plugin Creator update helper, reinstall `feishu-operations` from its configured local marketplace, then create only the explicitly approved unsent draft.
