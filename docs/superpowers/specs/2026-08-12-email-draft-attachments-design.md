# Feishu Email Draft Attachments Design

## Goal

Allow local Codex to create one unsent Feishu Mail draft that includes each explicitly approved local attachment, without silently omitting files or expanding into general file-upload or email-send capability.

## Scope

- Extend `feishu_create_email_draft` with optional `attachment_paths`, an array of one to ten explicit absolute local file paths.
- Read only the named regular files; reject directories, symbolic links, missing files, unreadable files, empty arrays, duplicate paths, and any aggregate source attachment size above 20 MiB before requesting a Feishu token.
- Build a `multipart/mixed` RFC 822 message that contains the text body plus every approved attachment and create the draft through the existing official `POST /mail/v1/user_mailboxes/{mailbox}/drafts` endpoint.
- Return only `status`, `draft_id`, and `attachment_count`; never echo file content or upload data.

## Non-goals

- No directory traversal, automatic attachment discovery, remote URL download, cloud-file lookup, generic material upload, attachment editing, updating a draft, deleting a draft, or sending a draft.
- No actual live-mailbox test draft; protocol tests use an in-memory HTTP server and temporary local files.

## Confirmation Boundary

Before a call, Codex must show Craig the complete recipients, subject, body, and each attachment's basename and byte size. Craig must explicitly approve that exact set. `confirmation: "create_draft"` remains mandatory.

## Encoding

The helper uses Lark-compatible `multipart/mixed` MIME. It emits an explicit `From` header for the selected mailbox and LF-only line endings (never CRLF), because the Lark drafts API requires this compatibility profile. Text and attachments are base64 transfer-encoded; filenames are emitted using RFC 5987 `filename*` encoding. The entire RFC 822 message is base64url-encoded into the official API's `raw` field. The helper adds no other Feishu endpoint.

## Tests

- A mock-server test proves the request hits only token acquisition and `/drafts`, has a multipart body, includes each attachment bytes and names, reports attachment count, and never calls `/send`.
- Guard tests prove missing, symbolic-link, duplicate, and over-limit paths fail before credentials or network access.
- Existing no-attachment draft behavior remains available and unchanged.
