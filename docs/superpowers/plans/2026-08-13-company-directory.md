# Company Directory Implementation Plan

> **Implementation note (2026-08-13):** The original Core HR assumption below was disproved by the tenant's live data: Core HR returned zero records, while the official Contact directory returned 19 active app-visible employees after combining direct user scope and authorized department membership. The implemented helper and current capability catalog use the official Contact APIs; the remaining Core HR details in this historical plan are superseded.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, read-only Feishu company-directory tool that returns only each active employee's name, work email, `user_id`, `open_id`, and `employment_id`.

**Architecture:** A new Node.js helper owns the tenant-token request and performs one bounded Core HR search page plus, when required by the API identity representation, a bounded batch lookup to resolve the complementary ID type. It projects every raw record into the fixed five-field object before returning it. The existing local MCP only validates pagination inputs and dispatches to this helper; it never accepts caller-specified fields or filters.

**Tech Stack:** Node.js ESM, native `fetch`, macOS Keychain, JSON-RPC over stdio, Node built-in test runner, Feishu Core HR v2 official APIs.

## Global Constraints

- Keep execution local; do not create a file, CSV, Bitable, scheduled sync, cache, or remote service.
- Return only active (`hired`) employees and exactly `name`, `work_email`, `user_id`, `open_id`, and `employment_id`; represent unavailable allowed fields as `null`.
- Never expose a caller-controlled Core HR field list, keyword, department, status, endpoint, token, or arbitrary tenant-token request.
- Bound one call to 1–500 employees; default to 100; only read a following page when Craig explicitly requests it with the returned page token.
- Never write employee content into tests, documentation, logs, or completion reports.
- On backend failure return only `FEISHU_DIRECTORY_ERROR stage=<stage> feishu_code=<code> http_status=<status>`.

---

### Task 1: Build the tenant-scoped directory helper with contract tests

**Files:**
- Create: `scripts/fetch-feishu-company-directory`
- Create: `tests/test_company_directory_helper.mjs`

**Interfaces:**
- Consumes: `--page-size <1..500>` and optional opaque `--page-token <token>`.
- Produces: `{employees, has_more, page_token}` where every employee object has exactly five allowed keys.

- [ ] **Step 1: Write the failing helper tests**

Create a local HTTP server and temporary fake `security` executable. Assert that the helper first requests a tenant token using the existing two Keychain services, then sends one `POST /open-apis/corehr/v2/employees/search` with:

```js
assert.deepEqual(searchRequest.body, {
  employment_status: 'hired',
  fields: ['name', 'work_email'],
});
assert.equal(searchRequest.query.page_size, '2');
assert.equal(searchRequest.query.user_id_type, 'user_id');
assert.equal(searchRequest.authorization, 'Bearer test-tenant-token');
```

Have the fake response contain one user-ID representation and one open-ID representation keyed by the same `employment_id`; assert the helper emits only:

```js
{
  employees: [{
    name: 'Test Employee',
    work_email: 'employee@example.com',
    user_id: 'user_test',
    open_id: 'open_test',
    employment_id: 'employment_test',
  }],
  has_more: false,
  page_token: null,
}
```

Also test page-token forwarding, omitted/invalid page sizes, no raw response fields in stdout, and a 403 JSON response reduced to the exact safe diagnostic.

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `node --test tests/test_company_directory_helper.mjs`  
Expected: FAIL because `scripts/fetch-feishu-company-directory` does not exist.

- [ ] **Step 3: Implement the narrow helper**

Create `scripts/fetch-feishu-company-directory` as a Node ESM executable. Use only these Keychain lookups:

```js
keychain('craigyu', 'codex-feishu-app-id');
keychain('craigyu', 'codex-feishu-app-secret');
```

Obtain a tenant token only from `POST /open-apis/auth/v3/tenant_access_token/internal`. Call the Core HR employee-search endpoint with `employment_status: 'hired'`, the two fixed safe fields, `page_size`, optional `page_token`, and `user_id_type=user_id`. For the exact `employment_id` values returned, use the documented batch-get endpoint with `user_id_type=open_id` to resolve each matching open ID. Map only the five output keys; use `null` when the backend omits an allowed value. Do not print raw backend data, use a caller field list, or write to disk.

Implement `safeFeishuCode`, `safeHttpStatus`, and `directoryError` using the existing draft/minutes helpers' regular-expression constraints. Reject malformed argument shapes before acquiring a token.

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `node --test tests/test_company_directory_helper.mjs`  
Expected: all directory-helper tests pass.

### Task 2: Expose the bounded local MCP tool

**Files:**
- Modify: `scripts/feishu-local-mcp.mjs`
- Modify: `tests/test_local_mcp.mjs`

**Interfaces:**
- Consumes: `feishu_company_directory({page_size?: integer, page_token?: string})`.
- Produces: one helper result page; no generic HR input surface.

