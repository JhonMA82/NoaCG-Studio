// The LOCAL-CONTROL bundle: everything an exported overlay package ships so core local
// playout and control work fully offline with no command-line setup — a tiny localhost
// relay (two stdlib implementations of ONE protocol, local-relay/relay.ps1 + relay.py),
// double-click launchers per OS, and the package manifest the shared controller reads.
// The launchers are the door: a student double-clicks one, the relay serves the package
// over http://localhost:<port>/ and opens the operator page; OBS/vMix browser sources
// point at the graphics on that address and the panel drives them through the relay's
// ordered log (BroadcastChannel can never cross into another browser engine).

import type JSZip from 'jszip';
import relayPs1 from './local-relay/relay.ps1?raw';
import relayPy from './local-relay/relay.py?raw';

/** The package manifest (protocol v1) — what the operator surface needs to know about the
 *  package without parsing HTML: which graphics exist, their files, their layers. */
export interface LocalControlPayload {
  v: 1;
  show: { name: string };
  graphics: { name: string; file: string; layer: number }[];
}

const LAUNCHER_CMD = `@echo off
rem NoaCG local controller launcher (Windows). Starts the bundled relay - it serves this
rem folder at http://localhost:<port>/ and opens the operator page. Keep the window open
rem while operating; Ctrl+C (or closing it) stops the relay.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0relay.ps1"
pause
`;

const LAUNCHER_POSIX = `#!/bin/sh
# NoaCG local controller launcher. Starts the bundled relay - it serves this folder at
# http://localhost:<port>/ and opens the operator page. Ctrl+C stops it.
cd "$(dirname "$0")"
exec python3 relay.py
`;

/** Write the relay + launchers + manifest into the package root. */
export function addLocalControlBundle(root: JSZip, payload: LocalControlPayload): void {
  root.file('relay.ps1', relayPs1);
  root.file('relay.py', relayPy);
  root.file('Start controller.cmd', LAUNCHER_CMD);
  root.file('start-controller.command', LAUNCHER_POSIX, { unixPermissions: 0o755 });
  root.file('start-controller.sh', LAUNCHER_POSIX, { unixPermissions: 0o755 });
  root.file('payload.json', JSON.stringify(payload, null, 2));
}
