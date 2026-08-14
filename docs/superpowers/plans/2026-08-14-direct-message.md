# Direct Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose one confirmation-gated local MCP tool that sends a plain-text direct message to one uniquely resolved app-visible employee.

**Architecture:** A Node helper resolves the exact employee name from the same Contact scope and authorized departments used by the company directory, then posts one `text` message to the resulting `open_id`. The local MCP validates the tiny input contract and passes only the approved values to that helper.

**Tech Stack:** Node.js ESM, native `fetch`, macOS Keychain, Feishu Contact v3 and IM v1 official APIs, JSON-RPC over stdio, Node built-in test runner.

## Global Constraints

- Input is exactly `recipient_name`, `text`, and `confirmation`.
- Require `confirmation === "send_direct_message"`; only one exact name match may be sent.
- Send only `msg_type: "text"`; maximum text length is 2,000 Unicode code units.
- Never support group, multi-recipient, attachment, card, reply, forward, update, or delete operations.
- Return no person ID, token, raw response, or raw error message.

---

### Task 1: Build and test the confirmation-gated direct-message helper

**Files:**

- Create: `scripts/send-feishu-direct-message`
- Create: `tests/test_direct_message_helper.mjs`

**Interfaces:**

- Consumes: `--recipient-name <exact_name>` and `--text <message>`.
- Produces: `{recipient_name: string, sent: true}` or `FEISHU_DIRECT_MESSAGE_ERROR stage=<stage> feishu_code=<code> http_status=<status>`.

- [ ] **Step 1: Write failing tests**

Use a fake `security` command and a local HTTP server. Assert the helper reads the Contact scope, resolves one exact name from the batch-user response, and issues exactly one request:

```js
assert.equal(messageRequest.method, 'POST');
assert.equal(messageRequest.pathname, '/open-apis/im/v1/messages');
assert.deepEqual(messageRequest.query, [['receive_id_type', 'open_id']]);
assert.deepEqual(messageRequest.body, {
  receive_id: 'open_test',
  msg_type: 'text',
  content: JSON.stringify({text: '你好'}),
});
```

Also assert zero/duplicate matches never post a message, unsafe text is rejected before Keychain access, and a rejected send is reduced to the safe diagnostic.

- [ ] **Step 2: Verify red**

Run: `node --test tests/test_direct_message_helper.mjs`  
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the narrow helper**

Create `scripts/send-feishu-direct-message` as an executable Node ESM script. Obtain the tenant token from the two existing Keychain services; load direct and department Contact scope records; match `record.name === recipientName`; require exactly one active record with `open_id`; post one official IM text message. Enforce the error format and emit only `{recipient_name, sent: true}`.

- [ ] **Step 4: Verify green**

Run: `node --test tests/test_direct_message_helper.mjs`  
Expected: all tests pass.

### Task 2: Expose and document the local MCP tool

**Files:**

- Modify: `scripts/feishu-local-mcp.mjs`
- Modify: `tests/test_local_mcp.mjs`
- Modify: `skills/feishu-operations/SKILL.md`
- Modify: `skills/feishu-operations/references/capability-catalog.md`

**Interfaces:**

- Consumes: `feishu_send_direct_message({recipient_name, text, confirmation})`.
- Produces: one helper success result or one scrubbed helper diagnostic.

- [ ] **Step 1: Add failing MCP tests**

Extend `tests/test_local_mcp.mjs` to require the new tool schema, require all three fields, reject `confirmation !== "send_direct_message"`, reject text longer than 2,000 characters, and reject unexpected arguments before the helper starts.

- [ ] **Step 2: Verify red**

Run: `node --test tests/test_local_mcp.mjs`  
Expected: FAIL because the new tool is absent.

- [ ] **Step 3: Implement schema, dispatch, and diagnostics**

Register the tool after `feishu_company_directory`. Validate exact keys, a non-empty single-line recipient name, a non-empty text of at most 2,000 characters, and the exact confirmation value. Dispatch to `send-feishu-direct-message`; recognize only the strict direct-message diagnostic regex.

- [ ] **Step 4: Update operating boundaries**

Add the tool to the local-tool list and catalog as “Available, confirmation-gated”; document name uniqueness, fixed plain text, and per-send confirmation.

- [ ] **Step 5: Verify green**

Run: `node --test tests/test_local_mcp.mjs tests/test_direct_message_helper.mjs`  
Expected: all tests pass.

### Task 3: Regress, install, and perform the authorized test send

**Files:**

- Modify: `.codex-plugin/plugin.json` through the cache-buster script only.

- [ ] **Step 1: Run full regression**

Run:

```bash
node --test tests/test_tenant_mcp_config.mjs tests/test_official_mcp_config.mjs tests/test_local_mcp.mjs tests/test_email_draft_helper.mjs tests/test_minute_transcript_helper.mjs tests/test_company_directory_helper.mjs tests/test_direct_message_helper.mjs && zsh tests/test_feishu_helpers.zsh
```

Expected: every Node test passes and the helper-guard script prints `PASS`.

- [ ] **Step 2: Install the updated plugin**

Run the existing plugin cache-buster script followed by `codex plugin add feishu-operations@personal`. Confirm source and cache trees match with `diff -rq`.

- [ ] **Step 3: Send the explicitly approved test**

From the installed `feishu_local` MCP, call:

```json
{
  "recipient_name": "张超煜",
  "text": "你好",
  "confirmation": "send_direct_message"
}
```

Report only delivery success or the scrubbed diagnostic; never reproduce any ID.
