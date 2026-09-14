import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './index.js';

async function withServer(run) {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('standalone server exposes liveness and a bounded 404 response', async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const missing = await fetch(`${baseUrl}/not-found`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { ok: false, error: 'NOT_FOUND' });
  });
});

test('standalone server registers every non-library API module', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/registration/complete`);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });
});

test('standalone server serves an OTP-only recovery email template', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth-templates/recovery.html`);
    assert.equal(response.status, 200);
    const template = await response.text();
    assert.match(template, /{{\s*\.Token\s*}}/);
    assert.doesNotMatch(template, /ConfirmationURL/);
  });
});
