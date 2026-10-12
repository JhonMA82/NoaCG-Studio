// vMix's TCP API, precisely: the wire on 127.0.0.1:8099 (docs/work-specs/bridge-vmix-adapter).
//
// Every shape here came off vMix 29.0.0.49 (Trial) on 2026-10-12:
//   on connect                     VERSION OK 29.0.0.49\r\n            (about 20 ms after the socket opens)
//   XML\r\n                        XML 1890\r\n<1890 bytes: <vmix>…</vmix>\r\n>
//   FUNCTION <name> <query>\r\n    FUNCTION OK Completed\r\n           (for ANY name and ANY Input=, even
//                                                                       ones vMix does not have: an OK
//                                                                       proves nothing was done)
//   SUBSCRIBE ACTS\r\n             SUBSCRIBE OK ACTS Subscribed\r\n, then ACTS OK <activator> <args>\r\n
//   an unknown command             HELLO ER Unknown Command\r\n
// The query's values are URL-decoded by vMix (`Value=NoaCG%3A%20A%20%26%20co` named an input
// `NoaCG: A & co`). ACTS lines arrive between replies, before or after the FUNCTION OK of the call
// that caused them, never inside an XML body, so a reply is matched by its first word and an XML
// body read by its length.
//
// ONE connection per port, kept open and shared by every request: the overlay-press subscription
// needs it held, and vMix answers in order, so commands go one at a time. A reply that never comes
// closes the connection - the next reply could no longer be told from this one's - and the next
// request opens a new one. Nothing is ever sent twice.

import { connect, type Socket } from 'node:net';
import type { VmixInput } from './protocol.js';

/** vMix's TCP API port, documented and fixed unless somebody changed vMix's own setting. */
export const DEFAULT_VMIX_PORT = 8099;
/** The wait for `VERSION OK` after the socket opens: vMix greets in tens of milliseconds. */
export const VMIX_GREETING_MS = 3000;
/** The wait for one command's answer. */
export const VMIX_REPLY_MS = 3000;
/** The longest line and the largest XML body taken in before the connection is dropped. */
const MAX_LINE_BYTES = 64 * 1024;
const MAX_XML_BYTES = 16 * 1024 * 1024;

export type VmixOpen = { ok: true; version: string } | { ok: false; setup: 'not-running' | 'not-vmix'; why: string };

/** One command's answer: its status line (and an XML body), or why there is none. `not-sent` is a
 *  command that never left, so nothing can have happened; `timeout` and `closed` are one that left
 *  and was not answered, so it may have. */
export type VmixReply = { ok: true; status: string; line: string; body?: string } | { ok: false; lost: 'not-sent' | 'timeout' | 'closed' };

interface Pending {
  word: string;
  done: (r: VmixReply) => void;
  timer: NodeJS.Timeout;
}

export class VmixConnection {
  readonly port: number;
  private readonly greetingMs: number;
  private readonly replyMs: number;
  private socket?: Socket;
  private version?: string;
  private opening?: Promise<VmixOpen>;
  private buf: Buffer = Buffer.alloc(0);
  private body?: { length: number; line: string };
  private pending?: Pending;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(port: number, options: { greetingMs?: number; replyMs?: number } = {}) {
    this.port = port;
    this.greetingMs = options.greetingMs ?? VMIX_GREETING_MS;
    this.replyMs = options.replyMs ?? VMIX_REPLY_MS;
  }