- [ ] **Step 1: Write the failing MCP schema and validation tests**

Extend the expected tool list with `feishu_company_directory`. Assert:

```js
const directory = tools.at(-1);
assert.deepEqual(directory.inputSchema.required, []);
assert.equal(directory.inputSchema.properties.page_size.minimum, 1);
assert.equal(directory.inputSchema.properties.page_size.maximum, 500);
assert.equal(directory.inputSchema.properties.page_size.default, 100);
assert.equal(directory.inputSchema.additionalProperties, false);
```

Call the tool with `{page_size: 501}` and `{fields: ['phone']}`. Assert both fail before the helper runs with respectively `page_size must be an integer between 1 and 500.` and `Unsupported argument: fields`.

- [ ] **Step 2: Run the MCP tests to verify they fail**

Run: `node --test tests/test_local_mcp.mjs`  
Expected: FAIL because the directory tool is absent.

- [ ] **Step 3: Implement schema, dispatcher, and safe error relay**

Append this tool after `feishu_minute_transcript`:

```js
{
  name: 'feishu_company_directory',
  description: 'Read one bounded page of active employees through Feishu Core HR. Returns only name, work email, user_id, open_id, and employment_id; never writes or exports employee data.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {type: 'integer', minimum: 1, maximum: 500, default: 100},
      page_token: {type: 'string', minLength: 1},
    },
    additionalProperties: false,
  },
}
```

Add a `FEISHU_DIRECTORY_ERROR` safe-diagnostic regex alongside the existing draft and Minutes patterns. In `callTool`, permit exactly `page_size` and `page_token`, validate their types, then invoke `fetch-feishu-company-directory` with only validated command-line flags.

- [ ] **Step 4: Run the MCP tests to verify they pass**

Run: `node --test tests/test_local_mcp.mjs tests/test_company_directory_helper.mjs`  
Expected: all local MCP and directory-helper tests pass.

### Task 3: Document, install, and verify the read-only workflow

**Files:**
- Modify: `skills/feishu-operations/SKILL.md`
- Modify: `skills/feishu-operations/references/capability-catalog.md`
- Modify: `.codex-plugin/plugin.json`

**Interfaces:**
- Consumes: the fixed local tool contract from Tasks 1–2.
- Produces: clear future-task routing and verified-status evidence.

- [ ] **Step 1: Update bundle guidance and catalog**

Add `feishu_company_directory` to the local-tool list. Document that it is active-employees-only, page-bounded, returns exactly the five approved fields, does not persist/export, and requires a new explicit request to follow a returned page token. Add a catalog row initially marked `Available, read-only, paginated`; after the live test, change it to `Verified, read-only, paginated`. Keep generic HR employee search guarded for targeted use only.

- [ ] **Step 2: Run the complete static regression**

Run:

```bash
node --test tests/test_tenant_mcp_config.mjs tests/test_official_mcp_config.mjs tests/test_local_mcp.mjs tests/test_email_draft_helper.mjs tests/test_minute_transcript_helper.mjs tests/test_company_directory_helper.mjs && zsh tests/test_feishu_helpers.zsh
```

Expected: every Node test passes and the helper script prints `PASS: Feishu helper argument guards`.

- [ ] **Step 3: Install the updated plugin**

Run:

```bash
python3 /Users/craigyu/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py /Users/craigyu/plugins/feishu-operations
codex plugin add feishu-operations@personal
```

Expected: a new cache-busted `feishu-operations@personal` version is enabled.

- [ ] **Step 4: Perform the smallest live read verification**

From the installed `feishu_local` MCP, call `feishu_company_directory` with `{"page_size": 5}`. Verify only that the response contains at most five active records and each contains exactly the five approved keys; do not persist or reproduce employee contents. If the response reports missing permissions or fields, report only the safe code/status and the exact missing scope; do not broaden access automatically.

- [ ] **Step 5: Verify installation identity**

Compare source and the reported installed cache directory with:

```bash
directory_plugin_root="$(codex plugin list | awk '$1 == "feishu-operations@personal" {print $NF}')"
diff -rq /Users/craigyu/plugins/feishu-operations "$directory_plugin_root"
```

Expected: exit code 0 and no diff output.

## Self-review

- Spec coverage: Tasks 1–3 implement the fixed five-field active-employee directory, pagination, no-persistence boundary, diagnostic redaction, tests, documentation, installation, and live verification.
- Placeholder scan: no deferred implementation, unspecified API surface, or unconstrained personal-data output remains. The live test has an exact page size and acceptance test.
- Interface consistency: `feishu_company_directory` is the sole MCP name in implementation, tests, documentation, and verification. It accepts only `page_size` and `page_token`, and emits only the five specified employee fields.
