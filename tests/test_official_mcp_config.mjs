import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.join(testDir, '..');

const expectedTools = [
  'preset.default',
  'preset.calendar.default',
  'preset.task.default',
  'calendar.v4.calendarEvent.list',
  'calendar.v4.calendarEvent.delete',
  'calendar.v4.calendarEventAttendee.create',
  'calendar.v4.calendarEventAttendee.list',
  'task.v2.task.get',
  'task.v2.task.list',
  'task.v2.task.delete',
  'approval.v4.approval.get',
  'approval.v4.instance.get',
  'approval.v4.instance.list',
  'approval.v4.instance.query',
  'approval.v4.instanceComment.list',
  'approval.v4.task.query',
  'approval.v4.task.search',
  'minutes.v1.minute.get',
];

test('locks the official user MCP to the approved calendar, task, approval, and Minutes tools', async () => {
  const config = JSON.parse(await readFile(path.join(pluginRoot, '.mcp.json'), 'utf8'));
  const launcher = await readFile(path.join(pluginRoot, 'scripts', 'launch-lark-mcp'), 'utf8');

  assert.deepEqual(config.mcpServers.feishu.env_vars, ['LARK_DOMAIN']);
  assert.doesNotMatch(launcher, /LARK_TOOLS/);
  for (const tool of expectedTools) assert.match(launcher, new RegExp(tool.replaceAll('.', '\\.'), 'u'));
  assert.doesNotMatch(launcher, /approval\.v4\.(?:instance\.create|task\.(?:approve|reject|transfer)|instanceComment\.create)/u);
  assert.doesNotMatch(launcher, /minutes\.v1\.minuteMedia\.get/u);
});
