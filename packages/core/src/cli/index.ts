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
  .description('Discover entry points in a target directory and start the debug server')
  .argument('<target>', 'Path to the target application directory')
  .option('-p, --port <port>', 'Server port', '3001')
  .option('--ui <path>', 'Path to built UI directory')
  .action(async (target: string, opts: { port: string; ui?: string }) => {
    try {
      const targetDir = path.resolve(target);
      const port = parsePortOption(opts.port);

      console.log(`\nAnalyzing: ${targetDir}\n`);

      const entryPoints = await discoverEntryPoints(targetDir);
      console.log(`Found ${entryPoints.length} entry point(s):\n`);
      for (const ep of entryPoints) {
        console.log(`  [${ep.type}] ${ep.name}`);
        console.log(`    File: ${ep.file}:${ep.line}`);
        console.log(`    ${ep.description}\n`);
      }

      const uiDistPath = opts.ui
        ? path.resolve(opts.ui)
        : path.resolve(__dirname, '../../ui/dist');

      await startServer({ targetDir, port, uiDistPath });
    } catch (error) {
      reportCommandError(error);
    }
  });

program
  .command('run')
  .description('Instrument and run a scenario, then start the server with the storyboard')
  .argument('<target>', 'Path to the target application directory')
  .requiredOption('-s, --scenario <path>', 'Path to scenario file (relative to target)')
  .option('-p, --port <port>', 'Server port', '3001')
  .option('--ui <path>', 'Path to built UI directory')
  .action(async (target: string, opts: { scenario: string; port: string; ui?: string }) => {
    try {
      const targetDir = path.resolve(target);
      const port = parsePortOption(opts.port);

      console.log(`\nTarget: ${targetDir}`);
      console.log(`Scenario: ${opts.scenario}\n`);

      const uiDistPath = opts.ui
        ? path.resolve(opts.ui)
        : path.resolve(__dirname, '../../ui/dist');

      await startServer({ targetDir, port, uiDistPath });

      // Auto-run the scenario via the API
      const response = await fetch(`http://localhost:${port}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioPath: opts.scenario, targetDir }),
      });
      const data: any = await response.json();
      if (data.storyboard) {
        console.log(`Storyboard generated: ${data.storyboard.metadata.totalFrames} frames`);
        console.log(`View at: http://localhost:${port}\n`);
      } else {
        console.error('Failed to generate storyboard:', data.error);
      }
    } catch (err) {
      if (err instanceof ServerStartupError) {
        reportCommandError(err);
        return;
      }

      console.error('\nNote: Could not auto-run scenario. Use the UI to run scenarios manually.\n');
    }
  });

program.parse();
