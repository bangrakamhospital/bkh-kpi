import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Small local JSON stores under ${KPI_DATA_DIR || <cwd>/data} (the HIS
 * database is read-only). Used by src/lib/users (users.json) and
 * src/lib/departments (departments.json).
 *
 *  - dir 0700, file 0600, created on the first write
 *  - read-modify-write runs under a per-file in-process mutex; writes are
 *    atomic (tmp file + fsync + rename) so a crash never leaves half a file
 *  - reads are cached by (mtime, size): one stat() per read
 *  - a missing file reads as `initial()` (nothing is written)
 *  - a corrupt / unreadable file throws DataStoreError and is NEVER
 *    overwritten (callers decide how to fail)
 *
 * Single process only (pm2 fork mode, one instance).
 * Only relative / node: imports (loadable by scratchpad test scripts).
 */

export class DataStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataStoreError";
  }
}

export function dataDir(): string {
  const dir = process.env.KPI_DATA_DIR?.trim();
  // Runtime data, not a build input: keep it out of output file tracing.
  return path.resolve(
    /*turbopackIgnore: true*/ dir || path.join(process.cwd(), "data"),
  );
}

export interface JsonFileOptions<T> {
  /** File name inside dataDir(), e.g. "users.json". */
  fileName: string;
  /** Parse + validate the file text; throw DataStoreError when invalid. */
  parse: (text: string) => T;
  /** JSON value written to disk. */
  serialize: (data: T) => unknown;
  /** Value of a missing file. */
  initial: () => T;
  maxBytes?: number;
}

export interface JsonFile<T> {
  path(): string;
  /** Snapshot (deep copy), waits for pending writes. */
  read(): Promise<T>;
  /**
   * Read-modify-write under the mutex. `fn` gets a deep copy; the file is
   * written only when `fn` reports `changed`. Errors thrown by `fn` abort
   * without writing.
   */
  mutate<R>(fn: (data: T) => { result: R; changed: boolean }): Promise<R>;
  /** Test helper: forget the cached contents. */
  resetCache(): void;
}

interface Cache<T> {
  file: string;
  mtimeMs: number;
  size: number;
  data: T;
}

interface FileState {
  lock: Promise<unknown>;
  cache: Cache<unknown> | null;
}

const globalStores = globalThis as unknown as {
  __kpiJsonStores?: Map<string, FileState>;
};
const states: Map<string, FileState> = (globalStores.__kpiJsonStores ??=
  new Map());

function errCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}

async function renameWithRetry(from: string, to: string) {
  // Windows (dev): rename can fail briefly while another handle (AV,
  // indexer) has the target open.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = errCode(err);
      if (
        attempt >= 4 ||
        (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")
      ) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
}

export function jsonFile<T>(opts: JsonFileOptions<T>): JsonFile<T> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const name = opts.fileName;

  function state(): FileState {
    let s = states.get(name);
    if (!s) {
      s = { lock: Promise.resolve(), cache: null };
      states.set(name, s);
    }
    return s;
  }

  function withLock<R>(fn: () => Promise<R>): Promise<R> {
    const s = state();
    const run = s.lock.then(fn, fn);
    s.lock = run.catch(() => undefined);
    return run;
  }

  const filePath = () => path.join(dataDir(), name);

  async function load(): Promise<T> {
    const s = state();
    const file = filePath();
    let st: { mtimeMs: number; size: number };
    try {
      st = await fs.stat(file);
    } catch (err) {
      if (errCode(err) === "ENOENT") {
        const data = opts.initial();
        s.cache = { file, mtimeMs: -1, size: -1, data };
        return data;
      }
      throw new DataStoreError(`cannot stat ${name} (${errCode(err)})`);
    }
    const c = s.cache;
    if (c && c.file === file && c.mtimeMs === st.mtimeMs && c.size === st.size) {
      return c.data as T;
    }
    if (st.size > maxBytes) throw new DataStoreError(`${name} is too large`);
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (err) {
      throw new DataStoreError(`cannot read ${name} (${errCode(err)})`);
    }
    const data = opts.parse(text);
    s.cache = { file, mtimeMs: st.mtimeMs, size: st.size, data };
    return data;
  }

  async function save(data: T) {
    const dir = dataDir();
    const file = filePath();
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const text = `${JSON.stringify(opts.serialize(data), null, 2)}\n`;
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const fh = await fs.open(tmp, "wx", 0o600);
      try {
        await fh.writeFile(text, "utf8");
        await fh.sync();
      } finally {
        await fh.close();
      }
      await renameWithRetry(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw new DataStoreError(`cannot write ${name} (${errCode(err)})`);
    }
    // rename keeps the tmp file's 0600; chmod again in case it pre-existed.
    await fs.chmod(file, 0o600).catch(() => undefined);
    const st = await fs.stat(file);
    state().cache = { file, mtimeMs: st.mtimeMs, size: st.size, data };
  }

  return {
    path: filePath,
    read: () => withLock(async () => structuredClone(await load())),
    mutate: (fn) =>
      withLock(async () => {
        const data = structuredClone(await load());
        const { result, changed } = fn(data);
        if (changed) await save(data);
        return result;
      }),
    resetCache: () => {
      state().cache = null;
    },
  };
}
