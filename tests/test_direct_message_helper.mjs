import assert from 'node:assert/strict';
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const helper = path.join(testDir, '..', 'scripts', 'send-feishu-direct-message');

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [helper, ...args], {env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({code, stdout, stderr}));
  });
}

async function fakeSecurityPath(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'feishu-direct-message-security-'));
  await writeFile(path.join(directory, 'security'), `#!/bin/sh
case "$*" in
  *codex-feishu-app-id*) printf test-app-id ;;
  *codex-feishu-app-secret*) printf test-app-secret ;;
  *) exit 1 ;;
esac
`);
  await chmod(path.join(directory, 'security'), 0o755);
  t.after(() => rm(directory, {recursive: true, force: true}));
  return directory;
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : null;
}

test('sends one exact approved text message to one uniquely matched employee', async (t) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push({method: request.method, pathname: url.pathname, query: [...url.searchParams.entries()], body: await readJson(request)});
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') return response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
    if (url.pathname === '/open-apis/contact/v3/scopes') return response.end(JSON.stringify({code: 0, data: {user_ids: ['user-target']}}));
    if (url.pathname === '/open-apis/contact/v3/users/batch') return response.end(JSON.stringify({code: 0, data: {items: [{user_id: 'user-target', open_id: 'open-target', name: '张超煜', email: 'target@example.com', status: {is_resigned: false}}]}}));
    if (url.pathname === '/open-apis/im/v1/messages') return response.end(JSON.stringify({code: 0, data: {message_id: 'om_not_exposed'}}));
    response.statusCode = 404;
    response.end(JSON.stringify({code: 404}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run(['--recipient-name', '张超煜', '--text', '你好', '--confirmation', 'send_direct_message'], {
    ...process.env,
    PATH: `${securityPath}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), {recipient_name: '张超煜', sent: true});
  const messageRequest = requests.find((request) => request.pathname === '/open-apis/im/v1/messages');
  assert.deepEqual(messageRequest, {
    method: 'POST',
    pathname: '/open-apis/im/v1/messages',
    query: [['receive_id_type', 'open_id']],
    body: {receive_id: 'open-target', msg_type: 'text', content: JSON.stringify({text: '你好'})},
  });
  assert.equal(requests.filter((request) => request.pathname === '/open-apis/im/v1/messages').length, 1);
});

test('rejects missing confirmation and unsafe text before reading credentials', async () => {
  for (const args of [
    ['--recipient-name', '张超煜', '--text', '你好'],
    ['--recipient-name', '张超煜', '--text', 'x'.repeat(2001), '--confirmation', 'send_direct_message'],
  ]) {
    const result = await run(args, process.env);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /confirmation must equal send_direct_message|text must contain between 1 and 2000 characters/);
  }
});

test('does not send when exact name lookup is ambiguous', async (t) => {
  let sent = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    await readJson(request);
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') return response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
    if (url.pathname === '/open-apis/contact/v3/scopes') return response.end(JSON.stringify({code: 0, data: {user_ids: ['first', 'second']}}));
    if (url.pathname === '/open-apis/contact/v3/users/batch') return response.end(JSON.stringify({code: 0, data: {items: [
      {user_id: 'first', open_id: 'open-first', name: '张超煜', status: {is_resigned: false}},
      {user_id: 'second', open_id: 'open-second', name: '张超煜', status: {is_resigned: false}},
    ]}}));
    if (url.pathname === '/open-apis/im/v1/messages') sent = true;
    response.statusCode = 404;
    response.end(JSON.stringify({code: 404}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run(['--recipient-name', '张超煜', '--text', '你好', '--confirmation', 'send_direct_message'], {...process.env, PATH: `${securityPath}:${process.env.PATH}`, LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`});

  assert.notEqual(result.code, 0);
  assert.equal(sent, false);
  assert.equal(result.stderr, 'FEISHU_DIRECT_MESSAGE_ERROR stage=recipient_resolution feishu_code=unknown http_status=unknown\n');
});

test('scrubs a rejected official send', async (t) => {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    await readJson(request);
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') return response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
    if (url.pathname === '/open-apis/contact/v3/scopes') return response.end(JSON.stringify({code: 0, data: {user_ids: ['user-target']}}));
    if (url.pathname === '/open-apis/contact/v3/users/batch') return response.end(JSON.stringify({code: 0, data: {items: [{user_id: 'user-target', open_id: 'open-target', name: '张超煜', status: {is_resigned: false}}]}}));
    if (url.pathname === '/open-apis/im/v1/messages') {
      response.statusCode = 400;
      return response.end(JSON.stringify({code: 230035, msg: 'do not disclose this backend response'}));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({code: 404}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run(['--recipient-name', '张超煜', '--text', '你好', '--confirmation', 'send_direct_message'], {...process.env, PATH: `${securityPath}:${process.env.PATH}`, LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`});

  assert.notEqual(result.code, 0);
  assert.equal(result.stderr, 'FEISHU_DIRECT_MESSAGE_ERROR stage=message_create feishu_code=230035 http_status=400\n');
});
