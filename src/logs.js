/**
 * Leitura dos arquivos de log do txAdmin (`txData/<perfil>/logs`).
 *
 * O live console (fivem_console) só tem o que passou desde que esta sessão
 * conectou. Os arquivos guardam o resto: boots anteriores, o dia inteiro e os
 * dias rotacionados (`fxserver_AAAA-MM-DD_HH-MM-SS_N.log`).
 *
 * Só lê. Nome de arquivo vem do agente, então só vale um nome simples que
 * exista na pasta de logs: nada de caminho, `..` ou link para fora dela.
 */
import { closeSync, openSync, readSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Linha que o txAdmin escreve a cada vez que sobe o FXServer. */
export const BOOT_MARKER = /FXServer Starting - /;
/** Teto do que é lido do fim do arquivo (um dia de fxserver.log cabe folgado). */
export const MAX_READ_BYTES = 8 * 1024 * 1024;

const SAFE_NAME = /^[A-Za-z0-9._-]+\.(log|history)$/;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g;

/**
 * Pasta de logs: a da config ou, sem ela, a do FXServer rodando nesta máquina
 * (cwd do processo + txData/<perfil>/logs). Devolve null se não achar.
 */
export function resolveLogsDir(cfg, { procRoot = '/proc' } = {}) {
  if (cfg.logsDir) return cfg.logsDir;
  let pids;
  try {
    pids = readdirSync(procRoot).filter((p) => /^\d+$/.test(p));
  } catch {
    return null;
  }
  for (const pid of pids) {
    let cmd;
    try {
      cmd = readFileSync(join(procRoot, pid, 'cmdline'), 'utf8');
    } catch {
      continue;
    }
    if (!cmd.includes('FXServer') || !cmd.includes('txAdminServerMode')) continue;
    try {
      const cwd = realpathSync(join(procRoot, pid, 'cwd'));
      const txData = join(cwd, 'txData');
      for (const profile of readdirSync(txData)) {
        const dir = join(txData, profile, 'logs');
        if (statSync(join(dir, 'fxserver.log'), { throwIfNoEntry: false })) return dir;
      }
    } catch {
      // sem permissão ou sem txData nesse processo; tenta o próximo
    }
  }
  return null;
}

/** Arquivos de log da pasta, do mais novo para o mais velho. */
export function listLogs(dir) {
  return readdirSync(dir)
    .filter((name) => SAFE_NAME.test(name))
    .map((name) => {
      const st = statSync(join(dir, name));
      return { name, size: st.size, mtime: st.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/** Caminho de um arquivo da pasta, recusando qualquer coisa fora dela. */
export function logPath(dir, file) {
  if (!SAFE_NAME.test(file) || basename(file) !== file) {
    throw new Error(`nome de log inválido: "${file}" (use um nome da lista, ex. fxserver.log)`);
  }
  const root = realpathSync(dir);
  let full;
  try {
    full = realpathSync(join(root, file));
  } catch {
    throw new Error(`"${file}" não existe em ${dir}`);
  }
  if (!full.startsWith(root + '/') && !full.startsWith(root + '\\')) {
    throw new Error(`"${file}" aponta para fora de ${dir}`);
  }
  return full;
}

/** Lê no máximo `maxBytes` do fim do arquivo, sem carregar o resto. */
function readTail(path, maxBytes) {
  const size = statSync(path).size;
  const len = Math.min(size, maxBytes);
  const buf = Buffer.alloc(len);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buf, 0, len, size - len);
  } finally {
    closeSync(fd);
  }
  let out = buf.toString('utf8');
  // Começou no meio de uma linha: descarta o pedaço.
  if (len < size) out = out.slice(out.indexOf('\n') + 1);
  return { text: out, truncated: len < size };
}

/**
 * Últimas linhas de um log.
 * @param {string} dir
 * @param {{file?:string, lines?:number, filter?:string, sinceBoot?:boolean, maxBytes?:number}} opts
 */
export function readLog(dir, { file = 'fxserver.log', lines = 200, filter, sinceBoot = false, maxBytes = MAX_READ_BYTES } = {}) {
  let re = null;
  if (filter) {
    try {
      re = new RegExp(filter, 'i');
    } catch (err) {
      throw new Error(`regex inválida: ${err.message}`);
    }
  }
  const path = logPath(dir, file);
  const { text, truncated } = readTail(path, maxBytes);
  let all = text.replace(ANSI, '').split(/\r?\n/);
  if (all.length && all[all.length - 1] === '') all.pop();

  let boot = null;
  if (sinceBoot) {
    let idx = -1;
    for (let i = all.length - 1; i >= 0; i--) {
      if (BOOT_MARKER.test(all[i])) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      boot = all[idx].replace(/^.*FXServer Starting - /, '').trim();
      // O marcador vem entre duas linhas de "====": começa na de cima.
      all = all.slice(Math.max(0, idx - 1));
    }
  }

  const matched = re ? all.filter((l) => re.test(l)) : all;
  const out = matched.slice(-lines);
  return {
    file,
    lines: out,
    matched: matched.length,
    total: all.length,
    boot,
    bootFound: sinceBoot ? boot !== null : undefined,
    truncated,
  };
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
