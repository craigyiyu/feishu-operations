import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(testDir, '..', 'scripts', 'feishu-local-mcp.mjs');

async function request(method, params = {}, env = process.env) {
  const child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
  const lines = [];
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => lines.push(...chunk.split('\n').filter(Boolean)));
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2024-11-05'}})}\n`);
  child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 2, method, params})}\n`);

  for (let attempts = 0; attempts < 300; attempts += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const responseLine = lines.find((line) => JSON.parse(line).id === 2);
    if (responseLine) {
      child.kill();
      if (child.exitCode === null) await once(child, 'close');
      return JSON.parse(responseLine);
    }
    if (child.exitCode !== null) break;
  }
  child.kill();
  if (child.exitCode === null) await once(child, 'close');
  throw new Error(`local MCP server did not respond: ${stderr.trim()}`);
}

test('lists the reviewed local Feishu fallback tools, guarded email and direct-message writers, token-scoped Minutes reader, and paginated company directory', async () => {
  const response = await request('tools/list');
  const tools = response.result.tools;
  assert.deepEqual(tools.map((tool) => tool.name), [
    'feishu_bot_diagnostics',
    'feishu_bot_group_history',
    'feishu_v2_chat_messages',
    'feishu_create_email_draft',
    'feishu_minute_transcript',
    'feishu_company_directory',
    'feishu_send_direct_message',
    'feishu_send_user_direct_message',
  ]);
  assert.equal(tools[1].inputSchema.properties.page_size.minimum, 10);
  assert.equal(tools[1].inputSchema.properties.page_size.maximum, 50);
  assert.equal(tools[1].inputSchema.properties.include_content.default, false);
  assert.equal(tools[2].inputSchema.properties.page_size.minimum, 1);
  assert.equal(tools[2].inputSchema.properties.page_size.maximum, 500);
  assert.equal(tools[2].inputSchema.properties.page_size.default, 50);
  assert.equal(tools[2].inputSchema.properties.start_time.minimum, 0);
  assert.equal(tools[2].inputSchema.properties.end_time.minimum, 0);
  assert.deepEqual(tools[3].inputSchema.required, ['to', 'subject', 'body_plain_text', 'confirmation']);
  assert.equal(tools[3].inputSchema.properties.confirmation.const, 'create_draft');
  assert.equal(tools[3].inputSchema.properties.attachment_paths.minItems, 1);
  assert.equal(tools[3].inputSchema.properties.attachment_paths.maxItems, 10);
  assert.equal(tools[3].inputSchema.additionalProperties, false);
  assert.deepEqual(tools[4].inputSchema.required, ['minute_token']);
  assert.deepEqual(tools[4].inputSchema.properties.format.enum, ['txt', 'srt']);
  assert.equal(tools[4].inputSchema.additionalProperties, false);
  assert.deepEqual(tools[5].inputSchema.required, []);
  assert.equal(tools[5].inputSchema.properties.page_size.minimum, 1);
  assert.equal(tools[5].inputSchema.properties.page_size.maximum, 500);
  assert.equal(tools[5].inputSchema.properties.page_size.default, 100);
  assert.equal(tools[5].inputSchema.additionalProperties, false);
  assert.deepEqual(tools[6].inputSchema.required, ['recipient_name', 'text', 'confirmation']);
  assert.equal(tools[6].inputSchema.properties.confirmation.const, 'send_direct_message');
  assert.equal(tools[6].inputSchema.additionalProperties, false);
  assert.deepEqual(tools[7].inputSchema.required, ['recipient_name', 'text', 'confirmation']);
  assert.equal(tools[7].inputSchema.properties.confirmation.const, 'send_user_direct_message');
  assert.equal(tools[7].inputSchema.additionalProperties, false);
});

test('rejects direct-message calls without the exact confirmation or safe input shape', async () => {
  const unconfirmed = await request('tools/call', {
    name: 'feishu_send_direct_message',
    arguments: {recipient_name: '张超煜', text: '你好', confirmation: 'send'},
  });
  assert.equal(unconfirmed.result.isError, true);
  assert.match(unconfirmed.result.content[0].text, /confirmation must equal send_direct_message/);

  const oversized = await request('tools/call', {
    name: 'feishu_send_direct_message',
    arguments: {recipient_name: '张超煜', text: 'x'.repeat(2001), confirmation: 'send_direct_message'},
  });
  assert.equal(oversized.result.isError, true);
  assert.match(oversized.result.content[0].text, /text must contain between 1 and 2000 characters/);

  const unexpected = await request('tools/call', {
    name: 'feishu_send_direct_message',
    arguments: {recipient_name: '张超煜', text: '你好', confirmation: 'send_direct_message', chat_id: 'oc_not_allowed'},
  });
  assert.equal(unexpected.result.isError, true);
  assert.equal(unexpected.result.content[0].text, 'Unsupported argument: chat_id');
});

test('rejects user-identity direct-message calls without the exact confirmation or safe input shape', async () => {
  const unconfirmed = await request('tools/call', {
    name: 'feishu_send_user_direct_message',
    arguments: {recipient_name: '张超煜', text: '你好', confirmation: 'send'},
  });
  assert.equal(unconfirmed.result.isError, true);
  assert.match(unconfirmed.result.content[0].text, /confirmation must equal send_user_direct_message/);

  const oversized = await request('tools/call', {
    name: 'feishu_send_user_direct_message',
    arguments: {recipient_name: '张超煜', text: 'x'.repeat(2001), confirmation: 'send_user_direct_message'},
  });
  assert.equal(oversized.result.isError, true);
  assert.match(oversized.result.content[0].text, /text must contain between 1 and 2000 characters/);

  const unexpected = await request('tools/call', {
    name: 'feishu_send_user_direct_message',
    arguments: {recipient_name: '张超煜', text: '你好', confirmation: 'send_user_direct_message', chat_id: 'oc_not_allowed'},
  });
  assert.equal(unexpected.result.isError, true);
  assert.equal(unexpected.result.content[0].text, 'Unsupported argument: chat_id');
});

test('rejects unbounded or caller-selected company-directory inputs before invoking the helper', async () => {
  const oversized = await request('tools/call', {
    name: 'feishu_company_directory',
    arguments: {page_size: 501},
  });
  assert.equal(oversized.result.isError, true);
  assert.equal(oversized.result.content[0].text, 'page_size must be an integer between 1 and 500.');

  const extraFields = await request('tools/call', {
    name: 'feishu_company_directory',
    arguments: {fields: ['phone']},
  });
  assert.equal(extraFields.result.isError, true);
  assert.equal(extraFields.result.content[0].text, 'Unsupported argument: fields');
});

test('rejects a malformed Minutes token before invoking the transcript helper', async () => {
  const response = await request('tools/call', {
    name: 'feishu_minute_transcript',
    arguments: {minute_token: 'invalid'},
  });
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /minute_token must be a 24-character/);
});

test('rejects an unknown local MCP tool without invoking a helper', async () => {
  const response = await request('tools/call', {name: 'send_message', arguments: {}});
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /Unknown local Feishu tool/);
});

test('rejects a v2 chat-message request above the bounded 500-message maximum', async () => {
  const response = await request('tools/call', {
    name: 'feishu_v2_chat_messages',
    arguments: {chat_id: 'oc_test', page_size: 501},
  });
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /page_size must be an integer between 1 and 500/);
});

test('requires a time window for v2 chat-message reads above 50 messages', async () => {
  const response = await request('tools/call', {
    name: 'feishu_v2_chat_messages',
    arguments: {chat_id: 'oc_test', page_size: 51},
  });
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /start_time and end_time are required when page_size exceeds 50/);
});

test('rejects email-draft creation without the exact create_draft confirmation', async () => {
  const response = await request('tools/call', {
    name: 'feishu_create_email_draft',
    arguments: {
      to: ['craig.yu@hypervelocity.hk'],
      subject: 'Test draft',
      body_plain_text: 'This must remain unsent.',
      confirmation: 'send',
    },
  });
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /confirmation must equal create_draft/);
});

test('rejects an empty attachment list before invoking email-draft creation', async () => {
  const response = await request('tools/call', {
    name: 'feishu_create_email_draft',
    arguments: {
      to: ['craig.yu@hypervelocity.hk'],
      subject: 'Test draft',
      body_plain_text: 'This must remain unsent.',
      attachment_paths: [],
      confirmation: 'create_draft',
    },
  });
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /attachment_paths must be an array containing 1 to 10 absolute file paths/);
});

test('preserves only the scrubbed Feishu draft failure details from the helper', async (t) => {
  const {mkdtemp, writeFile, chmod} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {createServer} = await import('node:http');
  const temp = await mkdtemp(path.join(tmpdir(), 'feishu-local-mcp-error-'));
  await writeFile(path.join(temp, 'security'), `#!/bin/sh
case "$*" in
  *codex-feishu-v2-token-expiry*) printf 9999999999999 ;;
  *codex-feishu-v2-user-access-token*) printf test-user-token ;;
  *) printf test-secret ;;
esac
`);
  await chmod(path.join(temp, 'security'), 0o755);
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = 400;
    response.end(JSON.stringify({code: 15180002, msg: 'raw backend secret'}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const response = await request('tools/call', {
    name: 'feishu_create_email_draft',
    arguments: {
      to: ['recipient@example.com'],
      subject: 'Failure probe',
      body_plain_text: 'Do not expose this body.',
      confirmation: 'create_draft',
    },
  }, {
    ...process.env,
    PATH: `${temp}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });
  assert.equal(response.result.isError, true);
  assert.equal(response.result.content[0].text, 'FEISHU_DRAFT_ERROR stage=draft_create feishu_code=15180002 http_status=400');
});
