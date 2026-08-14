import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import test from 'node:test';

const helperPath = '/Users/craigyu/plugins/feishu-operations/scripts/create-feishu-email-draft';

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({code, stdout, stderr}));
  });
}

async function writeUserTokenSecurityMock(securityPath) {
  await writeFile(securityPath, `#!/bin/sh
case "$*" in
  *codex-feishu-v2-token-expiry*) printf 9999999999999 ;;
  *codex-feishu-v2-user-access-token*) printf test-user-token ;;
  *) printf test-secret ;;
esac
`);
  await chmod(securityPath, 0o755);
}

test('creates an unsent draft through only the official draft endpoint', async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), 'feishu-draft-test-'));
  const securityPath = path.join(temp, 'security');
  const attachmentOne = path.join(temp, 'proposal.txt');
  const attachmentTwo = path.join(temp, 'notes.csv');
  await writeUserTokenSecurityMock(securityPath);
  await writeFile(attachmentOne, 'proposal bytes');
  await writeFile(attachmentTwo, 'id,owner\n1,Craig\n');
  await chmod(securityPath, 0o755);

  const requests = [];
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({method: request.method, url: request.url, authorization: request.headers.authorization, body});
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/open-apis/mail/v1/user_mailboxes/craig.yu%40hypervelocity.hk/drafts') {
        response.end(JSON.stringify({code: 0, data: {draft: {id: 'draft_test_1'}}}));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({code: 404}));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const result = await run(helperPath, [
    '--to-json', '["recipient@example.com"]',
    '--cc-json', '["copy@example.com"]',
    '--bcc-json', '["blind-copy@example.com"]',
    '--subject', '中文 Subject',
    '--body-plain-text', 'Draft body',
    '--attachment-paths-json', JSON.stringify([attachmentOne, attachmentTwo]),
  ], {
    ...process.env,
    PATH: `${temp}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${port}`,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {status: 'draft_created', draft_id: 'draft_test_1', attachment_count: 2});
  assert.deepEqual(requests.map(({method, url}) => ({method, url})), [
    {method: 'POST', url: '/open-apis/mail/v1/user_mailboxes/craig.yu%40hypervelocity.hk/drafts'},
  ]);
  assert.equal(requests[0].authorization, 'Bearer test-user-token');
  const raw = JSON.parse(requests[0].body).raw;
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /^From: craig\.yu@hypervelocity\.hk$/m);
  assert.match(mime, /^To: recipient@example\.com$/m);
  assert.match(mime, /^Cc: copy@example\.com$/m);
  assert.match(mime, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(mime, /^Date: [A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000$/m);
  assert.match(mime, /^Message-ID: <\d+\.[a-f0-9]+@larksuite-cli>$/m);
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /filename\*=UTF-8''proposal.txt/);
  assert.match(mime, /filename\*=UTF-8''notes.csv/);
  assert.match(mime, /cHJvcG9zYWwgYnl0ZXM=/);
  assert.match(mime, /aWQsb3duZXIKMSxDcmFpZwo=/);
  assert.match(mime, /^Bcc: blind-copy@example\.com$/m);
  assert.doesNotMatch(mime, /\r/);
  assert.equal(requests.some(({url}) => url.includes('/send')), false);
});

test('returns a scrubbed Feishu code and HTTP status when draft creation is rejected', async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), 'feishu-draft-error-test-'));
  const securityPath = path.join(temp, 'security');
  await writeUserTokenSecurityMock(securityPath);
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json');
      response.statusCode = 403;
      response.end(JSON.stringify({code: 15180002, msg: 'mailbox permission denied; secret body must never appear'}));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const result = await run(helperPath, [
    '--to-json', '["recipient@example.com"]',
    '--subject', 'Rejected draft',
    '--body-plain-text', 'Body must not appear in the error.',
  ], {
    ...process.env,
    PATH: `${temp}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'FEISHU_DRAFT_ERROR stage=draft_create feishu_code=15180002 http_status=403');
  assert.doesNotMatch(result.stderr, /permission denied|secret body|Body must not appear/);
});

test('reports response validation when Feishu returns success without a draft identifier', async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), 'feishu-draft-shape-test-'));
  const securityPath = path.join(temp, 'security');
  await writeUserTokenSecurityMock(securityPath);
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({code: 0, data: {draft: {}}}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const result = await run(helperPath, [
    '--to-json', '["recipient@example.com"]',
    '--subject', 'Malformed success response',
    '--body-plain-text', 'Do not expose this body.',
  ], {
    ...process.env,
    PATH: `${temp}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });

  assert.equal(result.code, 1);
  assert.equal(result.stderr.trim(), 'FEISHU_DRAFT_ERROR stage=response_validation feishu_code=0 http_status=200');
});
