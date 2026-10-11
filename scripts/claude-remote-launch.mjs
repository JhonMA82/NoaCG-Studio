// A short-lived launcher: only the native Claude process remains after this exits.
import { spawn } from 'node:child_process';
import { openSync, closeSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [executable, root, stateDir] = process.argv.slice(2);
const out = openSync(path.join(stateDir, 'stdout.log'), 'w');
const err = openSync(path.join(stateDir, 'stderr.log'), 'w');
const env = { ...process.env };
delete env.CLAUDECODE;
const server = spawn(executable, [
  'remote-control', '--spawn', 'worktree', '--no-create-session-in-dir', '--capacity', '4',
], { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
closeSync(out);
closeSync(err);
server.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.once('spawn', () => {
  try {
    writeFileSync(path.join(stateDir, 'launched.json'), JSON.stringify({ pid: server.pid }));
    server.unref();
  } catch (error) {
    server.kill();
    console.error(error.message);
    process.exitCode = 1;
  }
});
