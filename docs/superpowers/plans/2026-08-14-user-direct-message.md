# User-Identity Direct Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmation-gated local MCP tool that sends one text message as Craig through his Feishu user authorization.

**Architecture:** A small Node helper resolves one exact employee with the existing bounded company-directory helper, obtains Craig's cached/refreshed user token from Keychain, and makes one IM v1 request. The MCP validates all inputs before starting the helper and only preserves a strict, scrubbed failure diagnostic.

**Tech Stack:** Node.js ESM, native `fetch`, macOS Keychain, Feishu Contact v3, Feishu IM v1, JSON-RPC over stdio, Node built-in test runner.

## Global Constraints

- Tool name: `feishu_send_user_direct_message`; confirmation: `send_user_direct_message`.
- Require one exact active employee name and one non-empty text message of at most 2,000 characters.
- Use `Authorization: Bearer <user_access_token>` for only the send request; never send with a tenant token.
- Require the user authorization scopes `im:message` and `im:message.send_as_user`; do not auto-authorize or modify scope configuration.
- Do not expose IDs, tokens, message body, raw responses, or raw Feishu messages.
- Do not add group, multi-recipient, attachment, card, rich-text, reply, forward, edit, delete, or scheduling support.

---

### Task 1: Add the user-identity helper through TDD

**Files:**

- Create: `scripts/send-feishu-user-direct-message`
- Create: `tests/test_user_direct_message_helper.mjs`

**Interfaces:**

- Consumes: `--recipient-name <exact_name> --text <plain_text> --confirmation send_user_direct_message`.
- Produces: `{recipient_name: string, sent: true}` or `FEISHU_USER_DIRECT_MESSAGE_ERROR stage=<stage> feishu_code=<code> http_status=<status>`.

- [ ] **Step 1: Write failing tests**

Create a fake `security` executable which returns a valid cached user token, and a local HTTP server for directory resolution and IM sending. Assert exactly one IM request, with the exact query/body and the user-token authorization header:

```js
assert.equal(messageRequest.authorization, 'Bearer test-user-token');
assert.deepEqual(messageRequest.query, [['receive_id_type', 'open_id']]);
assert.deepEqual(messageRequest.body, {
  receive_id: 'open-target',
  msg_type: 'text',
  content: JSON.stringify({text: '你好'}),
});
```

Also prove missing confirmation fails before Keychain access, duplicate names make no message request, and an official rejection becomes only the scrubbed diagnostic.

- [ ] **Step 2: Verify red**

Run: `node --test tests/test_user_direct_message_helper.mjs`  
Expected: FAIL because `scripts/send-feishu-user-direct-message` is absent.

- [ ] **Step 3: Implement the smallest helper**

Create executable `scripts/send-feishu-user-direct-message`. Reuse the company-directory helper for exact lookup. Read `codex-feishu-v2-token-expiry` and `codex-feishu-v2-user-access-token` from Keychain; if stale, refresh through the official OAuth v2 endpoint using the existing refresh token storage convention. POST one `text` message with the user token. Validate arguments before any credential access and emit only the specified safe result/error shapes.

- [ ] **Step 4: Verify green**

Run: `node --test tests/test_user_direct_message_helper.mjs`  
Expected: all tests pass.

### Task 2: Add MCP schema, routing, and documentation

**Files:**

- Modify: `scripts/feishu-local-mcp.mjs`
- Modify: `tests/test_local_mcp.mjs`
- Modify: `skills/feishu-operations/SKILL.md`
- Modify: `skills/feishu-operations/references/capability-catalog.md`

**Interfaces:**

- Consumes: `feishu_send_user_direct_message({recipient_name, text, confirmation})`.
- Produces: helper output or one strict `FEISHU_USER_DIRECT_MESSAGE_ERROR` diagnostic.

- [ ] **Step 1: Write failing MCP tests**

Extend the tool-list assertion with the new schema. Assert that a wrong confirmation, text longer than 2,000 characters, and an unexpected argument each fail before helper invocation.

- [ ] **Step 2: Verify red**

Run: `node --test tests/test_local_mcp.mjs`  
Expected: FAIL because the user-identity tool is absent.

- [ ] **Step 3: Implement schema and dispatch**

Register the tool after the bot direct-message tool. Validate exact keys, single-line name, text bounds, and the exact confirmation. Dispatch only to `send-feishu-user-direct-message`; add a separate strict safe-diagnostic regex.

- [ ] **Step 4: Document identity and recovery boundary**

Document that the new tool sends as Craig, that the older tool sends as the bot, and that a scope failure requires user reauthorization with `im:message` and `im:message.send_as_user` rather than bot availability changes.

- [ ] **Step 5: Verify green**

Run: `node --test tests/test_local_mcp.mjs tests/test_user_direct_message_helper.mjs`  
Expected: all tests pass.

### Task 3: Regress, install, and perform the authorized test

**Files:**

- Modify: `.codex-plugin/plugin.json` only through the existing cache-buster script.

- [ ] **Step 1: Run full regression**

Run:

```bash
node --test tests/test_tenant_mcp_config.mjs tests/test_official_mcp_config.mjs tests/test_local_mcp.mjs tests/test_email_draft_helper.mjs tests/test_minute_transcript_helper.mjs tests/test_company_directory_helper.mjs tests/test_direct_message_helper.mjs tests/test_user_direct_message_helper.mjs && zsh tests/test_feishu_helpers.zsh
```

Expected: every Node test passes and the shell guard prints `PASS`.

- [ ] **Step 2: Install and compare**

Run the plugin cache-buster script, then `codex plugin add feishu-operations@personal`; use `diff -rq` to ensure installed cache matches source.

- [ ] **Step 3: Invoke the authorized test**

From the installed `feishu_local` MCP call:

```json
{
  "recipient_name": "张超煜",
  "text": "你好",
  "confirmation": "send_user_direct_message"
}
```

Report only send outcome or the safe failure diagnostic. For a missing user scope, stop and give the minimum reauthorization action; never fall back to the bot.
