# Local Feishu Capability Catalog

This catalog is the working boundary for the `feishu-operations` bundle. “Verified” means the local Codex environment has completed a successful, non-sensitive test. It does not grant permission for a write.

| Area | Current local path | Status | Guardrail |
| --- | --- | --- | --- |
| Recent sent mail, inbox metadata, attachments | `feishu-mail-analysis` companion skill | Verified | Read smallest scope; email writes need exact approval. |
| Mail-folder discovery and archived-folder metadata | `feishu-mail-analysis` companion helper: `--list-folders` | Verified, read-only | Call folder discovery first; select the returned folder ID in memory and use a separate, scoped message read. Do not guess from localized folder labels; pages are not guaranteed to be time-sorted. |
| Create one unsent email draft, optionally with local attachments | Local MCP: `feishu_local.feishu_create_email_draft` | Verified, guarded | Craig must review and explicitly approve the exact recipient list, subject, body, and attachment names/sizes; tool requires `confirmation: "create_draft"`. Attachments are 1–10 explicit absolute regular-file paths, up to 20 MiB combined; no file is silently omitted. The helper constructs a Lark-compatible MIME message with an explicit `From` header and LF-only line endings, and calls the official draft-create endpoint with Craig's user access token. It cannot send, update, delete, reply, forward, archive, or change email status. Failures report only a safe stage, Feishu code, and HTTP status. |
| Group discovery and members | Official MCP: `im_v1_chat_list`, `im_v1_chatMembers_get` | Verified | Inspect only groups relevant to Craig's request. |
| Bot-accessible group history | Local MCP: `feishu_local.feishu_bot_group_history` | Verified | Use official group discovery first; bot must be a member; page size is 10–50; metadata-only by default. |
| Bot health and accessible-scope counts | Local MCP: `feishu_local.feishu_bot_diagnostics` | Verified | Summary output only; no identities or chat names. |
| Document search and raw content | Official MCP document tools | Verified | Search first, read selected document only. |
| Wiki discovery and node metadata | Official MCP wiki tools | Verified | No import or permission changes without confirmation. |
| Bitable schema/record inspection | Official MCP Bitable list/search tools | Verified | Preserve existing structure and automations. |
| Bitable creation and record updates | Official MCP Bitable write tools | Available, guarded | Exact target and payload confirmation required. |
| Document import and sharing | Official MCP document/permission tools | Available, guarded | Exact destination/content/recipient confirmation required. |
| One explicitly selected chat's message history | Local MCP: `feishu_local.feishu_v2_chat_messages` | Verified | Requires explicit chat ID; returns up to 500 messages. Requests above 50 require a start/end time; read-only. |
| Calendar and meetings | Official user MCP: fixed Calendar allowlist | Available, guarded | Read primary calendar/free-busy/events first. Creating, modifying, deleting, inviting attendees, creating a meeting chat/video conference, or sending notifications requires Craig's exact action-time confirmation and a readback. |
| Personal task management | Official user MCP: fixed Task allowlist | Available, guarded | List/get/create/update/delete tasks and add members/reminders. Any mutation, assignment, or reminder needs Craig's exact action-time confirmation and a readback. |
| Approval lookup | Official user MCP: fixed Approval read allowlist | Installed; user authorization pending | Read definitions, selected instances, task lists, and instance comments. No create/approve/reject/transfer/resubmit/revoke/comment/subscription tool is exposed. A 2026-08-12 live query reached Feishu but requires either `approval:approval:readonly` or `approval:task:list_by_user` in Craig's user authorization. |
| Minutes metadata and selected transcript | Official MCP: `minutes.v1.minute.get`; local MCP: `feishu_local.feishu_minute_transcript` | Available, read-only, token-scoped | Reads a specified Minutes token only. Transcript accepts only txt/srt and never searches Minutes, downloads media, writes to Feishu, or saves content locally. |
| Active employee directory | Local MCP: `feishu_local.feishu_company_directory` | Verified, read-only, paginated | Reads one requested page of active employees in Craig AI 助理's app-visible Feishu Contact directory, including directly visible users and members of authorized departments. Returns exactly name, work email, `user_id`, `open_id`, and `employment_id` (`null` when no linked Core HR record exists). Page size is 1–500 (default 100); continuation requires a new explicit request with the returned token. It cannot filter, export, persist, or return any other HR field. A 2026-08-13 live verification returned 19 active employees with work email, `user_id`, and `open_id` present for every result. |
| HR organization and employee lookup | Official tenant MCP: `feishu_tenant` | Verified, read-only | Fixed 8-tool Core HR allowlist only; do not expose employee lifecycle changes. |
| Payroll cost allocation and data-source lookup | Official tenant MCP: `feishu_tenant` | Verified, read-only | Fixed 5-tool Payroll allowlist only; do not query employee payroll details without an explicit, narrowly scoped request. |
| Bot message sending | Official API route | Verified once, guarded | Only after explicit instruction; test delivery only to Craig. |
| One exact employee private message | Local MCP: `feishu_local.feishu_send_direct_message` | Available, confirmation-gated | Resolves one exact active app-visible employee name, then sends one approved 1–2,000-character plain-text message as Craig AI 助理. Requires `confirmation: "send_direct_message"`; no fuzzy match, groups, multiple recipients, cards, files, replies, forwards, edits, or deletes. Results and errors contain no person or message IDs. |
| One exact employee private message as Craig | Local MCP: `feishu_local.feishu_send_user_direct_message` | Verified, confirmation-gated | Resolves one exact active app-visible employee name, then sends one approved 1–2,000-character plain-text message through Craig's user authorization. Requires `confirmation: "send_user_direct_message"` plus `im:message` and `im:message.send_as_user`; no fuzzy match, groups, multiple recipients, cards, files, replies, forwards, edits, or deletes. This path does not depend on Craig AI 助理's availability range. A 2026-08-14 installed-MCP verification successfully sent the authorized test message. Results and errors contain no person or message IDs. |
| Bot event receipt and @mention reply | Feishu developer console + durable event endpoint | Pending | Requires event subscription/configuration and event-log proof. |
| Semantic people lookup | Core HR employee search via `feishu_tenant` | Available, guarded | Search only for the person and HR purpose Craig specifies; do not return sensitive fields by default. |
| Remote MCP / server hosting | Deliberately not configured | Deferred | Local Codex is the intended execution environment until workflows stabilize. |

