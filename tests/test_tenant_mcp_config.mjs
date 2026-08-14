import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.join(testDir, '..');
const expectedTools = [
  'corehr.v1.department.get',
  'corehr.v1.department.list',
  'corehr.v2.department.parents',
  'corehr.v2.department.search',
  'corehr.v2.department.tree',
  'corehr.v2.employee.batchGet',
  'corehr.v2.employee.search',
  'corehr.v1.compensationStandard.match',
  'payroll.v1.costAllocationDetail.list',
  'payroll.v1.costAllocationPlan.list',
  'payroll.v1.costAllocationReport.list',
  'payroll.v1.datasource.list',
  'payroll.v1.datasourceRecord.query',
];

test('registers a tenant-only official MCP with a fixed read-only HR and payroll allowlist', async () => {
  const config = JSON.parse(await readFile(path.join(pluginRoot, '.mcp.json'), 'utf8'));
  assert.deepEqual(config.mcpServers.feishu_tenant, {
    command: './scripts/launch-lark-tenant-mcp',
    args: [],
    cwd: '.',
    env_vars: ['LARK_DOMAIN'],
  });

  const launcher = await readFile(path.join(pluginRoot, 'scripts', 'launch-lark-tenant-mcp'), 'utf8');
  assert.match(launcher, /--token-mode[\s\S]*tenant_access_token/);
  assert.doesNotMatch(launcher, /LARK_TENANT_TOOLS/);
  for (const tool of expectedTools) assert.match(launcher, new RegExp(tool.replaceAll('.', '\\.')));
  assert.doesNotMatch(launcher, /\.create|\.update|\.patch|\.delete|\.save|\.write/);
});
