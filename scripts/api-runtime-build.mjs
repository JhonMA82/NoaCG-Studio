import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptsDir, '..');

const TEMP_PREFIX = path.join(projectRoot, '.tmp-api-runtime-');

function diagnosticHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => projectRoot,
    getNewLine: () => '\n',
  };
}

function throwOnDiagnostics(diagnostics) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, diagnosticHost()));
  }
}

/**
 * Emit selected API entrypoints as the JavaScript-only tree Vercel creates for Node functions.
 * TypeScript resolves source `.ts` files from `.js` specifiers, then preserves those Node-ready
 * specifiers in the emitted artifact.
 */
export async function buildApiRuntime(entrypoints) {
  const outputDir = await mkdtemp(TEMP_PREFIX);
  const configPath = path.join(projectRoot, 'tsconfig.api.json');

  try {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    throwOnDiagnostics(config.error ? [config.error] : []);

    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      projectRoot,
      {
        allowImportingTsExtensions: false,
        declaration: false,
        emitDeclarationOnly: false,
        incremental: false,
        noEmit: false,
        outDir: outputDir,
        sourceMap: false,
      },
      configPath,
    );
    throwOnDiagnostics(parsed.errors);

    const program = ts.createProgram({
      rootNames: entrypoints.map((entrypoint) => path.join(projectRoot, entrypoint)),
      options: parsed.options,
      projectReferences: parsed.projectReferences,
    });
    const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
    throwOnDiagnostics(preEmitDiagnostics);
    const emitResult = program.emit();
    throwOnDiagnostics(emitResult.diagnostics);
    if (emitResult.emitSkipped) throw new Error('TypeScript skipped the API runtime emit.');

    return {
      outputDir,
      async cleanup() {
        const resolved = path.resolve(outputDir);
        if (!resolved.startsWith(TEMP_PREFIX)) {
          throw new Error(`Refusing to remove unexpected API runtime path: ${resolved}`);
        }
        await rm(resolved, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
}

/** Build a child environment without inheriting provider credentials. */
export function isolatedTestEnvironment(extra = {}) {
  const environment = { NODE_ENV: 'test', ...extra };
  for (const name of ['ComSpec', 'PATH', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'WINDIR']) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
