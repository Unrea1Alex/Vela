import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, ChildProcess } from 'node:child_process';
import { z } from 'zod';

export const topics = {
  quickstart: 'docs/AGENT-QUICKSTART.md', language: 'docs/LANGUAGE.md',
  projects: 'docs/PROJECTS.md', modules: 'docs/contracts/MODULES.md',
  memory: 'docs/MEMORY.md', builtins: 'vela/builtins.def',
  idioms: 'examples/agent-idioms/main.vela', numbers: 'docs/contracts/NUMBERS.md', stdlib: 'docs/STDLIB.md', testing: 'docs/contracts/TESTING.md', ffi: 'docs/contracts/FFI.md'
} as const;
export const limits = { files: 256, bytes: 16 * 1024 * 1024, fileBytes: 2 * 1024 * 1024,
  active: 2, timeMs: 30000, outputBytes: 4 * 1024 * 1024, lineBytes: 1024 * 1024 };
export const configSchema = z.object({
  schema_version: z.literal(1), toolchain: z.string(), workspace: z.string(),
  execution:z.object({manifest:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),native_allowlist:z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([])}).strict().optional(),
  aliases: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).default({})
}).strict();
export type Config = z.infer<typeof configSchema>;
export type Status = 'ok'|'rejected'|'toolchain_error'|'invalid_input'|'source_changed'|'cancelled'|'timeout'|'limit'|'incompatible';
export class HostError extends Error { constructor(public status: Status, message: string) { super(message); } }
export const digest = (data: string|Buffer) => createHash('sha256').update(data).digest('hex');
export const within = (root: string, target: string) => {
  const rel = path.relative(root, target); return rel !== '' && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep);
};
type Entry = { relative: string; bytes: Buffer; signature: string };
const excluded = new Set(['.git', '.codex', 'node_modules', 'build', 'bin', 'dist', 'work']);
const abort = (signal: AbortSignal) => { if (signal.aborted) throw signal.reason instanceof HostError ? signal.reason : new HostError('cancelled', 'Request cancelled.'); };
export class Host {
  active = 0;
  children = new Set<ChildProcess>();
  pending = new Set<Promise<unknown>>();
  controller = new AbortController();
  base = '';
  compiler = '';
  compilerId = '';
  compilerVersion = '';
  pins: Record<string, string> = {};
  docs = new Map<string,string>();
  private compilerBytes = Buffer.alloc(0);
  private tempReady?: Promise<void>;
  constructor(public config: Config, public bounds = limits) {}
  async init(manifestPath: string) {
    if (!path.isAbsolute(this.config.workspace) || !path.isAbsolute(this.config.toolchain)) throw new HostError('invalid_input', 'Configuration roots must be absolute.');
    this.config.workspace = await fs.realpath(this.config.workspace);
    this.config.toolchain = await fs.realpath(this.config.toolchain);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (manifest.schema_version !== 1 || typeof manifest.version !== 'string'
        || !/^(0\.9\.0|0\.10\.0(?:-dev\.\d+)?|0\.11\.0(?:-dev\.[1234])?|1\.0\.0(?:-dev\.[12345]|-rc\.[12])?|1\.1\.0)$/.test(manifest.version)) {
      throw new HostError('incompatible', 'Unsupported compatibility manifest.');
    }
    this.compilerVersion = manifest.version;
    this.pins = manifest.files;
    const executable = process.platform === 'win32' ? 'bin/velac.exe' : 'bin/velac';
    if (!this.pins[executable] || Object.values(topics).some(p => !this.pins[p])) throw new HostError('incompatible', 'Missing compiler/document pins.');
    await this.verify();
    this.compilerId = this.pins[executable];
    for (const [topic, file] of Object.entries(topics)) this.docs.set(topic, await fs.readFile(path.join(this.config.toolchain, file), 'utf8'));
    const bytes = await fs.readFile(path.join(this.config.toolchain, executable));
    if (digest(bytes) !== this.compilerId) throw new HostError('incompatible', 'Compiler changed during initialization.');
    this.compilerBytes = bytes;
    for (const value of Object.values(this.config.aliases)) this.resolve(value);
  }
  async ensureTemp() {
    this.tempReady ??= (async () => {
      this.base = await fs.mkdtemp(path.join(os.tmpdir(), 'vela-mcp-'));
      this.compiler = path.join(this.base, process.platform === 'win32' ? 'velac.exe' : 'velac');
      await fs.writeFile(this.compiler, this.compilerBytes, { mode: 0o700 });
    })();
    await this.tempReady;
  }
  async verify() {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (const [relative, expected] of Object.entries(this.pins)) {
      const file = path.resolve(this.config.toolchain, relative);
      if (!within(this.config.toolchain, file)) throw new HostError('incompatible', 'Invalid pinned path.');
      const hash = createHash('sha256');
      try {
        const handle = await fs.open(file, 'r');
        try {
          for (;;) {
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
            if (bytesRead === 0) break;
            hash.update(buffer.subarray(0, bytesRead));
          }
        } finally {
          await handle.close();
        }
      } catch {
        throw new HostError('incompatible', 'Missing pinned file: ' + relative);
      }
      if (hash.digest('hex') !== expected) throw new HostError('incompatible', 'Toolchain/docs mismatch: ' + relative);
    }
  }
  resolve(input: string) {
    if (input.startsWith('@')) {
      input = this.config.aliases[input.slice(1)];
      if (!input) throw new HostError('invalid_input', 'Unknown configured alias.');
    }
    if (!input || input.length > 1024 || /[:\x00-\x1f]/.test(input) || path.isAbsolute(input) ||
        input.replaceAll('\\', '/').split('/').includes('..')) throw new HostError('invalid_input', 'Use a relative path inside the configured workspace.');
    const target = path.resolve(this.config.workspace, input);
    if (!within(this.config.workspace, target)) throw new HostError('invalid_input', 'Path escapes workspace.');
    return path.relative(this.config.workspace, target);
  }
  async inventory(signal: AbortSignal): Promise<Entry[]> {
    const entries: Entry[] = []; let bytes = 0; let visited = 0;
    const walk = async (dir: string, depth: number) => {
      abort(signal);
      if (depth > 128 || ++visited > 1024) throw new HostError('limit', 'Directory limit exceeded.');
      const names = (await fs.readdir(dir)).sort();
      for (const name of names) {
        abort(signal);
        if (excluded.has(name)) continue;
        if (name.includes(':')) throw new HostError('invalid_input', 'Unsupported filename.');
        const file = path.join(dir, name);
        const info = await fs.lstat(file, { bigint: true });
        if (info.isSymbolicLink() || !(await fs.realpath(file)).startsWith(this.config.workspace + path.sep)) throw new HostError('invalid_input', 'Filesystem links are not allowed.');
        if (info.isDirectory()) { await walk(file, depth + 1); continue; }
        if (!info.isFile() || info.nlink !== 1n) throw new HostError('invalid_input', 'Only regular, non-hardlinked files are allowed.');
        bytes += Number(info.size);
        if (info.size > BigInt(this.bounds.fileBytes) || bytes > this.bounds.bytes || entries.length >= this.bounds.files) throw new HostError('limit', 'Snapshot file/byte limit exceeded.');
        const handle = await fs.open(file, 'r');
        let content: Buffer;
        try {
          const opened = await handle.stat({ bigint: true });
          if (opened.dev !== info.dev || opened.ino !== info.ino || opened.nlink !== 1n || !opened.isFile()) throw new HostError('source_changed', 'File identity changed before reading.');
          content = await handle.readFile({ signal });
        } finally { await handle.close(); }
        const after = await fs.lstat(file, { bigint: true });
        const signature = [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join('|');
        if (signature !== [after.dev, after.ino, after.size, after.mtimeNs, after.ctimeNs].join('|') || after.isSymbolicLink()) throw new HostError('source_changed', 'Source changed while reading.');
        entries.push({ relative: path.relative(this.config.workspace, file), bytes: content, signature });
      }
    };
    await walk(this.config.workspace, 0); return entries;
  }
  inventoryId(entries: Entry[]) {
    return digest(JSON.stringify(entries.map(e => [e.relative, digest(e.bytes)])));
  }
  async removeOwned(dir: string) {
    if (!this.base || !within(this.base, path.resolve(dir))) throw new Error('Refusing cleanup outside owned directory.');
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 });
  }
  run(args: string[], cwd: string, signal: AbortSignal): Promise<{code:number;out:string;err:string}> {
    abort(signal);
    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, VELA_SOURCE_ROOT: cwd };
      delete env.VELA_CC; delete env.VELA_CC_KIND;
      const child = spawn(this.compiler, args, { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.children.add(child);
      let failure: unknown; let size = 0; const out: Buffer[] = [], err: Buffer[] = [];
      const cancel = () => { failure = signal.reason instanceof HostError ? signal.reason : new HostError('cancelled', 'Request cancelled.'); child.kill(); };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      const collect = (chunks: Buffer[], chunk: Buffer) => {
        size += chunk.length;
        if (size > this.bounds.outputBytes) { failure = new HostError('limit', 'Compiler output limit exceeded.'); child.kill(); }
        else chunks.push(chunk);
      };
      child.stdout.on('data', b => collect(out,b)); child.stderr.on('data', b => collect(err,b));
      child.on('error', e => { failure = new HostError('toolchain_error', 'Compiler could not start: ' + e.message); });
      child.on('close', code => {
        this.children.delete(child); signal.removeEventListener('abort', cancel);
        if (failure) reject(failure);
        else resolve({ code: code ?? 2, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') });
      });
    });
  }
  async analyze(kind: 'check'|'symbols'|'fmt'|'query'|'plan', input: string, external: AbortSignal, text?: string, overlayPath?: string,
    options: {at?:{path:string;line:number;character:number};plan?:{snapshot_id:string;revision:string;document:number;byte?:number;new_name?:string}} = {}) {
    let snapshotId = ''; let dir = '';
    const answer = (status: Status, data: Record<string,unknown>, message='') =>
      ({ schema_version: 1 as const, status, compiler_id: this.compilerId, snapshot_id: snapshotId, data, message });
    if (this.active >= this.bounds.active) return answer('limit', {}, 'Analysis concurrency limit reached.');
    this.active++;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new HostError('timeout','Analysis timed out.')), this.bounds.timeMs);
    const signal = AbortSignal.any([external, timeout.signal, this.controller.signal]);
    try {
      abort(signal); await this.verify(); abort(signal);
      const relative = this.resolve(input);
      if (kind === 'fmt' && (relative.endsWith('.vproj') || path.basename(relative) === 'vela.project')) throw new HostError('invalid_input', 'Format accepts one source file, not a manifest.');
      const first = await this.inventory(signal);
      const effective = first.map(e=>({...e}));
      if (overlayPath !== undefined && text === undefined) throw new HostError('invalid_input','overlay_path requires text.');
      if (text !== undefined) {
        const overlayRelative = overlayPath === undefined ? relative : this.resolve(overlayPath);
        if(overlayRelative.endsWith('.vproj') || path.basename(overlayRelative)==='vela.project' || overlayRelative.split(path.sep).some(p=>excluded.has(p))) throw new HostError('invalid_input','Text overlay requires an included source path.');
        const bytes=Buffer.from(text,'utf8');
        if(bytes.length>this.bounds.fileBytes) throw new HostError('limit','Overlay exceeds file limit.');
        const index=effective.findIndex(e=>e.relative===overlayRelative);
        const entry={relative:overlayRelative,bytes,signature:'overlay'};
        if(index<0) effective.push(entry); else effective[index]=entry;
        effective.sort((a,b)=>a.relative.localeCompare(b.relative,'en'));
        if(effective.length>this.bounds.files || effective.reduce((n,e)=>n+e.bytes.length,0)>this.bounds.bytes) throw new HostError('limit','Overlay exceeds snapshot limits.');
      }
      if (!effective.some(e => e.relative === relative)) throw new HostError('invalid_input', 'Input is missing or excluded from the snapshot.');
      await this.ensureTemp(); abort(signal);
      dir = await fs.mkdtemp(path.join(this.base, 'request-'));
      for (const entry of effective) {
        abort(signal);
        const target = path.join(dir, entry.relative);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, entry.bytes);
      }
      const second = await this.inventory(signal);
      if (this.inventoryId(first) !== this.inventoryId(second) || JSON.stringify(first.map(e=>e.signature)) !== JSON.stringify(second.map(e=>e.signature))) throw new HostError('source_changed', 'Workspace changed during snapshot capture.');
      snapshotId = digest(this.compilerId + this.inventoryId(effective));
      const args = [kind, path.join(dir,relative)];
      if (kind === 'plan') {
        const plan = options.plan!;
        if (plan.snapshot_id !== snapshotId) throw new HostError('source_changed','Analysis snapshot changed; query again.');
        args.push(plan.revision,String(plan.document));
        if (plan.byte === undefined) args.push('fmt'); else args.push(String(plan.byte),plan.new_name!);
      } else {
        args.push('--json');
        if (kind === 'query' && options.at) {
          const at = options.at;
          args.push('--at',path.join(dir,this.resolve(at.path)),String(at.line),String(at.character));
        }
      }
      const outcome = await this.run(args, dir, signal);
      if (kind === 'query' || kind === 'plan') {
        const after = await this.inventory(signal);
        if (this.inventoryId(first) !== this.inventoryId(after) || JSON.stringify(first.map(e=>e.signature)) !== JSON.stringify(after.map(e=>e.signature)))
          throw new HostError('source_changed','Workspace changed during semantic analysis.');
      }
      const remap = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(remap);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,
          ['source','file','path'].includes(k) && typeof v === 'string' && within(dir,v) ? path.join(this.config.workspace,path.relative(dir,v)) : remap(v)]));
        return value;
      };
      let data: Record<string,unknown>;
      if (kind === 'fmt' && outcome.code === 0) data = { text: outcome.out };
      else {
        try { data = { native: remap(JSON.parse(outcome.out)), exit_code: outcome.code, stderr: outcome.err }; }
        catch { throw new HostError('toolchain_error', 'Compiler returned invalid JSON: ' + outcome.err.slice(0,2000)); }
      }
      return answer(outcome.code === 0 ? 'ok' : outcome.code === 1 ? 'rejected' : 'toolchain_error', data);
    } catch (e) {
      if (signal.aborted) { try { abort(signal); } catch (cancelled) { e = cancelled; } }
      return answer(e instanceof HostError ? e.status : 'toolchain_error', {}, e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
      if (dir) await this.removeOwned(dir);
      this.active--;
      if (this.active === 0 && this.base) {
        const finished = this.base;
        this.base = ''; this.compiler = ''; this.tempReady = undefined;
        await this.removeRoot(finished);
      }
    }
  }
  async removeRoot(root: string) {
    const target = path.resolve(root);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('vela-mcp-')) throw new Error('Invalid owned temporary root.');
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
  async close() {
    this.controller.abort(new HostError('cancelled','Client disconnected.'));
    await Promise.allSettled([...this.pending]);
    for (const child of this.children) child.kill();
    if (this.base) {
      await this.removeRoot(this.base);
      this.base = '';
    }
  }
}
