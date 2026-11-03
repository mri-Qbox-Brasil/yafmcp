import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { listLogs, readLog, resolveLogsDir } from '../src/logs.js';
import { buildServer } from '../src/index.js';

const BOOT = (n, when) =>
  [
    '║             TXADMIN║ ================================================================',
    `║             TXADMIN║ ======== [${n}] FXServer Starting - ${when}     `,
    '║             TXADMIN║ ================================================================',
  ].join('\n');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'yafmcp-logs-'));
  const dir = join(root, 'logs');
  mkdirSync(dir);
  writeFileSync(
    join(dir, 'fxserver.log'),
    [
      'linha velha',
      BOOT(1, '03/11/2026, 13:40:10'),
      '[ citizen-server-impl] Cfx failed to reach the server',
      BOOT(2, '03/11/2026, 14:48:15'),
      '\x1b[31m[ script:ox_inventory] [INFO] Inventory has loaded 459 items\x1b[0m',
      '[ citizen-server-impl] server thread hitch warning',
      '',
    ].join('\n')
  );
  writeFileSync(join(dir, 'fxserver_2026-11-02_00-00-00_1.log'), 'ontem\n');
  writeFileSync(join(root, 'segredo.log'), 'fora da pasta\n');
  return { root, dir };
}

test('readLog devolve o fim do arquivo sem ANSI', () => {
  const { dir } = fixture();
  const res = readLog(dir, { lines: 2 });
  assert.deepEqual(res.lines, [
    '[ script:ox_inventory] [INFO] Inventory has loaded 459 items',
    '[ citizen-server-impl] server thread hitch warning',
  ]);
});

test('sinceBoot corta no último "FXServer Starting"', () => {
  const { dir } = fixture();
  const res = readLog(dir, { sinceBoot: true });
  assert.equal(res.boot, '03/11/2026, 14:48:15');
  assert.ok(res.lines[0].includes('===='));
  assert.ok(!res.lines.some((l) => l.includes('Cfx failed')));
});

test('filter é regex sem diferenciar maiúsculas', () => {
  const { dir } = fixture();
  const res = readLog(dir, { filter: 'cfx FAILED|hitch' });
  assert.equal(res.matched, 2);
  assert.throws(() => readLog(dir, { filter: '(' }), /regex inválida/);
});

test('arquivo grande: lê só o fim e descarta a linha cortada', () => {
  const { dir } = fixture();
  const res = readLog(dir, { maxBytes: 60 });
  assert.equal(res.truncated, true);
  assert.deepEqual(res.lines, ['[ citizen-server-impl] server thread hitch warning']);
});

test('nome de arquivo não sai da pasta de logs', () => {
  const { dir } = fixture();
  assert.throws(() => readLog(dir, { file: '../segredo.log' }), /inválido/);
  assert.throws(() => readLog(dir, { file: 'nao-existe.log' }), /não existe/);
  try {
    symlinkSync(join(dir, '..', 'segredo.log'), join(dir, 'link.log'));
  } catch {
    return; // sem permissão de symlink (Windows sem modo dev)
  }
  assert.throws(() => readLog(dir, { file: 'link.log' }), /fora de/);
});

test('listLogs lista do mais novo para o mais velho', () => {
  const { dir } = fixture();
  const names = listLogs(dir).map((f) => f.name);
  assert.ok(names.includes('fxserver.log'));
  assert.ok(names.includes('fxserver_2026-11-02_00-00-00_1.log'));
});

test('resolveLogsDir acha a pasta pelo processo do FXServer', () => {
  const { root } = fixture();
  const proc = mkdtempSync(join(tmpdir(), 'yafmcp-proc-'));
  const server = join(root, 'srv');
  mkdirSync(join(server, 'txData', 'default', 'logs'), { recursive: true });
  writeFileSync(join(server, 'txData', 'default', 'logs', 'fxserver.log'), '');
  mkdirSync(join(proc, '4242'));
  writeFileSync(join(proc, '4242', 'cmdline'), 'FXServer\0+set\0txAdminServerMode\0true');
  try {
    symlinkSync(server, join(proc, '4242', 'cwd'), 'dir');
  } catch {
    return;
  }
  assert.equal(resolveLogsDir({}, { procRoot: proc }), join(server, 'txData', 'default', 'logs'));
  assert.equal(resolveLogsDir({ logsDir: '/x' }, { procRoot: proc }), '/x');
});

test('fivem_logs pelo MCP', async () => {
  const { dir } = fixture();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([buildServer({ logsDir: dir }, {}).connect(serverSide), client.connect(clientSide)]);

  const read = await client.callTool({ name: 'fivem_logs', arguments: { sinceBoot: true, filter: 'inventory' } });
  assert.equal(read.isError, undefined);
  assert.match(read.content[0].text, /desde o boot de 03\/11\/2026, 14:48:15/);
  assert.match(read.content[0].text, /Inventory has loaded/);

  const list = await client.callTool({ name: 'fivem_logs', arguments: { list: true } });
  assert.match(list.content[0].text, /fxserver_2026-11-02_00-00-00_1\.log/);

  const bad = await client.callTool({ name: 'fivem_logs', arguments: { file: '../segredo.log' } });
  assert.equal(bad.isError, true);
  await client.close();
});
