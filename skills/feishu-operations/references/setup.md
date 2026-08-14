# Feishu Operations Setup

## Prerequisites

Create or reuse a Feishu China self-built app in the Feishu Open Platform. Configure the OAuth redirect URI as `http://localhost:3000/callback` and request only the permissions needed for the first use case.

For mailbox work, grant the relevant Feishu Mail read scopes. For Bitable work, grant the required Bitable and Drive scopes. App permissions and user consent must both be in place for personal resources.

## Local Secrets

Store the existing app ID and app secret in macOS Keychain. Do not place them in this plugin, a Git repository, screenshots, or chat.

Run the plugin's credential helper locally. It prompts for the app secret without echoing it and saves two Keychain entries: `codex-feishu-app-id` and `codex-feishu-app-secret`.

```bash
/Users/craigyu/plugins/feishu-operations/scripts/store-feishu-credentials
```

`LARK_TOOLS` is optional and may be used to restrict the server to the exact mail and Bitable tools after the first capability check.

## User Authorization

Start the official login flow with the same Keychain credentials:

```bash
/Users/craigyu/plugins/feishu-operations/scripts/authorize-feishu
```

Complete the Feishu consent screen in the browser. The plugin's MCP server is configured to use `user_access_token` after authorization.

## Verification

In a new Codex task, first request a harmless read such as listing accessible Bitables. Do not create a table or read mailbox contents until Craig gives the precise scope.

Official references:

- https://open.feishu.cn/document/mcp_open_tools/mcp-overview?lang=zh-CN
- https://github.com/larksuite/lark-openapi-mcp
