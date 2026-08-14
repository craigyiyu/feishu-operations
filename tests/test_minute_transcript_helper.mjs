import assert from 'node:assert/strict';
import {chmod, mkdtemp, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const helper = path.join(testDir, '..', 'scripts', 'fetch-feishu-minute-transcript');
const validToken = 'obcnq3b9jl72l83w4f149w9c';

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
  const directory = await mkdtemp(path.join(tmpdir(), 'feishu-minute-security-'));
  await writeFile(path.join(directory, 'security'), `#!/bin/sh\ncase "$*" in\n  *codex-feishu-v2-token-expiry*) printf 9999999999999 ;;\n  *codex-feishu-v2-user-access-token*) printf test-user-token ;;\n  *) exit 1 ;;\nesac\n`);
  await chmod(path.join(directory, 'security'), 0o755);
  t.after(async () => { await (await import('node:fs/promises')).rm(directory, {recursive: true, force: true}); });
  return directory;
}

test('reads exactly one requested Minutes transcript with the user token', async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({url: request.url, authorization: request.headers.authorization});
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end('00:00 Speaker: test transcript');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run(['--minute-token', validToken, '--format', 'txt'], {
    ...process.env,
    PATH: `${securityPath}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '00:00 Speaker: test transcript');
  assert.deepEqual(requests, [{
    url: `/open-apis/minutes/v1/minutes/${validToken}/transcript?file_format=txt`,
    authorization: 'Bearer test-user-token',
  }]);
});

test('rejects malformed Minutes tokens without an HTTP request', async () => {
  const result = await run(['--minute-token', 'not-a-minute'], process.env);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /minute_token must be a 24-character/);
});

test('scrubs an official Minutes API failure to stage, code, and HTTP status', async (t) => {
  const server = createServer((_request, response) => {
    response.statusCode = 403;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({code: 2091005, msg: 'do not expose this private error'}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run(['--minute-token', validToken], {
    ...process.env,
    PATH: `${securityPath}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });

  assert.notEqual(result.code, 0);
  assert.equal(result.stderr, 'FEISHU_MINUTE_ERROR stage=transcript_read feishu_code=2091005 http_status=403\n');
});
