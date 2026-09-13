export const PERSONAL_PROVIDER_STORAGE_KEY = 'gpt-image-2-personal-provider:v1';
export const PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible';

export const DEFAULT_PERSONAL_PROVIDER = Object.freeze({
  provider: PROVIDER_OPENAI_COMPATIBLE,
  providerName: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2',
  apiKey: ''
});

const LEGACY_APIMART_KEY = 'gpt-image-2-apimart-key:v1';

function browserStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function normalizePersonalProvider(config = {}) {
  return {
    provider: PROVIDER_OPENAI_COMPATIBLE,
    providerName: String(config.providerName || '').trim() || DEFAULT_PERSONAL_PROVIDER.providerName,
    baseUrl: normalizeBaseUrl(config.baseUrl === undefined ? DEFAULT_PERSONAL_PROVIDER.baseUrl : config.baseUrl),
    model: String(config.model === undefined ? DEFAULT_PERSONAL_PROVIDER.model : config.model).trim(),
    apiKey: String(config.apiKey || '').trim()
  };
}

export function isValidPersonalProvider(config) {
  const normalized = normalizePersonalProvider(config);
  if (!normalized.apiKey || normalized.apiKey.length > 512 || /[\r\n]/.test(normalized.apiKey)) return false;
  if (!normalized.model || normalized.model.length > 160 || /[\r\n]/.test(normalized.model)) return false;
  try {
    const url = new URL(normalized.baseUrl);
    return (url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname))
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function getStoredPersonalProvider(storage) {
  try {
    const saved = JSON.parse(browserStorage(storage)?.getItem(PERSONAL_PROVIDER_STORAGE_KEY) || 'null');
    if (saved && isValidPersonalProvider(saved)) return normalizePersonalProvider(saved);
  } catch {
    // Invalid or unavailable browser storage falls back to an empty configuration.
  }
  return { ...DEFAULT_PERSONAL_PROVIDER };
}

export function saveStoredPersonalProvider(config, storage) {
  const normalized = normalizePersonalProvider(config);
  if (!isValidPersonalProvider(normalized)) return false;
  try {
    browserStorage(storage)?.setItem(PERSONAL_PROVIDER_STORAGE_KEY, JSON.stringify(normalized));
    browserStorage(storage)?.removeItem(LEGACY_APIMART_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredPersonalProvider(storage) {
  try {
    browserStorage(storage)?.removeItem(PERSONAL_PROVIDER_STORAGE_KEY);
    browserStorage(storage)?.removeItem(LEGACY_APIMART_KEY);
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }
}

export function maskProviderKey(apiKey) {
  const normalized = String(apiKey || '').trim();
  return normalized ? `••••••••${normalized.slice(-4)}` : '';
}

function providerError(code, status = 0, upstreamMessage = '') {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.upstreamMessage = upstreamMessage;
  return error;
}

async function readResponse(response) {
  return response.json().catch(() => ({}));
}

function compatibleApiError(response, payload) {
  if (response.status === 401 || response.status === 403) {
    return providerError('PROVIDER_API_KEY_INVALID', response.status, payload?.error?.message);
  }
  if (response.status === 429) return providerError('PROVIDER_RATE_LIMITED', response.status, payload?.error?.message);
  if (response.status >= 500) return providerError('PROVIDER_UNAVAILABLE', response.status, payload?.error?.message);
  return providerError('PROVIDER_REQUEST_FAILED', response.status, payload?.error?.message);
}

export async function verifyPersonalProvider(config, fetchImpl = fetch) {
  const normalized = normalizePersonalProvider(config);
  if (!isValidPersonalProvider(normalized)) throw providerError('PROVIDER_CONFIG_INVALID');
  let response;
  try {
    response = await fetchImpl(`${normalized.baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${normalized.apiKey}`,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
  } catch (error) {
    throw providerError('PROVIDER_CONNECTION_FAILED', 0, error?.message);
  }
  const payload = await readResponse(response);
  if (!response.ok) throw compatibleApiError(response, payload);
  return true;
}

function extractCompatibleImage(payload) {
  const item = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (item?.url) return String(item.url);
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

export async function submitPersonalProviderGeneration(prompt, config, _language, fetchImpl = fetch) {
  const normalized = normalizePersonalProvider(config);
  if (!isValidPersonalProvider(normalized)) throw providerError('PROVIDER_CONFIG_INVALID');
  let response;
  try {
    response = await fetchImpl(`${normalized.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalized.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: normalized.model,
        prompt: String(prompt || '').trim(),
        n: 1,
        size: '1024x1024'
      }),
      cache: 'no-store'
    });
  } catch (error) {
    throw providerError('PROVIDER_CONNECTION_FAILED', 0, error?.message);
  }
  const payload = await readResponse(response);
  if (!response.ok) throw compatibleApiError(response, payload);
  const image = extractCompatibleImage(payload);
  if (!image) throw providerError('PROVIDER_INVALID_RESPONSE', response.status);
  return { status: 'completed', image, taskId: '', cost: null, expiresAt: null };
}