  /** The connection, greeted: the open one, or a new one. */
  open(): Promise<VmixOpen> {
    if (this.socket && this.version && !this.socket.destroyed) return Promise.resolve({ ok: true, version: this.version });
    this.opening ??= this.start().finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  /** Close it, answering whatever waits as lost. */
  close(): void {
    this.socket?.destroy();
  }

  private start(): Promise<VmixOpen> {
    return new Promise((resolve) => {
      const s = connect({ host: '127.0.0.1', port: this.port });
      s.setNoDelay(true);
      // The Bridge's HTTP server keeps the process alive; a connection to vMix never does on its own.
      s.unref();
      // A command still waiting on a socket already destroyed has lost its answer.
      this.finish({ ok: false, lost: 'closed' });
      this.socket = s;
      this.version = undefined;
      this.buf = Buffer.alloc(0);
      this.body = undefined;
      let connected = false;
      let settled = false;
      const settle = (r: VmixOpen) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!r.ok) s.destroy();
        resolve(r);
      };
      const timer = setTimeout(
        () => settle({ ok: false, setup: 'not-vmix', why: `port ${this.port} accepted the connection but sent no VERSION OK greeting within ${this.greetingMs} ms` }),
        this.greetingMs,
      );
      s.once('connect', () => {
        connected = true;
      });
      s.on('error', (e: NodeJS.ErrnoException) => {
        // Refused before it connected is nothing listening; anything after is something that is not vMix.
        settle(connected ? { ok: false, setup: 'not-vmix', why: `port ${this.port} dropped the connection (${e.code ?? e.message})` } : { ok: false, setup: 'not-running', why: e.code ?? e.message });
      });
      s.on('close', () => {
        settle({ ok: false, setup: connected ? 'not-vmix' : 'not-running', why: `port ${this.port} closed the connection before greeting` });
        this.closed(s);
      });
      s.on('data', (d: Buffer) => this.data(s, d, settle));
    });
  }

  private closed(s: Socket): void {
    if (this.socket !== s) return;
    this.socket = undefined;
    this.version = undefined;
    this.body = undefined;
    this.buf = Buffer.alloc(0);
    this.finish({ ok: false, lost: 'closed' });
  }

  private data(s: Socket, d: Buffer, greeted: (r: VmixOpen) => void): void {
    if (this.socket !== s) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (this.body) {
        if (this.buf.length < this.body.length) return;
        const text = this.buf.subarray(0, this.body.length).toString('utf8');
        this.buf = this.buf.subarray(this.body.length);
        const { line } = this.body;
        this.body = undefined;
        this.finish({ ok: true, status: line.split(' ')[1] ?? '', line, body: text });
        continue;
      }
      const nl = this.buf.indexOf(0x0a);
      if (nl < 0) {
        if (this.buf.length > MAX_LINE_BYTES) s.destroy();
        return;
      }
      const line = this.buf.subarray(0, nl).toString('utf8').replace(/\r$/, '');
      this.buf = this.buf.subarray(nl + 1);
      if (!this.version) {
        const m = /^VERSION OK (\S.*)$/.exec(line);
        if (!m) {
          greeted({ ok: false, setup: 'not-vmix', why: `port ${this.port} greeted with "${line.slice(0, 80)}", not VERSION OK` });
          return;
        }
        this.version = m[1].trim();
        greeted({ ok: true, version: this.version });
        continue;
      }
      const [word, status = ''] = line.split(' ');
      // A subscription's lines are not a reply to anything (the overlay-press reader takes them).
      if (word === 'ACTS' && this.pending?.word !== 'ACTS') continue;
      if (!this.pending || word !== this.pending.word) continue;
      if (word === 'XML' && /^\d+$/.test(status)) {
        const length = Number(status);
        if (length > MAX_XML_BYTES) {
          s.destroy();
          return;
        }
        this.body = { length, line };
        continue;
      }
      this.finish({ ok: true, status, line });
    }
  }

  private finish(r: VmixReply): void {
    const p = this.pending;
    if (!p) return;
    this.pending = undefined;
    clearTimeout(p.timer);
    p.done(r);
  }

  /**
   * Send one command line and wait for its answer, after every command sent before it. `until` is
   * the verb's deadline on `Date.now()`: the wait is the shorter of it and the reply timeout, and a
   * command whose turn comes with no time left is never sent.
   */
  command(line: string, until: number): Promise<VmixReply> {
    if (/[\r\n]/.test(line)) throw new Error('A vMix command is one line.');
    const run = this.tail.then(() => this.exchange(line, until));
    this.tail = run.catch(() => undefined);
    return run;
  }

  private exchange(line: string, until: number): Promise<VmixReply> {
    const s = this.socket;
    const wait = Math.min(this.replyMs, until - Date.now());
    if (!s || s.destroyed || !this.version || wait <= 0) return Promise.resolve({ ok: false, lost: 'not-sent' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.finish({ ok: false, lost: 'timeout' });
        // The answer may still come, and would then read as the next command's.
        s.destroy();
      }, wait);
      this.pending = { word: line.split(' ')[0], done: resolve, timer };
      s.write(`${line}\r\n`);
    });
  }
}

// --- The state XML ----------------------------------------------------------------------------

/** What the Bridge reads off vMix's state XML. `overlays` maps a channel to the NUMBER of the input
 *  on it, which is a position and moves, so it is resolved through `inputs` at once and never kept. */
export interface VmixXml {
  version: string;
  edition: string;
  inputs: VmixInput[];
  overlays: Map<number, number>;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function xmlDecode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

/** The part of the XML between `<tag>` and `</tag>`, or nothing. */
function section(xml: string, tag: string): string {
  const start = xml.indexOf(`<${tag}>`);
  const end = xml.indexOf(`</${tag}>`, start);
  return start < 0 || end < 0 ? '' : xml.slice(start + tag.length + 2, end);
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = xmlDecode(m[2]);
  return out;
}

/** vMix's state XML, or nothing when it is not one. Only `<input>` elements directly in `<inputs>`
 *  and `<overlay number>` elements in `<overlays>` count: an input's own layers are `<overlay
 *  index>` elements inside it. */
export function parseVmixXml(xml: string): VmixXml | undefined {
  const version = /<version>([^<]*)<\/version>/.exec(xml)?.[1];
  if (!/^\s*<vmix>/.test(xml) || version === undefined) return undefined;
  const edition = xmlDecode(/<edition>([^<]*)<\/edition>/.exec(xml)?.[1] ?? '');
  const inputs: VmixInput[] = [];
  for (const m of section(xml, 'inputs').matchAll(/<input\s([^>]*)>/g)) {
    const a = attributes(m[1]);
    const number = Number(a.number);
    if (a.key && Number.isInteger(number)) inputs.push({ key: a.key, number, title: a.title ?? '', type: a.type ?? '' });
  }
  const overlays = new Map<number, number>();
  for (const m of section(xml, 'overlays').matchAll(/<overlay\s([^>]*?)\/?>([^<]*)/g)) {
    const channel = Number(attributes(m[1]).number);
    const input = Number(m[2].trim());
    // `<overlay number="1" />` is an empty channel: no text follows it.
    if (Number.isInteger(channel) && m[2].trim() && Number.isInteger(input)) overlays.set(channel, input);
  }
  return { version: xmlDecode(version).trim(), edition: edition.trim(), inputs, overlays };
}

/** How many overlay channels this vMix's UI offers, the one place the rule lives: 8 from vMix 29,
 *  4 before it, and 1 on a Basic edition. The XML's own `<overlay>` count (16 on 29) is not it. Only
 *  vMix 29 Trial has been measured; the rest is vMix's published edition table. */
export function vmixOverlayCount(version: string, edition: string): number {
  if (/^basic/i.test(edition.trim())) return 1;
  return Number.parseInt(version, 10) >= 29 ? 8 : 4;
}
