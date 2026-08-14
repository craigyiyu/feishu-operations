# Feishu Mail Folder Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strictly read-only `--list-folders` mode to the Feishu Mail companion script so Archive is selected from returned metadata rather than guessed.

**Architecture:** Extend the existing standalone mail script at `/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py`. A folder-only branch validates arguments before acquiring a token, invokes only `GET /mail/v1/user_mailboxes/{mailbox}/folders`, normalizes an allowlist of folder metadata, and writes `folders.json` to the caller-provided temporary directory. Existing message retrieval remains a separate invocation and receives the chosen numeric folder ID through `--folder`.

**Tech Stack:** Python 3 standard library (`argparse`, `json`, `urllib`, `unittest`, `unittest.mock`); official Feishu Mail API; zsh helper-test runner.

## Global Constraints

- The only network request added is the official read-only Feishu Mail folder-list endpoint.
- `--list-folders` must never call a message list/detail endpoint and must never write to Feishu.
- Folder output may contain only `id`, `name`, `folder_type`, `parent_folder_id`, `unread_message_count`, and `unread_thread_count`.
- Do not log secrets, tokens, raw error bodies, mail contents, attachment metadata, chat IDs, or person IDs.
- `--list-folders` is incompatible with `--folder`, `--since-hours`, `--max-pages`, `--page-size`, sender/subject/keyword filters, `--include-body`, `--download-attachments`, and `--list-only` when those flags are explicitly supplied.
- The plugin directory is not a Git repository; do not attempt a commit.

---

## File Structure

- Modify: `/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py` — argument parsing, folder-list request, normalization, temporary output, and scrubbed summary.
- Create: `/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/tests/test_fetch_feishu_mail.py` — standard-library unit tests for validation, normalization, and response handling.
- Modify: `/Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh` — regression check that the companion command rejects conflicting folder/message modes before credential access.

### Task 1: Define the failing folder-discovery contract

**Files:**

- Create: `/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/tests/test_fetch_feishu_mail.py`
- Modify: `/Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh`

**Interfaces:**

- Consumes: module file `/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py`.
- Produces: test expectations for `normalize_folder`, `list_folders`, and CLI mode validation.

- [ ] **Step 1: Write failing Python tests for metadata allowlisting and the official endpoint**

```python
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "fetch_feishu_mail.py"
SPEC = importlib.util.spec_from_file_location("fetch_feishu_mail", SCRIPT)
mail = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(mail)


class FolderDiscoveryTests(unittest.TestCase):
    def test_normalize_folder_keeps_only_allowed_metadata(self):
        folder = mail.normalize_folder({
            "id": "7620095646711680541",
            "name": "Archive",
            "folder_type": 1,
            "parent_folder_id": "0",
            "unread_message_count": 2,
            "unread_thread_count": 1,
            "unexpected": "must-not-escape",
        })
        self.assertEqual(folder, {
            "id": "7620095646711680541",
            "name": "Archive",
            "folder_type": 1,
            "parent_folder_id": "0",
            "unread_message_count": 2,
            "unread_thread_count": 1,
        })

    @patch.object(mail, "request_json")
    def test_list_folders_uses_only_folder_endpoint(self, request_json):
        request_json.return_value = {"code": 0, "data": {"items": [{"id": "7", "name": "Archive"}]}}
        folders = mail.list_folders("me@example.com", "token")
        self.assertEqual(folders, [{"id": "7", "name": "Archive"}])
        url = request_json.call_args.args[1]
        self.assertIn("/mail/v1/user_mailboxes/me%40example.com/folders", url)
        self.assertNotIn("/messages", url)

    @patch.object(mail, "request_json")
    def test_list_folders_reports_scrubbed_permission_error(self, request_json):
        request_json.return_value = {"code": 1230002, "msg": "permission denied", "token": "secret"}
        with self.assertRaisesRegex(RuntimeError, "folder_list") as context:
            mail.list_folders("me@example.com", "token")
        self.assertNotIn("secret", str(context.exception))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Add the CLI regression case to the zsh helper suite**

```zsh
test_mail_folder_mode_rejects_message_flags() {
  local script="/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py"
  local output exit_code
  set +e
  output="$(python3 "$script" --list-folders --folder INBOX --out-dir "$tmpdir" 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected conflicting folder mode to fail'; exit 1; }
  assert_contains "$output" '--list-folders cannot be combined with --folder'
}
```

Add `test_mail_folder_mode_rejects_message_flags` immediately before the final `print` and invoke it with the other test functions.

- [ ] **Step 3: Run the new tests to prove they fail before implementation**

Run:

```bash
python3 -m unittest /Users/craigyu/.codex/skills/personal/feishu-mail-analysis/tests/test_fetch_feishu_mail.py -v
zsh /Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh
```

Expected: Python fails because `normalize_folder` and `list_folders` do not exist; zsh fails because `--list-folders` is unknown.

### Task 2: Implement isolated, read-only folder discovery

**Files:**

- Modify: `/Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py`

**Interfaces:**

- Consumes: protected credentials from `load_env`, existing `tenant_token`, and existing `request_json`.
- Produces: `normalize_folder(folder: dict) -> dict`, `list_folders(mailbox: str, token: str) -> list[dict]`, and `folders.json` in the supplied output directory.

- [ ] **Step 1: Add the folder metadata allowlist and normalizer below `scrub`**

```python
FOLDER_FIELDS = (
    "id",
    "name",
    "folder_type",
    "parent_folder_id",
    "unread_message_count",
    "unread_thread_count",
)


