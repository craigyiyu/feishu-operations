---
name: feishu-operations
description: "Safely operate Craig's Feishu workspace from local Codex: inspect mail, groups, documents, wiki, and Bitables; diagnose the Craig AI 助理 bot; and perform explicitly approved writes through the official Feishu APIs."
---

# Feishu Operations

Use this bundle as Craig's **local-first Feishu work entrance**. It combines the official `@larksuiteoapi/lark-mcp` server, narrowly scoped official-API helpers, and the companion `feishu-mail-analysis` skill. It is for useful non-code work in Feishu; it is not a remote, always-on MCP service.

Read [capability-catalog.md](references/capability-catalog.md) before choosing a tool. Use the least data access that can answer the request.

## MCP Tool Selection

- Use the official `feishu` MCP tools whenever one covers the requested operation. They remain authoritative for chat discovery/members, documents, Wiki, Drive, Bitable, calendar, tasks, and the reviewed read-only approval/Minutes queries.
- The official `feishu` MCP has a source-controlled fixed tool selection: the existing default preset; calendar/meeting creation, modification, primary-calendar and free/busy tools plus event list/delete and attendee create/list; task create/modify/member/reminder tools plus task get/list/delete; and the reviewed read-only approval and Minutes metadata tools. Do not attempt to override or broaden this list through environment variables.
- Use the separate `feishu_local` MCP only for verified gaps: `feishu_bot_diagnostics`, `feishu_bot_group_history`, `feishu_v2_chat_messages`, `feishu_create_email_draft`, `feishu_minute_transcript`, `feishu_company_directory`, `feishu_send_direct_message`, and `feishu_send_user_direct_message`.
- For mailbox folder, message-list, and message-detail reads, prefer the official `feishu` MCP mail tools after Craig's user authorization includes `mail:user_mailbox.folder:read` and `mail:user_mailbox.message:read`. Use the reviewed Tailscale companion wrapper only for the existing attachment-analysis workflow or while those user scopes are pending.
- `feishu_bot_group_history` defaults to metadata-only. Set `include_content: true` only for an explicitly scoped request to analyze that selected group.
- `feishu_v2_chat_messages` requires an explicit chat ID and returns at most 500 messages. Requests above 50 require both a start and an end time. It is read-only and must not be used to enumerate chats.
- `feishu_create_email_draft` creates one unsent mail draft only after Craig has reviewed and explicitly approved the exact recipients, subject, body, and (when present) every attachment filename and size. Its `confirmation` must be `create_draft`. `attachment_paths` may contain 1–10 explicit absolute paths to regular local files, with a combined source-file limit of 20 MiB. It cannot send, update, delete, reply to, forward, archive, or otherwise modify mail.
- A failed `feishu_create_email_draft` call may return only `FEISHU_DRAFT_ERROR` with `stage`, `feishu_code`, and `http_status`. Use those values to identify the missing permission or response-shape issue; never expose the original API message, MIME payload, email body, attachment contents, or credentials.
- `feishu_minute_transcript` reads text only from one explicitly supplied Feishu Minutes URL/token. It requires the exact 24-character `minute_token`, accepts only `txt` or `srt`, and can request speaker labels and timestamps. It never searches Minutes, downloads audio/video, writes to Feishu, or saves the transcript locally. A failure may return only `FEISHU_MINUTE_ERROR` with `stage`, `feishu_code`, and `http_status`.
- `feishu_company_directory` reads one bounded page of active employees from the Craig AI 助理 app-visible Feishu Contact directory. It combines the app's directly visible users with members of its authorized departments, removes duplicates and resigned accounts, and accepts only `page_size` (1–500, default 100) and a returned `page_token`. It returns exactly name, work email, `user_id`, `open_id`, and `employment_id`; `employment_id` is `null` when the tenant has no linked Core HR record. It never accepts caller-specified fields or filters, reads no other HR fields, writes nothing, and does not persist or export the directory. Continue to a later page only when Craig explicitly asks. A failure may return only `FEISHU_DIRECTORY_ERROR` with `stage`, `feishu_code`, and `http_status`.
- `feishu_send_direct_message` sends one plain-text private message as Craig AI 助理 to one exact active employee name in the app-visible directory. It accepts only `recipient_name`, `text` (1–2,000 characters), and `confirmation: "send_direct_message"`; the send fails rather than guessing if the name is not unique. Before every call, display the exact recipient name and full text and obtain Craig's fresh explicit approval. It cannot send to groups or multiple people, and cannot send attachments, cards, rich text, replies, forwards, edits, or deletes. A failure may return only `FEISHU_DIRECT_MESSAGE_ERROR` with `stage`, `feishu_code`, and `http_status`.
- `feishu_send_user_direct_message` sends one plain-text private message as Craig through his Feishu user authorization, rather than as Craig AI 助理. It accepts only `recipient_name`, `text` (1–2,000 characters), and `confirmation: "send_user_direct_message"`; the send fails rather than guessing if the name is not unique. It requires Craig's user authorization to contain `im:message` and `im:message.send_as_user`. Before every call, display the exact recipient name and full text and obtain Craig's fresh explicit approval. It cannot send to groups or multiple people, and cannot send attachments, cards, rich text, replies, forwards, edits, or deletes. A failure may return only `FEISHU_USER_DIRECT_MESSAGE_ERROR` with `stage`, `feishu_code`, and `http_status`.
- Use `feishu_tenant` only for its fixed, read-only HR/payroll allowlist. Never add a tenant-token write tool without a separately approved bundle update and a precise confirmation workflow.

