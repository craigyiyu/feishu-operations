# Tailscale Mail Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the VPS-backed Feishu mail companion through Tailscale SSH without public port 22 or a local private-key path.

**Architecture:** A narrow zsh wrapper streams the existing read-only Python mail helper into `tailscale ssh` targeting the VPS MagicDNS name. A separate provisioner copies only the two Feishu app credentials from macOS Keychain into a dedicated, mode-600 VPS credential file without altering Hermes’s regular `.env`. Documentation routes all VPS mail execution through that wrapper and records the official MCP as a separate, user-scope-gated read route.

**Tech Stack:** zsh, Tailscale CLI, Python mail helper, Node built-in test runner, existing Codex plugin installer.

## Global Constraints

- Default VPS target is exactly `ubuntu@bobvps`; no public IP default or public-SSH fallback.
- The transport command must be `tailscale ssh`; never pass `-i`, reference `tencent_vps`, or expose credentials in command arguments.
- Preserve read-only mail arguments and execute remotely as `hermes` using `sudo -n`.
- Reject a malformed `FEISHU_MAIL_VPS_TARGET` before launching Tailscale.

---

### Task 1: Add a tested Tailscale transport wrapper

**Files:**

- Create: `scripts/fetch-feishu-mail-via-tailscale`
- Create: `tests/test_tailscale_mail_route.mjs`

**Interfaces:**

- Consumes: existing `fetch_feishu_mail.py` arguments and optional `FEISHU_MAIL_VPS_TARGET` / `FEISHU_MAIL_FETCH_SCRIPT` environment variables.
- Produces: the remote helper's stdout/stderr and exit status, using the provisioned dedicated credential file.

- [ ] **Step 1: Write failing tests**

Create a temporary fake `tailscale` command which writes its argv to a test-owned file. Run the wrapper with a temporary Python input file and `--list-only` arguments. Assert the logged argv begins with:

```js
assert.deepEqual(argv.slice(0, 13), [
  'ssh', 'ubuntu@bobvps', 'sudo', '-n', '-u', 'hermes', 'env', 'HOME=/home/hermes', 'python3', '-s', '-',
  '--env-path', '/home/hermes/.hermes/feishu-mail.env',
]);
assert.equal(argv.includes('-i'), false);
assert.equal(argv.some((value) => value.includes('43.128.111.182') || value.includes('tencent_vps')), false);
```

Also assert `FEISHU_MAIL_VPS_TARGET='ubuntu@43.128.111.182;bad'` fails before the fake command is called.

- [ ] **Step 2: Verify red**

Run: `node --test tests/test_tailscale_mail_route.mjs`  
Expected: FAIL because the wrapper does not exist.

- [ ] **Step 3: Implement the wrapper**

Create executable zsh helper. Resolve the bundle-local Python input from `FEISHU_MAIL_FETCH_SCRIPT` or the installed global companion path. Validate `user@MagicDNS-host` with a strict single-line allowlist. Execute `tailscale ssh "$target" sudo -n -u hermes env HOME=/home/hermes python3 -s - --env-path /home/hermes/.hermes/feishu-mail.env "$@" < "$fetch_script"`.

### Task 1b: Provision the dedicated mail credential file

**Files:**

- Create: `scripts/provision-feishu-mail-credentials-via-tailscale`
- Modify: `tests/test_tailscale_mail_route.mjs`

Read `codex-feishu-app-id` and `codex-feishu-app-secret` from macOS Keychain. Stream exactly those values into `/home/hermes/.hermes/feishu-mail.env` through `tailscale ssh` and set mode `600` as `hermes`. Do not overwrite `/home/hermes/.hermes/.env`; ensure the test proves the secret is sent through stdin rather than a command argument.

- [ ] **Step 4: Verify green**

Run: `node --test tests/test_tailscale_mail_route.mjs`  
Expected: all tests pass.

### Task 2: Update routes and verify the live read-only path

**Files:**

- Modify: `skills/feishu-operations/SKILL.md`
- Modify: `skills/feishu-operations/references/setup.md`
- Modify: `skills/feishu-operations/references/capability-catalog.md`
- Modify: `/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/SKILL.md`

**Interfaces:**

- Consumes: the new wrapper for VPS-backed mail calls.
- Produces: documented public-SSH-free execution and the official MCP scope recovery path.

- [ ] **Step 1: Replace public-SSH documentation**

Remove the documented public IPv4/key route and its `scp` fallback. Use the wrapper for normal read-only retrieval and `tailscale ssh` for safe base64 transfer only when needed. Add the user scopes `mail:user_mailbox.folder:read` and `mail:user_mailbox.message:read` to the official-MCP recovery guidance.

- [ ] **Step 2: Run live bounded verification**

Run the wrapper with `--list-only`, one-hour scope, and a temporary output directory. Suppress the private helper output; report only the command exit status. Do not request bodies or attachments.

- [ ] **Step 3: Run full regression and install**

Run:

```bash
node --test tests/test_tenant_mcp_config.mjs tests/test_official_mcp_config.mjs tests/test_local_mcp.mjs tests/test_email_draft_helper.mjs tests/test_minute_transcript_helper.mjs tests/test_company_directory_helper.mjs tests/test_direct_message_helper.mjs tests/test_user_direct_message_helper.mjs tests/test_tailscale_mail_route.mjs && zsh tests/test_feishu_helpers.zsh
```

Then bump the plugin cache version, install from `personal`, compare source/cache with `diff -rq`, commit the intended bundle files, and push `main` to the private GitHub backup.
