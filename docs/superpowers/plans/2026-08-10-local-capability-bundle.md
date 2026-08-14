# Local Feishu Capability Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Craig's already-authorized everyday Feishu workflows directly usable from local Codex without exposing an unrestricted tenant API surface.

**Architecture:** Keep the current official user-identity MCP for documents, Wiki, groups, Drive, and routine Bitable work. Add a second official MCP process that always uses a tenant token and exposes only a fixed read-only HR/payroll allowlist. Extend the local MCP only for reviewed read workflows that the official server cannot serve with the new OAuth user token.

**Tech Stack:** Codex plugin manifest, `@larksuiteoapi/lark-mcp`, Node.js MCP stdio, macOS Keychain, Feishu official APIs.

## Global Constraints

- Credentials and access tokens remain in macOS Keychain and never enter source, tests, logs, or documentation.
- Tenant MCP uses a fixed tool allowlist; it must not accept a caller-supplied tool list.
- HR and payroll initial exposure is read-only; no employee lifecycle, compensation, payment, deletion, or permission-management write operation is registered.
- Existing Bitable/document writes keep their exact-confirmation guardrail.
- Tests must verify the allowlist and MCP discovery without making a state-changing Feishu call.

---

### Task 1: Add a restricted official tenant MCP launcher

**Files:**
- Create: `scripts/launch-lark-tenant-mcp`
- Modify: `.mcp.json`
- Test: `tests/test_tenant_mcp_config.mjs`

**Produces:** A `feishu_tenant` MCP server that uses `tenant_access_token` and exposes only these read-only APIs:

```text
corehr.v1.department.get
corehr.v1.department.list
corehr.v2.department.parents
corehr.v2.department.search
corehr.v2.department.tree
corehr.v2.employee.batchGet
corehr.v2.employee.search
corehr.v1.compensationStandard.match
payroll.v1.costAllocationDetail.list
payroll.v1.costAllocationPlan.list
payroll.v1.costAllocationReport.list
payroll.v1.datasource.list
payroll.v1.datasourceRecord.query
```

- [x] **Step 1: Write the failing configuration test**
- [x] **Step 2: Run it and confirm the missing tenant MCP failure**
- [x] **Step 3: Add the launcher and MCP server entry**
- [x] **Step 4: Run configuration and protocol discovery tests**

### Task 2: Register the new OAuth-user message workflow

**Files:**
- Modify: `scripts/feishu-local-mcp.mjs`
- Create: `scripts/fetch-feishu-v2-chat-messages`
- Modify: `tests/test_local_mcp.mjs`
- Modify: `tests/test_feishu_helpers.zsh`

**Produces:** A local, read-only tool for messages in an explicitly specified visible chat, requiring an explicit chat ID and supporting a 1–500 total message limit. Requests above 50 require a bounded time window and are automatically paginated. It reads the v2 user token from Keychain and does not enumerate unrelated chats.

- [x] **Step 1: Write failing schema and argument-guard tests**
- [x] **Step 2: Run tests and confirm the unregistered-tool failure**
- [x] **Step 3: Implement the bounded v2 helper and MCP registration**
- [x] **Step 4: Run unit tests and a one-chat read-only verification**

### Task 3: Update capability inventory and final verification

**Files:**
- Modify: `skills/feishu-operations/references/capability-catalog.md`
- Modify: `skills/feishu-operations/SKILL.md`

- [x] **Step 1: Document exact identity, tool, and confirmation boundaries**
- [x] **Step 2: Run all helper/MCP tests**
- [x] **Step 3: Start tenant MCP and verify only the fixed allowlist is advertised**
- [x] **Step 4: Verify the local MCP lists the bounded v2-message tool and preserve existing tool tests**
