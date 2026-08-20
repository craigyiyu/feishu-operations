# Feishu Mail Tailscale Route Design

**Date:** 2026-08-20  
**Status:** Craig approved implementation.

## Goal

Replace the Feishu mail companion's public-SSH transport with a Tailscale-only route to the existing Hermes VPS, so public TCP port 22 stays closed.

## Design

Add executable bundle helpers, `scripts/provision-feishu-mail-credentials-via-tailscale` and `scripts/fetch-feishu-mail-via-tailscale`. The provisioner sends only the Feishu app ID and secret from macOS Keychain to `/home/hermes/.hermes/feishu-mail.env` with mode `600`, preserving Hermes’s existing `.env`. The reader then sends the existing read-only companion Python fetcher to the VPS through:

```text
tailscale ssh ubuntu@bobvps sudo -n -u hermes env HOME=/home/hermes python3 -s - --env-path /home/hermes/.hermes/feishu-mail.env <mail arguments>
```

The helper defaults to `ubuntu@bobvps` and allows a validated `FEISHU_MAIL_VPS_TARGET` override for a future MagicDNS rename. It never accepts a public IP as the default, never supplies an SSH private-key path, and does not fall back to public SSH. It forwards only the caller's existing mail-reader arguments and preserves the helper's read-only behaviour.

The bundle skill, setup reference, capability catalog, and the global `feishu-mail-analysis` companion will direct VPS mail calls through this helper. The official MCP is documented as the preferred path for folder/list/detail reads once the required user mail scopes are enabled; attachment file download stays on the reviewed companion route because official MCP does not support file download.

## Safety

- No firewall, Tailscale ACL, VPS service, or Feishu permission change is made.
- No app secret, OAuth token, private key, message body, attachment, or raw mail output is stored in the plugin or returned by the route verifier. The provisioner streams the two app credentials through the encrypted Tailscale connection and never includes them in command arguments.
- The new helper rejects unsafe Tailscale targets before starting a process.
- The existing public IPv4 address and `-i ~/.ssh/tencent_vps` are forbidden in the bundle's runtime mail route.

## Verification

1. A shell test uses a fake `tailscale` executable to prove the helper calls `tailscale ssh`, the MagicDNS target, the fixed unprivileged Hermes command, and never adds a private-key argument.
2. The same test proves a malformed target is rejected before any command runs.
3. A live read-only `--list-only` probe through the new wrapper writes private metadata only into a task-specific temporary directory; its tool output is suppressed and only the exit status is reported.
4. Full bundle regression, source/cache comparison, and a GitHub backup push complete after installation.
