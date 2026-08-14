# Calendar, Tasks, Approval, and Minutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed, safety-bounded set of Feishu calendar, task, approval, and Minutes capabilities to the local bundle and verify them safely.

**Architecture:** The `feishu` launcher passes one fixed official MCP allowlist built from the existing default preset plus the approved calendar, task, approval, and Minutes read tools. A narrow `feishu_local` tool calls the documented official Minutes transcript endpoint with the already-established user-token Keychain refresh flow. Documentation makes all writes confirmation-gated and all approval/Minutes access read-only.

**Tech Stack:** zsh launchers, Node.js ESM, Node built-in test runner, JSON-RPC over stdio, macOS Keychain, `@larksuiteoapi/lark-mcp`.

## Global Constraints

- Keep execution local; do not add remote hosting or an unauthenticated raw API surface.
- Remove `LARK_TOOLS` override support; the official tool list must be source-controlled and fixed.
- Never expose approval write tools, Minutes media export, or arbitrary tenant-token access.
- Use user access tokens for the personal calendar, tasks, approvals, and Minutes transcript read.
- Do not retain private Feishu content in docs, fixtures, or final output.
- Test calendar and task writes only with self-only `[Codex Test]` resources and delete them after readback.

---

### Task 1: Lock the official MCP exposure

**Files:**
- Modify: `scripts/launch-lark-mcp`
- Modify: `.mcp.json`
- Create: `tests/test_official_mcp_config.mjs`

**Interfaces:**
- Consumes: `scripts/launch-lark-mcp` Keychain credential lookup.
- Produces: a deterministic `--tools` comma-separated allowlist for the `feishu` MCP server.

- [ ] **Step 1: Write the failing configuration test**

```js
test('locks the official user MCP to the approved calendar, task, approval, and Minutes tools', async () => {
  const launcher = await readFile(path.join(pluginRoot, 'scripts', 'launch-lark-mcp'), 'utf8');
  const config = JSON.parse(await readFile(path.join(pluginRoot, '.mcp.json'), 'utf8'));
  for (const name of [
    'preset.default', 'preset.calendar.default', 'preset.task.default',
    'calendar.v4.calendarEvent.delete', 'task.v2.task.delete',
    'approval.v4.instance.query', 'minutes.v1.minute.get',
  ]) assert.match(launcher, new RegExp(name.replaceAll('.', '\\\\.')));
  assert.doesNotMatch(launcher, /LARK_TOOLS/);
  assert.deepEqual(config.mcpServers.feishu.env_vars, ['LARK_DOMAIN']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_official_mcp_config.mjs`  
Expected: FAIL because the test file is absent and `LARK_TOOLS` is still accepted.

- [ ] **Step 3: Implement the fixed allowlist**

```zsh
official_tools=(
  preset.default preset.calendar.default preset.task.default
  calendar.v4.calendarEvent.list calendar.v4.calendarEvent.delete
  calendar.v4.calendarEventAttendee.create calendar.v4.calendarEventAttendee.list
  task.v2.task.get task.v2.task.list task.v2.task.delete
  approval.v4.approval.get approval.v4.instance.get approval.v4.instance.list
  approval.v4.instance.query approval.v4.instanceComment.list
  approval.v4.task.query approval.v4.task.search minutes.v1.minute.get
)
args+=(--tools "${(j:,:)official_tools}")
```

Remove `LARK_TOOLS` from `.mcp.json` and delete the conditional override block from the launcher.

- [ ] **Step 4: Run the targeted test**

Run: `node --test tests/test_official_mcp_config.mjs`  
Expected: PASS with one passing test.

### Task 2: Add the read-only Minutes transcript helper

**Files:**
- Create: `scripts/fetch-feishu-minute-transcript`
- Modify: `scripts/feishu-local-mcp.mjs`
- Modify: `tests/test_local_mcp.mjs`
- Create: `tests/test_minute_transcript_helper.mjs`

**Interfaces:**
- Consumes: a 24-character `minute_token`; optional `format`, `need_speaker`, `need_timestamp`.
- Produces: transcript text on success; a non-sensitive `FEISHU_MINUTE_ERROR stage=<stage> feishu_code=<code> http_status=<status>` on official-API failure.

- [ ] **Step 1: Write failing helper and MCP-schema tests**

```js
assert.deepEqual(tools.map((tool) => tool.name), [
  'feishu_bot_diagnostics', 'feishu_bot_group_history',
  'feishu_v2_chat_messages', 'feishu_create_email_draft',
  'feishu_minute_transcript',
]);
assert.deepEqual(tools[4].inputSchema.required, ['minute_token']);
assert.equal(tools[4].inputSchema.properties.format.enum.join(','), 'txt,srt');
```

