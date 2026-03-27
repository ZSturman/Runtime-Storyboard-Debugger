import { afterEach, describe, expect, it } from 'vitest';
import * as net from 'net';
import { startServer } from '../../../packages/core/src/server';

describe('startServer', () => {
  let occupiedServer: net.Server | undefined;

  afterEach(async () => {
    if (!occupiedServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      occupiedServer!.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });

    occupiedServer = undefined;
  });

  it('rejects with an actionable error when the port is already in use', async () => {
    occupiedServer = net.createServer();

    await new Promise<void>((resolve, reject) => {
      occupiedServer!.once('error', reject);
      occupiedServer!.listen(0, () => resolve());
    });

    const address = occupiedServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to allocate a test port');
    }

    await expect(
      startServer({
        targetDir: process.cwd(),
        port: address.port,
      }),
    ).rejects.toMatchObject({
      name: 'ServerStartupError',
      code: 'EADDRINUSE',
      port: address.port,
      message: `Port ${address.port} is already in use. Stop the process using it or rerun with --port <open-port>.`,
    });
  });
});