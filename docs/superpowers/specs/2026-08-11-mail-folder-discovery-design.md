# Read-Only Feishu Mail Folder Discovery Design

## Goal

Enable the mail-analysis workflow to discover the current user's real Feishu Mail folders, select an Archive folder by returned metadata, and then pass that exact folder ID to the existing read-only mail retrieval flow.

## Scope

- Add an explicit `--list-folders` mode to the companion `fetch_feishu_mail.py` script.
- Use the official Feishu Mail folder-list endpoint with the existing app credentials.
- Return only folder metadata needed for selection: ID, name, folder type, parent folder ID, and unread counts.
- Keep the existing message-fetch mode unchanged except that `--folder` may receive a discovered numeric folder ID.
- Require `mail:user_mailbox.folder:read`, in addition to the existing mail-message read scopes.

## Non-goals

- No folder creation, rename, move, archive, delete, mark-read, label, or other mailbox mutation.
- No mail-body, attachment, address, or message-subject retrieval in `--list-folders` mode.
- No automatic selection based solely on the literal name `ARCHIVE`; selection is made after inspecting returned folder metadata.
- No secrets, access tokens, mailbox contents, or folder IDs written to workspace documentation.

## Interface

```text
fetch_feishu_mail.py --mailbox <mailbox> --list-folders --out-dir <temporary-directory>
```

`--list-folders` is mutually exclusive with message-specific options: `--folder`, `--since-hours`, sender/subject/keyword filters, `--include-body`, `--download-attachments`, and `--list-only`.

The command writes a temporary `folders.json` file and prints a scrubbed summary containing the number of folders and their names/types only. The caller may inspect the temporary file in memory, choose the Archive folder, perform the next read with its exact ID, and then remove the temporary directory.

## Data Flow

1. Load existing protected app credentials without printing them.
2. Obtain a tenant access token using the existing helper.
3. Call the official folder-list endpoint for the supplied mailbox.
4. Validate response shape and normalize only permitted folder metadata.
5. Persist the normalized result only in the caller's task-specific temporary directory.
6. Use the selected folder ID in a separate, explicit message-read invocation.

## Error Handling

- Missing folder-read scope or unavailable folder endpoint: return a scrubbed error stage of `folder_list` and stop.
- Empty folder list: report the mailbox was reachable but no folders were returned; do not fall back to guessed IDs.
- Invalid or conflicting CLI arguments: reject before requesting an access token.
- Never fall back to a third-party connector or a raw ad-hoc API call.

## Tests

- `--list-folders` requires `--mailbox` and `--out-dir`.
- `--list-folders` rejects every message-read flag listed above.
- Folder-result normalizer preserves only the allowlisted metadata fields.
- A simulated permission-denied response is scrubbed and reported as `folder_list`.
- Existing INBOX message-retrieval tests remain unchanged and pass.

## Verification

After implementation, run the helper test suite, then execute one scoped `--list-folders` read against Craig's mailbox. Confirm that no message endpoint is called, select the identified Archive folder in memory, and only then run the separately authorized July sender-scoped retrieval.
