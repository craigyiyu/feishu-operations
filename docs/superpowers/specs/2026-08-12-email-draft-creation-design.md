# Official Feishu Mail Draft Creation Design

## Goal

Allow local Codex to create an unsent Feishu Mail draft in Craig's mailbox after Craig has explicitly approved that exact email.

## Scope

- Add one local MCP tool, `feishu_create_email_draft`.
- Call only the official Feishu Mail `POST /mail/v1/user_mailboxes/{mailbox}/drafts` endpoint.
- Accept one mailbox, explicit `to` recipients, optional `cc` and `bcc` recipients, an exact subject, and an exact plain-text body.
- Require a runtime confirmation token with the exact literal value `create_draft`; the calling Codex workflow must first show Craig the complete recipient list, subject, and body, then obtain his action-time approval.
- Return only a scrubbed success summary: that one draft was created, together with the returned draft ID. Do not echo the body or credentials.
- Verify response success without sending, updating, deleting, moving, or reading unrelated mail.

## Non-goals

- No send, schedule-send, update-draft, delete-draft, reply, forward, attachment, contact, folder, or mail-status operations.
- No broad mail API access and no community connector.
- No automatic test draft in Craig's mailbox. Unit and protocol tests use a test helper that does not call Feishu.

## Authentication and Permission

The helper uses Craig's refreshed Feishu `user_access_token`, stored in macOS Keychain by the local OAuth flow, because a personal mailbox operation must act on behalf of the authorized user. Protected application credentials are used only to refresh that user token when necessary. The existing granted `mail:user_mailbox.message:modify` scope covers managing drafts; `mail:user_mailbox.message:send` is neither requested nor used. If Feishu rejects the operation because the current app lacks the necessary mailbox data scope, the helper returns a scrubbed authorization failure and stops.

## Interfaces

```text
feishu_create_email_draft({
  mailbox?: string,
  to: string[],
  cc?: string[],
  bcc?: string[],
  subject: string,
  body_plain_text: string,
  confirmation: "create_draft"
})
```

The mailbox defaults to Craig's existing Feishu mailbox. Recipient arrays must contain non-empty email addresses, subject and body must be non-empty strings, and unexpected properties are rejected. The helper encodes the plain-text body with base64url as required by the official API.

## Data Flow

1. Codex drafts and shows the full message; Craig explicitly authorizes creation.
2. The local MCP validates the exact schema and confirmation value.
3. A reviewed helper retrieves credentials from macOS Keychain, obtains a tenant token, and creates the draft through the official endpoint.
4. The local MCP returns the minimal success/failure result. A draft remains unsent in Craig's Feishu mailbox.

## Error Handling and Tests

- Reject invalid recipients, empty content, unrecognized fields, or missing confirmation before any network call.
- Scrub API errors and never emit tokens, raw body content, or the full response.
- Test tool discovery, confirmation enforcement, payload encoding, success-result scrubbing, and authorization/error scrubbing with local fake transport only.
- Preserve existing local-MCP and mail-analysis test suites.
