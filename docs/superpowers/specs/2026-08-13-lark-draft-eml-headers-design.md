# Lark Draft EML Header Compatibility Design

## Goal

Make `feishu_create_email_draft` create an unsent Feishu Mail draft using a Lark-compatible raw EML message.

## Scope

- Add RFC 2822 `Date` and a unique `Message-ID` header to every generated EML.
- Keep existing LF-only line endings, base64url transport encoding, user-token authorization, and draft-only behavior.
- Add an automated regression test that inspects the generated EML before it is posted to a local fake server.

## Non-goals

- No send endpoint, no draft modification, and no changes to the reviewed email content.
- No change to mailbox scopes or credentials.

## Verification

The helper test must first fail because the two headers are absent, then pass after the minimal implementation. The full local MCP and helper test suite must pass before the plugin is cache-busted and reinstalled. One approved, unsent draft-create call will then verify the official API response.
