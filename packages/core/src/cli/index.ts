#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { ServerStartupError, startServer } from '../server';
import { discoverEntryPoints } from '../analyzer/entry-points';

const program = new Command();

function parsePortOption(rawPort: string): number {
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${rawPort}. Expected an integer between 1 and 65535.`);
  }

  return port;
}

function reportCommandError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}\n`);
  process.exitCode = 1;
}

program
  .name('rsd')
  .description('Runtime Storyboard Debugger — Turn codebase behavior into navigable causal stories')
  .version('0.1.0');

program
  .command('analyze')
  .description('Start the debug server and optionally preload a local workspace')
  .argument('[target]', 'Absolute or relative path to the target application directory. Relative paths are resolved from the directory where npm was invoked (INIT_CWD).')
  .option('-p, --port <port>', 'Server port', '3001')
  .option('--ui <path>', 'Path to built UI directory')
  .action(async (target: string | undefined, opts: { port: string; ui?: string }) => {
    try {
      const port = parsePortOption(opts.port);
      let targetDir: string | undefined;

      if (target) {
        targetDir = path.resolve(target);

        // When invoked via `npm run -w <pkg>`, the process cwd is the package directory,
        // but INIT_CWD is set to where npm was originally run (e.g., the workspace root).
        // Fall back to INIT_CWD so that relative paths like `../../examples/order-api` still
        // work even when the dev script omits the `../../` prefix.
        if (!require('fs').existsSync(targetDir) && process.env.INIT_CWD) {
          const fromInitCwd = path.resolve(process.env.INIT_CWD, target);
          if (require('fs').existsSync(fromInitCwd)) {
            console.log(`\nNote: "${target}" resolved relative to npm invocation directory.`);
            targetDir = fromInitCwd;
          }
        }

        console.log(`\nAnalyzing: ${targetDir}\n`);

        const entryPoints = await discoverEntryPoints(targetDir);
        console.log(`Found ${entryPoints.length} entry point(s):\n`);
        for (const ep of entryPoints) {
          console.log(`  [${ep.type}] ${ep.name}`);
          console.log(`    File: ${ep.file}:${ep.line}`);
          console.log(`    ${ep.description}\n`);
        }
      } else {
        console.log('\nStarting Runtime Storyboard Debugger without a preloaded workspace.\n');
      }

      const uiDistPath = opts.ui
        ? path.resolve(opts.ui)
        : path.resolve(__dirname, '../../ui/dist');

      await startServer({ targetDir: targetDir || process.cwd(), port, uiDistPath });
    } catch (error) {
      reportCommandError(error);
    }
  });

program.parse();
