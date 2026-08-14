# Official Feishu Mail Draft Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a narrowly scoped local MCP tool that creates one explicitly approved, unsent Feishu Mail draft in Craig's mailbox.

**Architecture:** The stdio local MCP validates a strict request and invokes one reviewed Node helper. The helper reads protected credentials from Keychain, uses the established tenant-token exchange, encodes the text body as base64url, and calls only the official create-draft endpoint. It intentionally exposes no other mail write APIs.

**Tech Stack:** Node.js ESM, MCP stdio, macOS Keychain, `curl`, official Feishu Mail API, Node built-in test runner.

## Global Constraints

- Only `POST /open-apis/mail/v1/user_mailboxes/{mailbox}/drafts` may mutate mail state.
- `confirmation` must exactly equal `create_draft`; callers must obtain Craig's explicit action-time approval after displaying the exact email.
- The feature must never send, schedule, update, delete, forward, reply, move, archive, or mark mail.
- Do not print credentials, tokens, raw email bodies, or raw Feishu responses.
- Use the existing default mailbox only when `mailbox` is omitted.
- The plugin directory is not a Git repository; do not attempt a commit.

---

### Task 1: Add the failing local-MCP contract tests

**Files:**
- Modify: `/Users/craigyu/plugins/feishu-operations/tests/test_local_mcp.mjs`

**Interfaces:**
- Consumes: `scripts/feishu-local-mcp.mjs` through JSON-RPC stdio.
- Produces: failing assertions for one `feishu_create_email_draft` schema and confirmation guard.

- [x] **Step 1: Add discovery and rejection tests**

```js
assert.equal(tools.find((tool) => tool.name === 'feishu_create_email_draft').inputSchema.required.includes('confirmation'), true);
const response = await callTool('feishu_create_email_draft', {
  to: ['craig.yu@hypervelocity.hk'], subject: 'Test', body_plain_text: 'Body', confirmation: 'send',
});
assert.equal(response.isError, true);
assert.match(response.content[0].text, /confirmation must equal create_draft/);
```

- [x] **Step 2: Run the local MCP test before implementation**

Run: `node --test /Users/craigyu/plugins/feishu-operations/tests/test_local_mcp.mjs`

Expected: FAIL because the draft tool is not registered.

### Task 2: Implement the narrowly scoped official draft helper

**Files:**
- Create: `/Users/craigyu/plugins/feishu-operations/scripts/create-feishu-email-draft`
- Modify: `/Users/craigyu/plugins/feishu-operations/scripts/feishu-local-mcp.mjs`
- Modify: `/Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh`

**Interfaces:**
- Consumes: CLI arguments `--mailbox`, `--to-json`, optional `--cc-json`/`--bcc-json`, `--subject`, and `--body-plain-text`.
- Produces: a scrubbed JSON object with `status: "draft_created"` and the returned `draft_id`.

- [x] **Step 1: Write helper guard tests before production code**

```zsh
output="$("$script" --to-json '["'"'not-an-email'"'"']' --subject Test --body-plain-text Body 2>&1)"
[[ $? -ne 0 ]] || exit 1
assert_contains "$output" 'to must contain at least one valid email address'
```

- [x] **Step 2: Run helper guards and confirm failure**

Run: `zsh /Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh`

Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement the helper**

Implement strict zsh argument parsing, email-array validation via Node, Keychain credential retrieval, an official tenant-token request, base64url body encoding, and one `curl --fail-with-body` create-draft request. Scrub all errors and return only `draft_created` plus `draft_id`.

- [x] **Step 4: Register the MCP tool**

Register an exact object schema for `mailbox`, `to`, `cc`, `bcc`, `subject`, `body_plain_text`, and `confirmation`. Reject every unexpected or malformed argument before spawning the helper. Require `confirmation === "create_draft"`.

- [x] **Step 5: Re-run the focused helper and MCP tests**

Run: `zsh /Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh && node --test /Users/craigyu/plugins/feishu-operations/tests/test_local_mcp.mjs`

Expected: PASS without a network mutation.

### Task 3: Document, package, and verify the tool boundary

**Files:**
- Modify: `/Users/craigyu/plugins/feishu-operations/skills/feishu-operations/SKILL.md`
- Modify: `/Users/craigyu/plugins/feishu-operations/skills/feishu-operations/references/capability-catalog.md`

- [x] **Step 1: Document the exact confirmation and no-send policy**

Add `feishu_create_email_draft` as “available, guarded”; state that the complete message needs exact confirmation and that send remains unavailable.

- [x] **Step 2: Run all plugin tests and MCP discovery**

Run: `node --test /Users/craigyu/plugins/feishu-operations/tests/test_tenant_mcp_config.mjs /Users/craigyu/plugins/feishu-operations/tests/test_local_mcp.mjs && zsh /Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh`

Expected: PASS; the local MCP advertises the draft tool and contains no mail-send tool.

- [x] **Step 3: Cache-bust and reinstall the personal plugin**

Run the Plugin Creator update script, then `codex plugin add /Users/craigyu/plugins/feishu-operations`. Verify `codex plugin list` reports the new version and `feishu-operations` as enabled.