## Normal routing

- “What did I just send / which mail needs attention?” → mail-analysis companion skill.
- “Which archived/custom-folder mail is this?” → discover folders first, then query the selected folder with a narrow time, sender, or subject filter.
- “Create this reviewed email as a draft in my mailbox, with these local files attached.” → display the final email and every attachment filename/size, obtain explicit creation approval, then use `feishu_local.feishu_create_email_draft` with `attachment_paths`. Never use it to send.
- “What are people discussing in this group?” → use official group discovery, then `feishu_local.feishu_bot_group_history` when the bot is a member.
- “Find our document/wiki decision on X.” → document search or wiki search, then selected read.
- “How is Craig AI 助理 connected?” → `feishu_local.feishu_bot_diagnostics`.
- “Build or change a tracker.” → Bitable design proposal first, then explicit write approval.
- “Read messages from this known chat.” → `feishu_local.feishu_v2_chat_messages` with the specific chat ID and a small page size.
- “Find a slot / create a meeting / update a calendar entry.” → use the fixed official Calendar tools; display exact event payload and obtain confirmation before any mutation or invite.
- “Create, assign, change, or remind me about a task.” → use the fixed official Task tools; display exact task payload and obtain confirmation before any mutation.
- “What approvals need attention?” → use the official Approval read tools; summarize only and never approve or comment.
- “Read this Minutes link/transcript.” → extract the exact token from the user-provided link; use `minutes.v1.minute.get` or `feishu_local.feishu_minute_transcript` without discovery or media export.
- “Show the active company directory.” → use `feishu_local.feishu_company_directory`; return only name, work email, `user_id`, `open_id`, and `employment_id`, then use its opaque page token only if Craig asks for the next page.
- “Send this exact private message to this employee.” → show the exact name and full text, obtain explicit action-time approval, then use `feishu_local.feishu_send_direct_message` with `confirmation: "send_direct_message"`.
- “Send this exact private message **as me**.” → show the exact name and full text, obtain explicit action-time approval, then use `feishu_local.feishu_send_user_direct_message` with `confirmation: "send_user_direct_message"`. If Feishu rejects the user token, reauthorize the user scopes `im:message` and `im:message.send_as_user`; do not fall back to the bot.
- “Show the org / find an employee / inspect a payroll data source.” → `feishu_tenant`; begin with the smallest read-only query.

## Not yet a reason to build a remote MCP

Keep the bundle local while its high-frequency workflows are being learned. Promote only a stable, narrowly scoped workflow after at least three real uses with consistent inputs/outputs and a clear permission model. Do not expose generic credentials or generic raw Feishu API access over a server.
