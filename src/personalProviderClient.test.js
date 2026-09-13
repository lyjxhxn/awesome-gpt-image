import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PERSONAL_PROVIDER,
  PERSONAL_PROVIDER_STORAGE_KEY,
  PROVIDER_OPENAI_COMPATIBLE,
  clearStoredPersonalProvider,
  getStoredPersonalProvider,
  isValidPersonalProvider,
  saveStoredPersonalProvider,
  submitPersonalProviderGeneration,
  verifyPersonalProvider
} from './personalProviderClient.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function compatibleConfig(overrides = {}) {
  return {
    provider: PROVIDER_OPENAI_COMPATIBLE,
    providerName: 'Example AI',
    baseUrl: 'https://images.example.com/v1/',
    model: 'example-image-model',
    apiKey: 'secret-example-key',
    ...overrides
  };
}

test('legacy APIMart keys no longer activate a provider', () => {
  const storage = new MemoryStorage();
  storage.setItem('gpt-image-2-apimart-key:v1', 'legacy-apimart-key');
  assert.deepEqual(getStoredPersonalProvider(storage), {
    ...DEFAULT_PERSONAL_PROVIDER
  });
});

test('custom provider configuration is normalized, stored, and cleared', () => {
  const storage = new MemoryStorage();
  assert.equal(saveStoredPersonalProvider(compatibleConfig(), storage), true);
  assert.equal(getStoredPersonalProvider(storage).baseUrl, 'https://images.example.com/v1');
  assert.ok(storage.getItem(PERSONAL_PROVIDER_STORAGE_KEY));
  clearStoredPersonalProvider(storage);
  assert.equal(storage.getItem(PERSONAL_PROVIDER_STORAGE_KEY), null);
});

test('custom providers require a safe URL, model, and key', () => {
  assert.equal(isValidPersonalProvider(compatibleConfig()), true);
  assert.equal(isValidPersonalProvider(compatibleConfig({ baseUrl: 'http://remote.example.com/v1' })), false);
  assert.equal(isValidPersonalProvider(compatibleConfig({ baseUrl: 'http://127.0.0.1:8000/v1' })), true);
  assert.equal(isValidPersonalProvider(compatibleConfig({ model: '' })), false);
});

test('verification calls the provider models endpoint with its key', async () => {
  const calls = [];
  await verifyPersonalProvider(compatibleConfig(), async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  assert.equal(calls[0].url, 'https://images.example.com/v1/models');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-example-key');
});

test('compatible image generation sends custom model and accepts base64 results', async () => {
  const calls = [];
  const result = await submitPersonalProviderGeneration('draw a fox', compatibleConfig(), 'en', async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: 'aW1hZ2U=' }] })
    };
  });
  assert.equal(calls[0].url, 'https://images.example.com/v1/images/generations');
  assert.deepEqual(calls[0].body, {
    model: 'example-image-model',
    prompt: 'draw a fox',
    n: 1,
    size: '1024x1024'
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.image, 'data:image/png;base64,aW1hZ2U=');
});
