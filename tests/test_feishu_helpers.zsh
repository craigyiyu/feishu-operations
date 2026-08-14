#!/bin/zsh
set -euo pipefail

plugin_root="${0:A:h:h}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || {
    print -u2 -- "expected output to contain: $needle"
    print -u2 -- "$haystack"
    exit 1
  }
}

test_history_rejects_unsafe_page_size() {
  local output exit_code
  set +e
  output="$("$plugin_root/scripts/fetch-feishu-chat-history" --chat-id oc_test --page-size 1 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected invalid page size to fail'; exit 1; }
  assert_contains "$output" 'between 10 and 50'
}

test_history_requires_chat_id() {
  local output exit_code
  set +e
  output="$("$plugin_root/scripts/fetch-feishu-chat-history" 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected missing chat id to fail'; exit 1; }
  assert_contains "$output" 'Usage:'
}

test_history_rejects_unknown_argument() {
  local output exit_code
  set +e
  output="$("$plugin_root/scripts/fetch-feishu-chat-history" --chat-id oc_test --unexpected 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected unknown argument to fail'; exit 1; }
  assert_contains "$output" 'Unknown argument'
}

test_diagnostics_is_summary_only() {
  local output exit_code
  set +e
  output="$("$plugin_root/scripts/feishu-bot-diagnostics" --unexpected 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected unknown diagnostic argument to fail'; exit 1; }
  assert_contains "$output" 'Unknown argument'
}

test_v2_messages_rejects_unsafe_page_size() {
  local output exit_code
  set +e
  output="$("$plugin_root/scripts/fetch-feishu-v2-chat-messages" --chat-id oc_test --page-size 501 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected invalid page size to fail'; exit 1; }
  assert_contains "$output" 'between 1 and 500'
}

test_v2_messages_require_a_time_window_for_large_reads() {
  local output exit_code
  set +e
  output="$("$plugin_root/scripts/fetch-feishu-v2-chat-messages" --chat-id oc_test --page-size 51 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected a large read without a time window to fail'; exit 1; }
  assert_contains "$output" 'start_time and end_time are required when page_size exceeds 50'
}

test_v2_messages_rejects_reverse_time_window() {
  local output exit_code
  set +e
  output="$("$plugin_root/scripts/fetch-feishu-v2-chat-messages" --chat-id oc_test --start-time 200 --end-time 100 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected reverse time window to fail'; exit 1; }
  assert_contains "$output" 'end_time must be greater than or equal to start_time'
}

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

test_email_draft_rejects_invalid_recipient() {
  local script="$plugin_root/scripts/create-feishu-email-draft"
  local output exit_code
  set +e
  output="$("$script" --to-json '["not-an-email"]' --subject 'Test draft' --body-plain-text 'Body' 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected invalid draft recipient to fail'; exit 1; }
  assert_contains "$output" 'to must contain at least one valid email address'
}

test_email_draft_rejects_empty_attachment_list() {
  local script="$plugin_root/scripts/create-feishu-email-draft"
  local output exit_code
  set +e
  output="$("$script" --to-json '["craig.yu@hypervelocity.hk"]' --subject 'Test draft' --body-plain-text 'Body' --attachment-paths-json '[]' 2>&1)"
  exit_code=$?
  set -e
  [[ $exit_code -ne 0 ]] || { print -u2 'expected empty attachment list to fail'; exit 1; }
  assert_contains "$output" 'attachment_paths must contain between 1 and 10 absolute file paths'
}


test_history_rejects_unsafe_page_size
test_history_requires_chat_id
test_history_rejects_unknown_argument
test_diagnostics_is_summary_only
test_v2_messages_rejects_unsafe_page_size
test_v2_messages_require_a_time_window_for_large_reads
test_v2_messages_rejects_reverse_time_window
test_mail_folder_mode_rejects_message_flags
test_email_draft_rejects_invalid_recipient
test_email_draft_rejects_empty_attachment_list
print 'PASS: Feishu helper argument guards'
