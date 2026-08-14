# Feishu Email Draft Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create explicitly approved Feishu Mail drafts with explicitly named local attachments and no send capability.

**Architecture:** Extend the existing Node draft helper and local MCP schema. Validate and load named regular files before authentication, construct one multipart MIME raw message, and call the already-reviewed official create-draft endpoint. Existing no-attachment drafts continue to use simple text MIME.

**Tech Stack:** Node.js ESM (`fs/promises`, `path`, `crypto`), MCP stdio, macOS Keychain, official Feishu Mail API, Node built-in test runner, zsh guard tests.

## Global Constraints

- `attachment_paths` is explicit only: one to ten absolute paths, no directories or symbolic links, no duplicate paths.
- The aggregate source attachment limit is exactly 20 MiB (`20 * 1024 * 1024` bytes).
- Validate all attachments before reading credentials or making network calls.
- The only mail mutation remains `POST /open-apis/mail/v1/user_mailboxes/{mailbox}/drafts`.
- The response must not contain attachment body bytes, tokens, raw MIME content, or email body text.
- The plugin directory is not a Git repository; do not attempt a commit.

---

### Task 1: Establish failing attachment behavior

**Files:**
- Modify: `/Users/craigyu/plugins/feishu-operations/tests/test_email_draft_helper.mjs`
- Modify: `/Users/craigyu/plugins/feishu-operations/tests/test_local_mcp.mjs`
- Modify: `/Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh`

- [x] **Step 1: Add a failing mock-server case**

Pass two temporary attachment paths, then assert the returned summary includes `attachment_count: 2`, decoded raw MIME includes `multipart/mixed`, both basenames, and both bytes.

- [x] **Step 2: Add local-MCP schema and invalid-path cases**

Assert `attachment_paths` accepts at most ten strings, rejects a non-array, and rejects an empty array before spawning the helper.

- [x] **Step 3: Run tests to establish red state**

Run: `node --test /Users/craigyu/plugins/feishu-operations/tests/test_email_draft_helper.mjs /Users/craigyu/plugins/feishu-operations/tests/test_local_mcp.mjs && zsh /Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh`

Expected: attachment behavior fails because the helper and MCP do not accept attachment paths.

### Task 2: Add bounded multipart draft creation

**Files:**
- Modify: `/Users/craigyu/plugins/feishu-operations/scripts/create-feishu-email-draft`
- Modify: `/Users/craigyu/plugins/feishu-operations/scripts/feishu-local-mcp.mjs`

- [x] **Step 1: Add attachment validation**

Parse `--attachment-paths-json`; require non-empty array when supplied, validate absolute unique paths, use `lstat` to reject non-regular files and symbolic links, and reject source bytes above 20 MiB.

- [x] **Step 2: Construct MIME attachments**

Use a cryptographically random MIME boundary, base64 lines wrapped to 76 characters, a safe mapped content type with an octet-stream fallback, and RFC 5987 filename encoding.

- [x] **Step 3: Register exact MCP forwarding**

Add optional `attachment_paths` schema and reject empty/non-string/non-array values. Forward JSON paths to the helper only after the existing exact message-confirmation checks succeed.

- [x] **Step 4: Run focused tests to reach green**

Run: `node --test /Users/craigyu/plugins/feishu-operations/tests/test_email_draft_helper.mjs /Users/craigyu/plugins/feishu-operations/tests/test_local_mcp.mjs && zsh /Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh`

Expected: PASS without a real mailbox write.

### Task 3: Document, install, and verify

**Files:**
- Modify: `/Users/craigyu/plugins/feishu-operations/skills/feishu-operations/SKILL.md`
- Modify: `/Users/craigyu/plugins/feishu-operations/skills/feishu-operations/references/capability-catalog.md`

- [x] **Step 1: Document preview and attachment safeguards**

Require attachment filename/size preview and exact approval; document the 20 MiB source-file limit and no-send boundary.

- [ ] **Step 2: Run all test suites and cached MCP discovery**

Run the three Node suites, zsh guard suite, cache-bust, reinstall `feishu-operations@personal`, and verify `tools/list` in the installed cache exposes `attachment_paths`.