def normalize_folder(folder: object) -> dict:
    if not isinstance(folder, dict):
        return {}
    return {key: folder[key] for key in FOLDER_FIELDS if key in folder}
```

- [ ] **Step 2: Add the folder-list request helper below `normalize_folder`**

```python
def list_folders(mailbox: str, token: str) -> list[dict]:
    mailbox_enc = urllib.parse.quote(mailbox, safe="")
    url = f"{FEISHU_BASE}/mail/v1/user_mailboxes/{mailbox_enc}/folders"
    payload = request_json("GET", url, token=token)
    if payload.get("code") != 0:
        raise RuntimeError(json.dumps({"stage": "folder_list", "response": scrub(payload)}, ensure_ascii=False))
    data = payload.get("data") or {}
    raw_folders = data.get("items") or data.get("folders") or data.get("folder_list") or []
    return [normalized for folder in raw_folders if (normalized := normalize_folder(folder))]
```

- [ ] **Step 3: Add explicit mode detection before `parser.parse_args()`**

```python
raw_argv = sys.argv[1:]
parser.add_argument("--list-folders", action="store_true", help="List mailbox folder metadata only")
args = parser.parse_args()

message_flags = {
    "--folder", "--since-hours", "--max-pages", "--page-size", "--sender-regex",
    "--subject-regex", "--keyword", "--include-body", "--download-attachments", "--list-only",
}
if args.list_folders:
    conflicting = next((flag for flag in raw_argv if flag.split("=", 1)[0] in message_flags), None)
    if conflicting:
        raise SystemExit(f"--list-folders cannot be combined with {conflicting.split('=', 1)[0]}")
```

Keep the current default values for message mode; the `raw_argv` check distinguishes defaults from explicit incompatible options.

- [ ] **Step 4: Add the early folder-only branch after `out_dir.mkdir()` and before message-mode cutoff/filter setup**

```python
token = tenant_token(load_env(args.env_path))
if args.list_folders:
    try:
        folders = list_folders(args.mailbox, token)
    except RuntimeError as exc:
        output = {"mailbox": args.mailbox, "folder_count": 0, "folders": [], "errors": [json.loads(str(exc))]}
    else:
        output = {"mailbox": args.mailbox, "folder_count": len(folders), "folders": folders, "errors": []}
    (out_dir / "folders.json").write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(json.dumps(scrub({
        "mailbox": output["mailbox"],
        "folder_count": output["folder_count"],
        "folders": [{key: item.get(key) for key in ("name", "folder_type", "parent_folder_id")} for item in output["folders"]],
        "errors": output["errors"],
    }), ensure_ascii=False, indent=2))
    print(f"results={out_dir / 'folders.json'}")
    return 0 if not output["errors"] else 1
```

Do not create `attachments_dir` in folder-list mode. Move its creation below this branch.

- [ ] **Step 5: Run tests and static compilation**

Run:

```bash
python3 -m unittest /Users/craigyu/.codex/skills/personal/feishu-mail-analysis/tests/test_fetch_feishu_mail.py -v
zsh /Users/craigyu/plugins/feishu-operations/tests/test_feishu_helpers.zsh
python3 -m py_compile /Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py
```

Expected: all unit and helper tests pass; compilation exits 0.

### Task 3: Verify the live, read-only workflow and retrieve the Archive email scope

**Files:**

- No repository files changed.

**Interfaces:**

- Consumes: `--list-folders` output and the selected Archive folder ID.
- Produces: a temporary, sender-scoped July mail result; no mailbox mutation.

- [ ] **Step 1: Run folder discovery with protected Keychain credentials**

```bash
mail_probe_dir="$(mktemp -d /tmp/feishu-mail-folders.XXXXXX)"
env FEISHU_APP_ID="$(security find-generic-password -s codex-feishu-app-id -w)" \
    FEISHU_APP_SECRET="$(security find-generic-password -s codex-feishu-app-secret -w)" \
    python3 /Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py \
    --mailbox craig.yu@hypervelocity.hk --list-folders --out-dir "$mail_probe_dir"
```

Expected: folder metadata only; no message count, message ID, subject, sender, body, or attachment output.

- [ ] **Step 2: Select the actual Archive folder from returned `name` and `folder_type` metadata**

Set the shell variable `archive_folder_id` to the exact ID selected from the current command's `folders.json` result. Keep it only in the active shell. If more than one folder could represent Archive, stop and show the candidate names/types to Craig for selection; do not guess.

- [ ] **Step 3: Run the existing message retrieval separately with the selected ID**

```bash
mail_run_dir="$(mktemp -d /tmp/feishu-mail-archive-run.XXXXXX)"
env FEISHU_APP_ID="$(security find-generic-password -s codex-feishu-app-id -w)" \
    FEISHU_APP_SECRET="$(security find-generic-password -s codex-feishu-app-secret -w)" \
    python3 /Users/craigyu/.codex/skills/personal/feishu-mail-analysis/scripts/fetch_feishu_mail.py \
    --mailbox craig.yu@hypervelocity.hk --folder "$archive_folder_id" \
    --since-hours 1002 --max-pages 100 --page-size 20 \
    --sender-regex '张超煜|Eason' --include-body --out-dir "$mail_run_dir"
```

Expected: read-only results limited to the selected folder and sender pattern. Filter the retrieved metadata to the exact calendar window 2026-07-01 through 2026-07-31 before analysis.

- [ ] **Step 4: Delete only the verified temporary result files after evidence extraction**

Run the exact-path `unlink` and `rmdir` cleanup used in the existing session for `folders.json`, `results.json`, and their now-empty temporary directories. Do not use broad recursive deletion.