## Operating Modes

Classify every request before acting:

1. **Read** — search, inspect, summarize, or count. Perform the smallest practical query and do not persist private contents in project files.
2. **Proposal** — design a Bitable, document, message, or workflow. Show the proposed schema or exact content, but do not write it.
3. **Write** — create, update, share, import, send, or otherwise alter Feishu. Proceed only after Craig explicitly requests that exact change. For email, use the stricter approval rule below.

Never delete data, alter application permissions, or use a third-party/community Feishu connector as a fallback. Never put app secrets, tokens, email bodies, attachment bodies, message bodies, chat IDs, or person IDs in workspace documentation or the final summary.

## Primary Workflows

### Mail and attachment triage

- Invoke the `feishu-mail-analysis` companion skill for Craig's HyperVelocity mailbox.
- When that companion must execute on the Hermes VPS, first run `scripts/provision-feishu-mail-credentials-via-tailscale` to create its dedicated credential file, then run `scripts/fetch-feishu-mail-via-tailscale`. It targets `ubuntu@bobvps` through Tailscale and never falls back to a public IP, a public port 22 route, or a local SSH private key.
- When the request concerns Archive or a custom mail folder, first use the companion helper's `--list-folders` mode. It calls only the official read-only folder-list endpoint and returns scrubbed folder metadata; select a returned folder ID in memory, then make a separate, scoped message-read call. Never infer a folder from a localized display name alone.
- Mail pagination is not guaranteed to be ordered by message time. Do not stop after encountering one old message; use an explicit page bound, then report pages and oldest timestamp actually covered before making an absence claim.
- Narrow by time, sender, folder, subject, or keyword before reading bodies or downloading attachments.
- List-only metadata is the default. Decode a body or fetch an attachment only when necessary to answer the stated question.
- Before any draft, reply, forward, schedule, or send, show the complete recipient list, subject, body, and each attachment's basename and byte size and obtain Craig's explicit approval for that exact message. For `feishu_create_email_draft`, pass `confirmation: "create_draft"` only after that approval. When using attachments, provide every required file in `attachment_paths`; never quietly create an attachment-free replacement. The tool creates an unsent draft; it must never be used to send it. A test may be sent only to Craig himself when he has explicitly requested that test.

### Group intelligence

- List eligible groups with `im_v1_chat_list`; inspect membership with `im_v1_chatMembers_get` when that answers the question.
- To inspect messages in a group that contains the Craig AI 助理 bot, use `scripts/fetch-feishu-chat-history` with an explicit chat ID and `--page-size` from 10 to 50. The Feishu endpoint is known to give misleading first-page results at page size 1, so do not override this guard.
- Start with `--metadata-only` for inventory work. Read message content only for the specific group and purpose Craig requested; keep any summary factual and scoped.
- A 400 response usually means the bot is not a member of that group. Report that limitation; do not try to add the bot or change its permissions without explicit authorization.

### Direct messages

- Resolve a person through `feishu_company_directory` only when necessary. Match the exact name, never a partial or inferred name.
- Before `feishu_send_direct_message` or `feishu_send_user_direct_message`, show Craig the exact person and full message text. Call it only when he explicitly confirms that exact one-to-one message in the current conversation. Use the former only when the message should come from Craig AI 助理, and the latter only when it should come from Craig.
- Report only whether it was sent, or the scrubbed error code/status. Do not include a person ID or message ID in the handoff.

### Documents, Drive, and Wiki

