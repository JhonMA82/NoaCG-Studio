// The vMix adapter: the NoaCG output as a Web Browser input on one of vMix's overlay channels, over
// vMix's TCP API on this computer (docs/work-specs/bridge-vmix-adapter/spec.md).
//
// Put on air finds the output input by the name the Bridge gives it, `NoaCG <production title>`,
// adds it as a Web Browser input when there is none, and puts it on the channel by its KEY: an input's
// number is only its position and moves. Take off and Clear act only when that channel holds the
// output, because vMix's own `OverlayInput<N>Out` and `Off` take whatever the channel holds and ignore
// an `Input=` (measured on 29.0.0.49). Nothing here addresses Program, Preview, a transition or a
// setting.
//
// Honest results. vMix answers `FUNCTION OK Completed` to every function, even one it does not have
// or an input key it does not know, so an OK proves nothing: what matters is read back from the XML.
// A function that was sent and got no answer is `uncertain` and never sent again.

import type { AgentError, ItemRef, PlayoutAction, VmixInfo, VmixInput, VmixOverlayState, VmixSlot, VmixTarget } from '../protocol.js';
import { DEFAULT_VMIX_PORT, VmixConnection, parseVmixXml, vmixOverlayCount, type VmixXml } from '../vmixTcp.js';
import type { ActResult, AdapterResult, PlayoutAdapter } from './casparcg.js';

/** The time ONE verb may take, all its commands together, inside the page's 9 s for `/act`. */
const VMIX_TIMEOUT_MS = 7_000;
/** How long Put on air waits for an input it added to show in the XML. */
const ADDED_WAIT_MS = 3_000;
const ADDED_POLL_MS = 150;

/** vMix's word for a Web Browser input in its XML. */
const VMIX_BROWSER_TYPE = 'Browser';

/** The name the output input carries in vMix: what the operator sees on its button. */
export function outputInputName(title: string): string {
  return `NoaCG ${title}`;
}

/** One function line: its parameters URL-encoded, which vMix decodes. */
export function functionLine(name: string, params: Record<string, string> = {}): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `FUNCTION ${name}${query ? ` ${query}` : ''}`;
}

/** The vMix adapter: the protocol's verbs, the connection status and what each overlay holds. */
export interface VmixAdapter extends PlayoutAdapter<VmixTarget> {
  /** The port a target that names none reaches: 8099, or `--vmix-port`. */
  readonly port: number;
  status(target: VmixTarget): Promise<AdapterResult<{ version: string; vmix: VmixInfo }>>;
  overlays(target: VmixTarget): Promise<AdapterResult<VmixOverlayState[]>>;
  /** Close every connection, for a Bridge that stops. */
  close(): void;
}

const unsupported = (what: string): { ok: false; error: AgentError } => ({
  ok: false,
  error: { hop: 'agent', code: 'unsupported', detail: `vMix takes the NoaCG output and nothing else from the Bridge, so ${what} was not sent.` },
});
const usage = (detail: string): { ok: false; error: AgentError } => ({ ok: false, error: { hop: 'agent', code: 'usage', detail } });

/** The production's title from a url item, cleaned for an input name: one line, no control
 *  characters or lone surrogates (which could not be URL-encoded), at most 100 characters. */
