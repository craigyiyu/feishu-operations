import assert from 'node:assert/strict';
import {chmod, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(testDir, '..', 'scripts', 'fetch-feishu-mail-via-tailscale');
const provisioner = path.join(testDir, '..', 'scripts', 'provision-feishu-mail-credentials-via-tailscale');

function run(args, env, executable = wrapper) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve({code, stdout, stderr});
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      stderr += error.message;
      finish(1);
    });
    child.on('close', finish);
  });
}

async function routeFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'feishu-tailscale-route-'));
  const fakeTailscale = path.join(directory, 'tailscale');
  const fetchScript = path.join(directory, 'fetch_feishu_mail.py');
  const argsPath = path.join(directory, 'tailscale-args.txt');
  await writeFile(fakeTailscale, `#!/bin/sh
printf '%s\\n' "$@" > "$FEISHU_TEST_TAILSCALE_ARGS"
cat >/dev/null
`);
  await writeFile(fetchScript, '# placeholder input sent to the remote Python interpreter\n');
  await chmod(fakeTailscale, 0o755);
  t.after(() => rm(directory, {recursive: true, force: true}));
  return {directory, fetchScript, argsPath};
}

test('routes the read-only mail helper only through Tailscale SSH and the MagicDNS target', async (t) => {
  const fixture = await routeFixture(t);
  const result = await run(['--mailbox', 'me@example.com', '--since-hours', '1', '--folder', 'INBOX', '--list-only', '--out-dir', '/tmp/feishu-route-test'], {
    ...process.env,
    PATH: `${fixture.directory}:${process.env.PATH}`,
    FEISHU_TEST_TAILSCALE_ARGS: fixture.argsPath,
    FEISHU_MAIL_FETCH_SCRIPT: fixture.fetchScript,
  });

  assert.equal(result.code, 0);
  const argv = (await readFile(fixture.argsPath, 'utf8')).trim().split('\n');
  assert.deepEqual(argv.slice(0, 13), [
    'ssh', 'ubuntu@bobvps', 'sudo', '-n', '-u', 'hermes', 'env', 'HOME=/home/hermes', 'python3', '-s', '-', '--env-path', '/home/hermes/.hermes/feishu-mail.env',
  ]);
  assert.equal(argv.includes('-i'), false);
  assert.equal(argv.some((value) => value.includes('43.128.111.182') || value.includes('tencent_vps')), false);
  assert.deepEqual(argv.slice(13), ['--mailbox', 'me@example.com', '--since-hours', '1', '--folder', 'INBOX', '--list-only', '--out-dir', '/tmp/feishu-route-test']);
});

test('rejects an unsafe VPS target before launching Tailscale', async (t) => {
  const fixture = await routeFixture(t);
  const result = await run(['--list-only', '--out-dir', '/tmp/feishu-route-test'], {
    ...process.env,
    PATH: `${fixture.directory}:${process.env.PATH}`,
    FEISHU_TEST_TAILSCALE_ARGS: fixture.argsPath,
    FEISHU_MAIL_FETCH_SCRIPT: fixture.fetchScript,
    FEISHU_MAIL_VPS_TARGET: 'ubuntu@43.128.111.182;bad',
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /FEISHU_MAIL_VPS_TARGET must be a single-line Tailscale SSH target/);
  await assert.rejects(readFile(fixture.argsPath, 'utf8'));
});

test('provisions a dedicated Feishu credential file through Tailscale without putting credentials in command arguments', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'feishu-tailscale-provision-'));
  const fakeTailscale = path.join(directory, 'tailscale');
  const fakeSecurity = path.join(directory, 'security');
  const argsPath = path.join(directory, 'calls.txt');
  await writeFile(fakeTailscale, `#!/bin/sh
printf '%s\\n' "$@" >> "$FEISHU_TEST_TAILSCALE_ARGS"
printf '%s\\n' -- '--stdin--' >> "$FEISHU_TEST_TAILSCALE_ARGS"
cat >> "$FEISHU_TEST_TAILSCALE_ARGS"
printf '%s\\n' -- '--end--' >> "$FEISHU_TEST_TAILSCALE_ARGS"
`);
  await writeFile(fakeSecurity, `#!/bin/sh
case "$*" in
  *codex-feishu-app-id*) printf 'test-app-id' ;;
  *codex-feishu-app-secret*) printf 'test-app-secret' ;;
  *) exit 1 ;;
esac
`);
  await chmod(fakeTailscale, 0o755);
  await chmod(fakeSecurity, 0o755);
  t.after(() => rm(directory, {recursive: true, force: true}));

  const result = await run([], {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    FEISHU_TEST_TAILSCALE_ARGS: argsPath,
  }, provisioner);

  assert.equal(result.code, 0);
  const calls = await readFile(argsPath, 'utf8');
  assert.match(calls, /ssh\nubuntu@bobvps\nsudo\n-n\n-u\nhermes\ntee\n\/home\/hermes\/.hermes\/feishu-mail\.env/);
  assert.match(calls, /FEISHU_APP_ID=test-app-id\nFEISHU_APP_SECRET=test-app-secret/);
  assert.match(calls, /ssh\nubuntu@bobvps\nsudo\n-n\n-u\nhermes\nchmod\n600\n\/home\/hermes\/.hermes\/feishu-mail\.env/);
  assert.equal(calls.split('--stdin--')[0].includes('test-app-secret'), false);
});