- Use `docx_builtin_search` to find documents, then `docx_v1_document_rawContent` only for the selected resource.
- Use `wiki_v1_node_search` to locate a node and `wiki_v2_space_getNode` to inspect its metadata.
- Do not import, overwrite, or share a document without a specific confirmed target and content.

### Bitable

- First state the operating question, primary record, fields, lifecycle states, owners, reporting views, and automation boundary.
- Use the official Bitable list/search tools to inspect an existing base. Preserve its views and automations.
- Creating a base/table, changing fields, or creating/updating records is a write. Require exact confirmation of the target and payload, then read back the result.

### Calendar, meetings, and tasks

- Use the official `feishu` calendar tools to inspect the primary calendar, query free/busy, and read selected events. Read the selected calendar/event before any modification when practical.
- Before creating, editing, deleting, or inviting anyone to an event, show Craig the exact calendar, title, time zone, start/end time, recurrence, visibility, video/meeting-chat setting, notification setting, and every attendee/meeting room. Act only after he explicitly confirms that exact change. Never create a meeting chat, video conference, or external invitation as an implicit side effect.
- Use the official task tools to list and inspect Craig's selected tasks. Before creating, updating, deleting, assigning, following, or adding a reminder, show the exact task title, description, due time, task list, assignees/followers, and reminder. Act only after explicit confirmation, then read back the result.
- A temporary self-only test event or task may be created and deleted only when Craig has explicitly authorized the test. Do not leave test artifacts behind.

### Approvals and Minutes

- The bundle exposes approvals only through read tools: definition/instance/task/comment lookup. Never create, approve, reject, transfer, resubmit, revoke, add signers, comment, subscribe, or otherwise alter an approval through this bundle.
- For Minutes, use `minutes.v1.minute.get` for an explicitly selected token's metadata and `feishu_local.feishu_minute_transcript` for text. Request or extract the token only from a Minutes URL Craig explicitly provides; do not enumerate Minutes or infer a token. Default to a concise summary and return verbatim transcript only when Craig asks for it.

### HR and payroll

- Start with the smallest read-only query through `feishu_tenant`; prefer organization, department, payroll-plan, or data-source metadata before employee-level data.
- For an active-employee directory, use `feishu_local.feishu_company_directory` rather than generic Core HR search. Do not use it to fetch former employees, department-specific lists, or additional employee attributes.
- Treat employee personal data and any compensation result as sensitive. Return only fields necessary for Craig's stated purpose; do not retain them in workspace files.
- The tenant MCP is intentionally read-only. Do not use or introduce employee changes, compensation changes, payment, deletion, permission, or role-management operations without an explicit new design and exact action-time approval.

### Craig AI 助理 health check

- Run `scripts/feishu-bot-diagnostics` for a non-sensitive summary of app activation, organization-scope counts, and bot-chat count.
- The script outputs no app ID, app secret, token, user list, department list, chat ID, or message content.
- Bot event reception remains unverified until the Feishu developer console/event logs are accessible. Do not claim that the bot can respond to @mentions merely because the bot is active or can send.

## Authentication and Local Helpers

- Use Feishu China by default: `LARK_DOMAIN=https://open.feishu.cn`.
- Official `feishu` MCP uses Craig's user authorization for personal resources. `feishu_tenant` uses the app credentials only for its fixed HR/payroll read-only allowlist. The local draft and Minutes-transcript helpers use Craig's refreshed user access token from Keychain for their documented official endpoints; the local diagnostics/history helpers use Keychain credentials solely for their documented official endpoints. The optional VPS mail companion receives app credentials from macOS Keychain into its dedicated VPS file only over Tailscale MagicDNS, never through public SSH.
- Never ask Craig to paste an App Secret into chat or put it in a tracked file. If Keychain credentials or user authorization are missing, report the minimum recovery action from [setup.md](references/setup.md).
- Do not use the raw API ad hoc. The only permitted raw calls are the reviewed read-only helpers and the separately reviewed, confirmation-gated `create-feishu-email-draft` helper in `scripts/`; its only mutation is creating one draft, with optional explicitly named local attachments. Extend them only through a reviewed bundle change with input guards and tests.

## Verification and Failure Handling

1. Check that the needed MCP tool or reviewed helper is available.
2. Read before any write; for a write, confirm the affected resource and exact payload.
3. Verify a successful write with a follow-up read, then report only the outcome and non-sensitive identifiers.
4. For authorization failure, expired UAT, unavailable endpoints, or a missing event subscription, identify the minimum missing scope/configuration and stop. Do not broaden permissions or retry broadly.

See [capability-catalog.md](references/capability-catalog.md) for the current verified and deferred capability boundaries.