Use a local HTTP server and a fake `security` executable to assert that the helper sends `GET /open-apis/minutes/v1/minutes/<token>/transcript?file_format=txt`, uses `Bearer test-user-token`, rejects malformed tokens before the request, and returns only the permitted diagnostic fields on JSON failure.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/test_local_mcp.mjs tests/test_minute_transcript_helper.mjs`  
Expected: FAIL because the tool and helper do not exist.

- [ ] **Step 3: Implement the narrow helper and dispatch**

Implement token refresh using the existing Keychain service names and refresh endpoint pattern from `create-feishu-email-draft`. Validate `minute_token` with `/^[A-Za-z0-9]{24}$/`, accept only `txt`/`srt`, and use `URLSearchParams` for query parameters. Do not write any response to disk. Add `feishu_minute_transcript` to `feishu-local-mcp.mjs`, pass only the validated flags, and recognize only the safe diagnostic pattern in `runHelper`.

- [ ] **Step 4: Run targeted tests**

Run: `node --test tests/test_local_mcp.mjs tests/test_minute_transcript_helper.mjs`  
Expected: PASS with no failures.

### Task 3: Document the tool boundaries and install the bundle

**Files:**
- Modify: `skills/feishu-operations/SKILL.md`
- Modify: `skills/feishu-operations/references/capability-catalog.md`
- Modify: `.codex-plugin/plugin.json`

**Interfaces:**
- Consumes: official MCP and local helper capability boundaries from Tasks 1–2.
- Produces: user-facing routing and exact confirmation rules for future Codex tasks.

- [ ] **Step 1: Update operating guidance**

Document the fixed official tool sets, all confirmation requirements for calendar/task writes, and the `feishu_minute_transcript` read-only contract. State that approvals have no write path and transcript reads require a user-supplied Minutes URL/token; do not promise global discovery.

- [ ] **Step 2: Update the capability catalog**

Add four rows: calendar/meeting (available, guarded), task management (available, guarded), approval query (available, read-only), and Minutes metadata/transcript (available, read-only, token-scoped). Preserve the current HR/Payroll list unchanged.

- [ ] **Step 3: Bump and install the plugin**

Run:

```bash
python3 /Users/craigyu/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py /Users/craigyu/plugins/feishu-operations
codex plugin add feishu-operations@personal
```

Expected: a new cache-busted plugin version is installed and enabled.

### Task 4: Verify static behavior and safe live access

**Files:**
- Test: `tests/test_official_mcp_config.mjs`
- Test: `tests/test_local_mcp.mjs`
- Test: `tests/test_minute_transcript_helper.mjs`
- Test: `tests/test_email_draft_helper.mjs`
- Test: `tests/test_tenant_mcp_config.mjs`
- Test: `tests/test_feishu_helpers.zsh`

**Interfaces:**
- Consumes: the installed bundle and Craig's user authorization.
- Produces: evidence for the catalog’s verified/deferred statuses.

- [ ] **Step 1: Run full static regression**

Run:

```bash
node --test tests/test_tenant_mcp_config.mjs tests/test_official_mcp_config.mjs tests/test_local_mcp.mjs tests/test_email_draft_helper.mjs tests/test_minute_transcript_helper.mjs && zsh tests/test_feishu_helpers.zsh
```

Expected: all Node tests pass and the helper guard script prints `PASS: Feishu helper argument guards`.

- [ ] **Step 2: Use the installed official MCP to test calendar**

Read the primary calendar, create one self-only 10-minute `[Codex Test] Calendar capability verification` event, get it by ID, and delete the exact same event. Do not add attendees, video conference, meeting chat, or notifications.

- [ ] **Step 3: Use the installed official MCP to test task**

Create one self-owned `[Codex Test] Task capability verification` task, get it by ID, and delete that exact same task. Do not add members, reminders, or tasklists.

- [ ] **Step 4: Verify read-only Approval and Minutes routes**

Run the smallest permissible approval query and `minutes.v1.minute.get` only when a specific token is known. Run `feishu_minute_transcript` only for an explicit supplied token. If no accessible resource is known, record the route as installed and static-tested, not live-content-verified; never enumerate or guess private resources.

- [ ] **Step 5: Verify installed source identity**

Compare the current source tree to the reported installed cache directory, excluding no files. Report any difference before claiming installation is current.

## Self-review

- Scope coverage: Tasks 1–4 cover the approved Calendar/Task/Approval/Minutes scope, confirmation boundaries, implementation, documentation, installation, static regression, and live tests.
- Placeholder scan: no deferred implementation steps are hidden; missing user-provided Minutes tokens are explicitly treated as a safe, bounded verification condition.
- Interface consistency: the MCP tool is named `feishu_minute_transcript` in schema, dispatch, documentation, and tests; all official tool names match `@larksuiteoapi/lark-mcp` 0.5.1 catalog names.
