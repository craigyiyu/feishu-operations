import assert from 'node:assert/strict';
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const helper = path.join(testDir, '..', 'scripts', 'fetch-feishu-company-directory');

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
  const directory = await mkdtemp(path.join(tmpdir(), 'feishu-directory-security-'));
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

test('reads app-visible Contact users and projects only the five approved directory fields', async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push({method: request.method, pathname: url.pathname, query: [...url.searchParams.entries()], authorization: request.headers.authorization});
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') {
      response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
      return;
    }
    if (url.pathname === '/open-apis/contact/v3/scopes') {
      response.end(JSON.stringify({code: 0, data: {user_ids: ['user-one', 'user-two', 'former-user']}}));
      return;
    }
    if (url.pathname === '/open-apis/contact/v3/users/batch') {
      response.end(JSON.stringify({code: 0, data: {items: [
        {user_id: 'user-one', open_id: 'open-one', name: 'One', email: 'one@example.com', mobile: 'hidden', status: {is_resigned: false}},
        {user_id: 'user-two', open_id: 'open-two', name: 'Two', enterprise_email: 'two@company.example', email: 'two@example.com', national_id: 'hidden', status: {is_resigned: false}},
        {user_id: 'former-user', open_id: 'former-open', name: 'Former', email: 'former@example.com', status: {is_resigned: true}},
      ]}}));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({code: 404}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run(['--page-size', '3'], {
    ...process.env,
    PATH: `${securityPath}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    employees: [
      {name: 'One', work_email: 'one@example.com', user_id: 'user-one', open_id: 'open-one', employment_id: null},
      {name: 'Two', work_email: 'two@company.example', user_id: 'user-two', open_id: 'open-two', employment_id: null},
    ],
    has_more: false,
    page_token: null,
  });
  assert.deepEqual(requests, [
    {method: 'POST', pathname: '/open-apis/auth/v3/tenant_access_token/internal', query: [], authorization: undefined},
    {method: 'GET', pathname: '/open-apis/contact/v3/scopes', query: [], authorization: 'Bearer test-tenant-token'},
    {method: 'GET', pathname: '/open-apis/contact/v3/users/batch', query: [
      ['user_id_type', 'user_id'], ['department_id_type', 'open_department_id'], ['user_ids', 'former-user'], ['user_ids', 'user-one'], ['user_ids', 'user-two'],
    ], authorization: 'Bearer test-tenant-token'},
  ]);
});

test('uses an opaque virtual page token without requesting more than one bounded Contact batch', async (t) => {
  let batchIds = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') return response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
    if (url.pathname === '/open-apis/contact/v3/scopes') return response.end(JSON.stringify({code: 0, data: {open_ids: ['open-a', 'open-b', 'open-c']}}));
    if (url.pathname === '/open-apis/contact/v3/users/batch') {
      batchIds = url.searchParams.getAll('user_ids');
      return response.end(JSON.stringify({code: 0, data: {items: [
        {user_id: 'user-a', open_id: 'open-a', name: 'A', email: 'a@example.com', status: {is_resigned: false}},
        {user_id: 'user-b', open_id: 'open-b', name: 'B', email: 'b@example.com', status: {is_resigned: false}},
        {user_id: 'user-c', open_id: 'open-c', name: 'C', email: 'c@example.com', status: {is_resigned: false}},
      ]}}));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({code: 404}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run(['--page-size', '1', '--page-token', 'directory-v1.2'], {
    ...process.env,
    PATH: `${securityPath}:${process.env.PATH}`,
    LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`,
  });

  assert.equal(result.code, 0);
  assert.deepEqual(batchIds, ['open-a', 'open-b', 'open-c']);
  assert.deepEqual(JSON.parse(result.stdout), {
    employees: [{name: 'C', work_email: 'c@example.com', user_id: 'user-c', open_id: 'open-c', employment_id: null}],
    has_more: false,
    page_token: null,
  });
});

test('treats Open IDs returned under the scope user_ids key as Open IDs', async (t) => {
  let userIdType = null;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') return response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
    if (url.pathname === '/open-apis/contact/v3/scopes') return response.end(JSON.stringify({code: 0, data: {user_ids: ['ou_scope_value']}}));
    if (url.pathname === '/open-apis/contact/v3/users/batch') {
      userIdType = url.searchParams.get('user_id_type');
      return response.end(JSON.stringify({code: 0, data: {items: [{user_id: 'user-one', open_id: 'ou_scope_value', name: 'One', email: 'one@example.com', status: {is_resigned: false}}]}}));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({code: 404}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run([], {...process.env, PATH: `${securityPath}:${process.env.PATH}`, LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`});

  assert.equal(result.code, 0);
  assert.equal(userIdType, 'open_id');
});

test('unions employees visible only through an authorized department', async (t) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') return response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
    if (url.pathname === '/open-apis/contact/v3/scopes') return response.end(JSON.stringify({code: 0, data: {user_ids: ['ou_scope_user'], department_ids: ['od_authorized_department']}}));
    if (url.pathname === '/open-apis/contact/v3/users/batch') return response.end(JSON.stringify({code: 0, data: {items: [{user_id: 'user-scope', open_id: 'ou_scope_user', name: 'Scope User', email: 'scope@example.com', status: {is_resigned: false}}]}}));
    if (url.pathname === '/open-apis/contact/v3/users') return response.end(JSON.stringify({code: 0, data: {items: [{user_id: 'user-department', open_id: 'ou_department_user', name: 'Department User', email: 'department@example.com', status: {is_resigned: false}}], has_more: false}}));
    response.statusCode = 404;
    response.end(JSON.stringify({code: 404}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run([], {...process.env, PATH: `${securityPath}:${process.env.PATH}`, LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`});

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    employees: [
      {name: 'Department User', work_email: 'department@example.com', user_id: 'user-department', open_id: 'ou_department_user', employment_id: null},
      {name: 'Scope User', work_email: 'scope@example.com', user_id: 'user-scope', open_id: 'ou_scope_user', employment_id: null},
    ],
    has_more: false,
    page_token: null,
  });
});

test('rejects an unsafe page size or unissued directory token before accessing credentials', async () => {
  for (const args of [['--page-size', '501'], ['--page-token', 'opaque-next-page']]) {
    const result = await run(args, process.env);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /page_size must be an integer between 1 and 500|page_token must be a directory continuation token/);
  }
});

test('scrubs a Contact directory authorization failure', async (t) => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/open-apis/auth/v3/tenant_access_token/internal') return response.end(JSON.stringify({code: 0, tenant_access_token: 'test-tenant-token'}));
    response.statusCode = 403;
    response.end(JSON.stringify({code: 99991672, msg: 'do not disclose this backend message'}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const securityPath = await fakeSecurityPath(t);

  const result = await run([], {...process.env, PATH: `${securityPath}:${process.env.PATH}`, LARK_DOMAIN: `http://127.0.0.1:${server.address().port}`});

  assert.notEqual(result.code, 0);
  assert.equal(result.stderr, 'FEISHU_DIRECTORY_ERROR stage=scope_read feishu_code=99991672 http_status=403\n');
});