export function titleOf(item: ItemRef | undefined): string | undefined {
  const clean = item?.label?.replace(/[\p{Cc}\p{Cf}\p{Cs}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const title = clean && Array.from(clean).slice(0, 100).join('').trim();
  return title || undefined;
}

/** What `/status` says of a vMix. */
function describe(xml: VmixXml): VmixInfo {
  return { version: xml.version, edition: xml.edition, overlays: vmixOverlayCount(xml.version, xml.edition), inputs: xml.inputs.length };
}

/** The input on an overlay channel, through the number the XML gives it. */
function onChannel(xml: VmixXml, overlay: number): VmixInput | undefined {
  const n = xml.overlays.get(overlay);
  return n === undefined ? undefined : xml.inputs.find((i) => i.number === n);
}

export function createVmixAdapter(options: { port?: number; timeoutMs?: number; greetingMs?: number; replyMs?: number } = {}): VmixAdapter {
  const defaultPort = options.port ?? DEFAULT_VMIX_PORT;
  const timeoutMs = options.timeoutMs ?? VMIX_TIMEOUT_MS;
  const connections = new Map<number, VmixConnection>();
  const portOf = (target: VmixTarget) => target.port ?? defaultPort;
  /** One action at a time per vMix: Put on air knows the input it added only as the one new key
   *  between two readings, which another action's AddInput must not fall between. */
  const turns = new Map<number, Promise<unknown>>();
  const exclusive = <T>(port: number, run: () => Promise<T>): Promise<T> => {
    const next = (turns.get(port) ?? Promise.resolve()).then(run, run);
    turns.set(port, next.catch(() => undefined));
    return next;
  };

  /** The one connection to this port, greeted, or the sentence that says why there is none. */
  async function session(target: VmixTarget): Promise<{ conn: VmixConnection } | { ok: false; error: AgentError }> {
    const port = portOf(target);
    let conn = connections.get(port);
    if (!conn) {
      conn = new VmixConnection(port, { greetingMs: options.greetingMs, replyMs: options.replyMs });
      connections.set(port, conn);
    }
    const r = await conn.open();
    if (r.ok) return { conn };
    const detail =
      r.setup === 'not-running'
        ? `vMix is not running on this computer: nothing answers on port ${port}. Start vMix.`
        : `Something on port ${port} is not vMix's TCP API (${r.why}).`;
    return { ok: false, error: { hop: 'target', code: 'unreachable', setup: r.setup, detail } };
  }

  async function read(conn: VmixConnection, until: number): Promise<AdapterResult<VmixXml> & { lost?: boolean }> {
    const r = await conn.command('XML', until);
    if (!r.ok) {
      const why = r.lost === 'timeout' ? 'no answer in time' : r.lost === 'late' ? 'no time left to ask' : 'the connection closed';
      const lost = r.lost === 'closed' || r.lost === 'not-sent';
      return { ok: false, lost, error: { hop: 'target', code: 'unreachable', detail: `vMix did not answer its state XML (${why}). Is it still running?` } };
    }
    const xml = r.body === undefined ? undefined : parseVmixXml(r.body);
    if (!xml) return { ok: false, error: { hop: 'target', code: 'refused', detail: 'vMix answered XML with something that is not its state.', raw: r.line } };
    return { ok: true, value: xml, raw: r.line };
  }

  /**
   * The connection and vMix's state as it is now: what every verb starts from. A read is safe to
   * repeat, so one that finds the kept connection already closed - vMix quit, or restarted, since
   * the last request - opens a new one and reads again, and reports why when there is none.
   */
  async function begin(target: VmixTarget, until: number): Promise<{ conn: VmixConnection; xml: VmixXml; raw: string } | { ok: false; error: AgentError }> {
    for (let attempt = 0; ; attempt += 1) {
      const s = await session(target);
      if (!('conn' in s)) return s;
      const xml = await read(s.conn, until);
      if (xml.ok) return { conn: s.conn, xml: xml.value, raw: xml.raw };
      if (!xml.lost || attempt > 0) return xml;
    }
  }

  /** One function, never repeated. vMix's OK is only that it read the line. */
  async function fn(conn: VmixConnection, name: string, params: Record<string, string> | undefined, until: number): Promise<AdapterResult<null>> {
    const r = await conn.command(functionLine(name, params), until);
    if (!r.ok) {
      if (r.lost === 'not-sent' || r.lost === 'late') return { ok: false, error: { hop: 'target', code: 'unreachable', detail: `vMix was not sent ${name}: the connection was gone or the time was up. Nothing changed.` } };
      return {
        ok: false,
        error: { hop: 'target', code: 'uncertain', detail: `vMix was sent ${name} and gave no answer (${r.lost === 'timeout' ? 'none in time' : 'the connection closed'}). It may have acted on it: look at vMix before trying again.` },
      };
    }
    if (r.status !== 'OK') return { ok: false, error: { hop: 'target', code: 'refused', detail: `vMix refused ${name}: ${r.line}.`, raw: r.line } };
    return { ok: true, value: null, raw: `${name} ${r.status}` };
  }

  return {
    id: 'vmix',
    port: defaultPort,

    capabilities() {
      return { lists: [], thumbnails: false, verbs: ['take', 'out', 'clear'], target: ['state'] };
    },

    async status(target) {
      const s = await begin(target, Date.now() + timeoutMs);
      if (!('conn' in s)) return s;
      const vmix = describe(s.xml);
      return { ok: true, value: { version: vmix.version, vmix }, raw: `VERSION OK ${vmix.version}; ${vmix.edition}, ${vmix.overlays} overlay channels, ${vmix.inputs} inputs` };
    },

    async overlays(target) {
      const s = await begin(target, Date.now() + timeoutMs);
      if (!('conn' in s)) return s;
      const count = vmixOverlayCount(s.xml.version, s.xml.edition);
      const value = Array.from({ length: count }, (_, i) => {
        const input = onChannel(s.xml, i + 1);
        return { overlay: i + 1, ...(input ? { input } : {}) };
      });
      return { ok: true, value, raw: s.raw };
    },

    async list() {
      return unsupported('a list');
    },

    async thumbnail() {
      return unsupported('a thumbnail');
    },

    async act(target, action: PlayoutAction) {
      // Everything vMix cannot do from here is refused before anything is sent: the cues play inside
      // the output, so the only things the Bridge puts on a channel are that page and nothing else.
      if (action.verb !== 'take' && action.verb !== 'out' && action.verb !== 'clear') return unsupported(`a ${action.verb}`);
      if (action.slot.adapter !== 'vmix') return usage('A vMix command needs a vmix slot.');
      const slot: VmixSlot = action.slot;
      const { item } = action;
      if (item && item.kind !== 'url') return unsupported(`a ${item.kind}`);
      if (action.verb === 'take' && (action.loop || action.playback)) return unsupported('a loop or a playback');
      const title = titleOf(item);
      if (!title) return usage(`${action.verb === 'take' ? 'Put on air' : 'Taking the output off'} names the production: the item's label is its title, which names the vMix input.`);
      const name = outputInputName(title);
      // `URL.canParse`, not `URL.parse`: the CLI runs on Node 20.
      if (action.verb === 'take' && !(URL.canParse(action.item.name) && /^https?:$/.test(new URL(action.item.name).protocol))) return usage('vMix loads the NoaCG output from an http or https address.');

      const until = Date.now() + timeoutMs;
      return exclusive(portOf(target), () => perform(target, action, slot, name, until));
    },

    close() {
      for (const c of connections.values()) c.close();
      connections.clear();
    },
  };

  /** A take, Out or Clear that passed every refusal, in its turn on this vMix. */
  async function perform(target: VmixTarget, action: Extract<PlayoutAction, { verb: 'take' | 'out' | 'clear' }>, slot: VmixSlot, name: string, until: number): Promise<ActResult> {
    const s = await begin(target, until);
    if (!('conn' in s)) return s;
    const { conn, xml: before } = s;
    const count = vmixOverlayCount(before.version, before.edition);
    if (slot.overlay > count) return usage(`This vMix offers overlay channels 1 to ${count}; there is no channel ${slot.overlay}.`);
    const named = before.inputs.filter((i) => i.title === name);

    if (action.verb === 'out' || action.verb === 'clear') {
      // Only the output itself is ever taken off. Anything else on the channel is the operator's.
      const holds = onChannel(before, slot.overlay);
      const output = holds && named.find((i) => i.key === holds.key);
      if (!output) {
        return { ok: true, value: {}, raw: `already off: overlay ${slot.overlay} holds ${holds ? `"${holds.title}"` : 'nothing'}` };
      }
      const verb = action.verb === 'out' ? 'Out' : 'Off';
      const sent = await fn(conn, `OverlayInput${slot.overlay}${verb}`, undefined, until);
      if (!sent.ok) return sent;
      return { ok: true, value: {}, raw: `${sent.raw} (${output.key})` };
    }

    // PUT ON AIR: the output input by its name, or a new Web Browser input given that name.
    if (named.length > 1) {
      return { ok: false, error: { hop: 'agent', code: 'refused', detail: `vMix has ${named.length} inputs named "${name}". Remove or rename all but one, then Put on air again.` } };
    }
    let output = named[0];
    if (output && output.type !== VMIX_BROWSER_TYPE) {
      return {
        ok: false,
        error: { hop: 'agent', code: 'refused', detail: `vMix already has an input named "${name}", and it is of type ${output.type}, not a Web Browser. Rename or remove it, then Put on air again.` },
      };
    }
    const step = output ? `reused ${output.key}` : undefined;
    if (!output) {
      const added = await fn(conn, 'AddInput', { Value: `Browser|${action.item.name}` }, until);
      if (!added.ok) return added;
      const known = new Set(before.inputs.map((i) => i.key));
      // The input shows in the XML once vMix has made it, which may be after its OK.
      const stop = Math.min(until, Date.now() + ADDED_WAIT_MS);
      let fresh: VmixInput[] = [];
      for (;;) {
        const after = await read(conn, until);
        if (!after.ok) {
          return { ok: false, error: { ...after.error, code: 'uncertain', detail: `vMix accepted adding the output and then could not be read back, so it may hold a new unnamed Web Browser input: look at vMix. ${after.error.detail}` } };
        }
        fresh = after.value.inputs.filter((i) => !known.has(i.key) && i.type === VMIX_BROWSER_TYPE);
        if (fresh.length || Date.now() + ADDED_POLL_MS >= stop) break;
        await new Promise((r) => setTimeout(r, ADDED_POLL_MS));
      }
      if (fresh.length !== 1) {
        return {
          ok: false,
          error: {
            hop: 'target',
            code: 'uncertain',
            detail: fresh.length
              ? `vMix added the output, and ${fresh.length} new Web Browser inputs appeared at once, so the Bridge cannot tell which is it. Nothing was put on air.`
              : 'vMix accepted adding the output, but no new Web Browser input appeared. Nothing was put on air: look at vMix.',
          },
        };
      }
      output = fresh[0];
      const renamed = await fn(conn, 'SetInputName', { Input: output.key, Value: name }, until);
      if (!renamed.ok) return { ok: false, error: { ...renamed.error, detail: `The output was added to vMix as an input (${output.key}) but not named "${name}": ${renamed.error.detail}` } };
    }
    const shown = await fn(conn, `OverlayInput${slot.overlay}In`, { Input: output.key }, until);
    if (!shown.ok) return shown;
    // vMix's OK says nothing; its XML says whether the channel holds the output now.
    const after = await read(conn, until);
    if (!after.ok) return { ok: false, error: { ...after.error, code: 'uncertain', detail: `vMix was sent the output's overlay In and then did not answer: ${after.error.detail}` } };
    const holds = onChannel(after.value, slot.overlay);
    if (holds?.key !== output.key) {
      return {
        ok: false,
        error: { hop: 'target', code: 'uncertain', detail: `vMix accepted putting "${name}" on overlay ${slot.overlay}, but the channel holds ${holds ? `"${holds.title}"` : 'nothing'}. Look at vMix.` },
      };
    }
    return { ok: true, value: {}, raw: `${step ?? `added ${output.key}`}; ${shown.raw}; overlay ${slot.overlay} holds it` };
  }
}
