import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const MEDIA_EXTENSIONS = new Set([
  '.aac', '.flac', '.m3u8', '.m4a', '.m4s', '.mkv', '.mov', '.mp3',
  '.mp4', '.mpd', '.ogg', '.opus', '.ts', '.wav', '.webm',
]);
const MANIFEST_EXTENSIONS = new Set(['.m3u8', '.mpd']);
const NOISE_RESOURCE_TYPES = new Set(['eventsource', 'font', 'image', 'ping', 'script', 'stylesheet', 'websocket']);
const VOLATILE_QUERY_KEY = /(?:^|[_-])(auth|authorization|bogus|cookie|credential|expire|expires|fp|key|nonce|secret|session|sign|signature|timestamp|token|verifyfp|webid)(?:$|[_-])|(?:auth|authorization|bogus|cookie|credential|expire|expires|nonce|secret|session|sign|signature|timestamp|token)$/iu;

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value;
}

function lowerCaseHeaders(value) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, headerValue]) => [key.toLowerCase(), String(headerValue)]));
}

async function readAllHeaders(message) {
  if (typeof message?.allHeaders === 'function') return lowerCaseHeaders(await message.allHeaders());
  if (typeof message?.headers === 'function') return lowerCaseHeaders(message.headers());
  return {};
}

function call(message, method, fallback = null) {
  try {
    return typeof message?.[method] === 'function' ? message[method]() : fallback;
  } catch {
    return fallback;
  }
}

function parsedUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function sanitizedUrl(value) {
  const url = parsedUrl(value);
  if (!url) return '<invalid-url>';
  const keys = [...new Set([...url.searchParams.keys()])].sort();
  const query = keys.length > 0
    ? `?${keys.map((key) => `${encodeURIComponent(key)}=<redacted>`).join('&')}`
    : '';
  return `${url.protocol}//${url.host}${url.pathname}${query}`;
}

function normalizedUrlKey(value) {
  const url = parsedUrl(value);
  if (!url) return '<invalid-url>';
  const parameters = [...url.searchParams.entries()]
    .map(([key, parameterValue]) => {
      const normalizedKey = key.toLowerCase();
      if (VOLATILE_QUERY_KEY.test(normalizedKey)) return [normalizedKey, null];
      const digest = createHash('sha256').update(parameterValue).digest('hex').slice(0, 12);
      return [normalizedKey, digest];
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || String(leftValue).localeCompare(String(rightValue))
    ));
  return JSON.stringify([url.protocol, url.host.toLowerCase(), url.pathname, parameters]);
}

function urlExtension(value) {
  const url = parsedUrl(value);
  return url ? extname(url.pathname).toLowerCase() : '';
}

function contentType(headers) {
  return (headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
}

function numericHeader(headers, name) {
  const value = Number.parseInt(headers[name] ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function bodyKindFor({ extension, mimeType }) {
  if (extension === '.m3u8' || mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'application/x-mpegurl') return 'm3u8';
  if (extension === '.mpd' || mimeType === 'application/dash+xml') return 'mpd';
  if (extension === '.json' || mimeType === 'application/json' || mimeType.endsWith('+json') || mimeType === 'text/json') return 'json';
  return null;
}

function sanitizeUrlReference(value) {
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//iu.test(value);
    const url = new URL(value, 'https://network-probe.invalid');
    const keys = [...new Set([...url.searchParams.keys()])].sort();
    const query = keys.length > 0
      ? `?${keys.map((key) => `${encodeURIComponent(key)}=<redacted>`).join('&')}`
      : '';
    return absolute ? `${url.protocol}//${url.host}${url.pathname}${query}` : `${url.pathname}${query}`;
  } catch {
    return '<redacted-url>';
  }
}

function sanitizeJsonValue(value, key = '') {
  if (VOLATILE_QUERY_KEY.test(key)) return '<redacted>';
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      sanitizeJsonValue(childValue, childKey),
    ]));
  }
  if (typeof value === 'string' && /^https?:\/\//iu.test(value)) return sanitizedUrl(value);
  if (typeof value === 'string' && /^(?:\/\/|\/|\.\.?\/).+\?/u.test(value)) return sanitizeUrlReference(value);
  if (typeof value === 'string' && /(?:^|[?&;])(auth|authorization|bogus|cookie|credential|expire|expires|key|nonce|secret|session|sign|signature|timestamp|token)=/iu.test(value)) {
    return value.replace(/(^|[?&;])([^=&;]+)=([^&;]*)/gu, (match, prefix, parameterKey) => (
      VOLATILE_QUERY_KEY.test(parameterKey) ? `${prefix}${parameterKey}=<redacted>` : match
    ));
  }
  return value;
}

function sanitizedDiagnosticBody(buffer, bodyKind) {
  const source = buffer.toString('utf8');
  if (bodyKind === 'json') {
    try {
      return Buffer.from(JSON.stringify(sanitizeJsonValue(JSON.parse(source))), 'utf8');
    } catch {
      return null;
    }
  }
  if (bodyKind === 'm3u8') {
    const sanitized = source.split(/(\r?\n)/u).map((line) => {
      if (/^#.*URI=/u.test(line)) {
        return line.replace(/URI=(['"])(.*?)\1/giu, (_match, quote, url) => `URI=${quote}${sanitizeUrlReference(url)}${quote}`);
      }
      if (line.startsWith('#') || line.trim() === '') return line;
      return sanitizeUrlReference(line.trim());
    }).join('');
    return Buffer.from(sanitized, 'utf8');
  }
  if (bodyKind === 'mpd') {
    const sanitized = source
      .replace(/https?:\/\/[^\s<'"]+/giu, (url) => sanitizedUrl(url))
      .replace(/=(['"])([^'"]+\?[^'"]*)\1/gu, (_match, quote, url) => `=${quote}${sanitizeUrlReference(url)}${quote}`)
      .replace(/>([^<]+\?[^<]+)</gu, (_match, url) => `>${sanitizeUrlReference(url.trim())}<`);
    return Buffer.from(sanitized, 'utf8');
  }
  return null;
}

export function classifyNetworkExchange({ request, response = null } = {}) {
  const requestHeaders = lowerCaseHeaders(request?.headers);
  const responseHeaders = lowerCaseHeaders(response?.headers);
  const extension = urlExtension(request?.url ?? '');
  const mimeType = contentType(responseHeaders);
  const resourceType = String(request?.resourceType ?? '').toLowerCase();
  const bodyKind = bodyKindFor({ extension, mimeType });
  const manifest = MANIFEST_EXTENSIONS.has(extension) || bodyKind === 'm3u8' || bodyKind === 'mpd';
  const explicitMedia = resourceType === 'media'
    || mimeType.startsWith('audio/')
    || mimeType.startsWith('video/')
    || manifest
    || (MEDIA_EXTENSIONS.has(extension) && resourceType !== 'script')
    || Boolean(responseHeaders['content-range'])
    || Boolean(requestHeaders.range);

  if (NOISE_RESOURCE_TYPES.has(resourceType) && !mimeType.startsWith('audio/') && !mimeType.startsWith('video/') && !manifest) {
    return Object.freeze({ priority: 'p3', category: resourceType || 'noise', bodyKind: null });
  }
  if (explicitMedia) return Object.freeze({ priority: 'p0', category: manifest ? 'manifest' : 'media', bodyKind });
  if (bodyKind === 'json') return Object.freeze({ priority: 'p1', category: 'descriptor', bodyKind });
  return Object.freeze({ priority: 'p2', category: resourceType || 'other', bodyKind: null });
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedObject(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function eventMethod(page, preferred, fallback) {
  if (typeof page?.[preferred] === 'function') return page[preferred].bind(page);
  if (typeof page?.[fallback] === 'function') return page[fallback].bind(page);
  throw new TypeError(`page.${preferred} is required`);
}

async function readBodyWithTimeout(response, timeoutMs) {
  let timer;
  const bodyResult = Promise.resolve()
    .then(() => response.body())
    .then(
      (body) => ({ status: 'fulfilled', body }),
      () => ({ status: 'rejected' }),
    );
  const timeoutResult = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
  });
  const result = await Promise.race([bodyResult, timeoutResult]);
  clearTimeout(timer);
  return result;
}

export class NetworkProbe {
  constructor({
    page,
    jobId,
    diagnosticPaths,
    clock = Date.now,
    maxTextBodyBytes = 1024 * 1024,
    bodyReadTimeoutMs = 5000,
    classify = classifyNetworkExchange,
  } = {}) {
    if (!page) throw new TypeError('page is required');
    requiredString(jobId, 'jobId');
    if (!diagnosticPaths?.job || !diagnosticPaths?.networkEvents || !diagnosticPaths?.bodies) {
      throw new TypeError('diagnosticPaths is invalid');
    }
    if (!Number.isInteger(maxTextBodyBytes) || maxTextBodyBytes <= 0) {
      throw new TypeError('maxTextBodyBytes must be a positive integer');
    }
    if (!Number.isInteger(bodyReadTimeoutMs) || bodyReadTimeoutMs <= 0) {
      throw new TypeError('bodyReadTimeoutMs must be a positive integer');
    }
    if (typeof classify !== 'function') throw new TypeError('classify must be a function');

    this.page = page;
    this.jobId = jobId;
    this.paths = diagnosticPaths;
    this.clock = clock;
    this.maxTextBodyBytes = maxTextBodyBytes;
    this.bodyReadTimeoutMs = bodyReadTimeoutMs;
    this.classify = classify;
    this.started = false;
    this.stopped = false;
    this.requestSequence = 0;
    this.candidateSequence = 0;
    this.descriptorSequence = 0;
    this.requests = new WeakMap();
    this.mediaByKey = new Map();
    this.descriptorsByKey = new Map();
    this.accessMaterial = new Map();
    this.pending = new Set();
    this.ordinary = new Map();
    this.ignored = new Map();
    this.failures = new Map();
    this.internalErrors = 0;
    this.onRequest = (request) => this.#onRequest(request);
    this.onResponse = (response) => this.#track(this.#onResponse(response));
    this.onRequestFailed = (request) => this.#track(this.#onRequestFailed(request));
  }

  #timestamp() {
    return new Date(this.clock()).toISOString();
  }

  #write(record) {
    appendFileSync(this.paths.networkEvents, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
  }

  #track(promise) {
    const tracked = Promise.resolve(promise)
      .catch(() => { this.internalErrors += 1; })
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  #requestState(request) {
    let state = this.requests.get(request);
    if (state) return state;
    const url = call(request, 'url', '');
    state = {
      id: `request-${String(++this.requestSequence).padStart(6, '0')}`,
      request,
      url,
      method: call(request, 'method', 'GET'),
      resourceType: call(request, 'resourceType', 'other'),
      requestHeaders: lowerCaseHeaders(call(request, 'headers', {})),
      startedAt: this.#timestamp(),
      handled: false,
    };
    this.requests.set(request, state);
    return state;
  }

  #onRequest(request) {
    this.#requestState(request);
  }

  #requestRecord(state) {
    const redirectedFrom = call(state.request, 'redirectedFrom');
    return {
      id: state.id,
      method: state.method,
      url: sanitizedUrl(state.url),
      resourceType: state.resourceType,
      range: state.requestHeaders.range ?? null,
      redirectedFrom: redirectedFrom ? sanitizedUrl(call(redirectedFrom, 'url', '')) : null,
      startedAt: state.startedAt,
    };
  }

  #storeAccessMaterial(id, material) {
    const existing = this.accessMaterial.get(id);
    if (existing && existing.requestId > material.requestId) return;
    this.accessMaterial.set(id, {
      ...material,
      rawBody: material.rawBody ?? existing?.rawBody ?? null,
    });
  }

  #responseRecord(response, responseHeaders) {
    return {
      status: call(response, 'status'),
      url: sanitizedUrl(call(response, 'url', '')),
      contentType: responseHeaders['content-type'] ?? null,
      contentLength: numericHeader(responseHeaders, 'content-length'),
      contentRange: responseHeaders['content-range'] ?? null,
      acceptRanges: responseHeaders['accept-ranges'] ?? null,
    };
  }

  async #captureBody({ response, responseHeaders, bodyKind, id }) {
    if (!bodyKind || typeof response?.body !== 'function') {
      return { diagnostic: { bodyRef: null, bodyCapture: 'not-applicable' }, rawBody: null };
    }
    const declaredBytes = numericHeader(responseHeaders, 'content-length');
    if (declaredBytes != null && declaredBytes > this.maxTextBodyBytes) {
      return { diagnostic: { bodyRef: null, bodyCapture: 'over-limit' }, rawBody: null };
    }
    if (declaredBytes == null && bodyKind === 'json') {
      return { diagnostic: { bodyRef: null, bodyCapture: 'unknown-size' }, rawBody: null };
    }
    const bodyResult = await readBodyWithTimeout(response, this.bodyReadTimeoutMs);
    if (bodyResult.status === 'timeout') {
      return { diagnostic: { bodyRef: null, bodyCapture: 'timeout' }, rawBody: null };
    }
    if (bodyResult.status === 'rejected') {
      return { diagnostic: { bodyRef: null, bodyCapture: 'unavailable' }, rawBody: null };
    }
    const body = bodyResult.body;
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    if (buffer.byteLength > this.maxTextBodyBytes) {
      return { diagnostic: { bodyRef: null, bodyCapture: 'over-limit' }, rawBody: null };
    }
    const diagnosticBody = sanitizedDiagnosticBody(buffer, bodyKind);
    if (!diagnosticBody) {
      return { diagnostic: { bodyRef: null, bodyCapture: 'not-safely-serializable' }, rawBody: buffer };
    }
    mkdirSync(this.paths.bodies, { recursive: true, mode: 0o700 });
    const bodyPath = join(this.paths.bodies, `${id}.${bodyKind}`);
    writeFileSync(bodyPath, diagnosticBody, { flag: 'wx', mode: 0o600 });
    return {
      diagnostic: {
        bodyRef: relative(this.paths.job, bodyPath),
        bodyCapture: 'captured-sanitized',
        bodyBytes: diagnosticBody.byteLength,
      },
      rawBody: buffer,
    };
  }

  async #onResponse(response) {
    const request = call(response, 'request');
    if (!request) return;
    const state = this.#requestState(request);
    if (state.handled) return;
    state.handled = true;
    const [requestHeaders, responseHeaders] = await Promise.all([
      readAllHeaders(request),
      readAllHeaders(response),
    ]);
    state.requestHeaders = requestHeaders;
    const classification = this.classify({
      request: { url: state.url, method: state.method, resourceType: state.resourceType, headers: requestHeaders },
      response: { status: call(response, 'status'), headers: responseHeaders },
    });
    const exchange = {
      request: this.#requestRecord(state),
      response: this.#responseRecord(response, responseHeaders),
      observedAt: this.#timestamp(),
    };
    const key = `${state.method}:${normalizedUrlKey(state.url)}:${classification.category}`;

    if (classification.priority === 'p0') {
      let candidate = this.mediaByKey.get(key);
      if (!candidate) {
        const id = `media-${String(++this.candidateSequence).padStart(4, '0')}`;
        candidate = {
          id,
          key,
          category: classification.category,
          count: 0,
          requestRanges: new Set(),
          contentRanges: new Set(),
          statuses: new Set(),
          firstExchange: exchange,
          body: { bodyRef: null, bodyCapture: 'pending' },
        };
        this.mediaByKey.set(key, candidate);
        const capturedBody = await this.#captureBody({ response, responseHeaders, bodyKind: classification.bodyKind, id });
        candidate.body = capturedBody.diagnostic;
        this.#write({
          type: 'media_candidate',
          priority: 'p0',
          candidateId: id,
          category: candidate.category,
          ...exchange,
          ...capturedBody.diagnostic,
        });
        this.#storeAccessMaterial(candidate.id, {
          requestId: state.id,
          request,
          response,
          url: state.url,
          method: state.method,
          requestHeaders,
          responseHeaders,
          rawBody: capturedBody.rawBody,
        });
      }
      candidate.count += 1;
      if (exchange.request.range) candidate.requestRanges.add(exchange.request.range);
      if (exchange.response.contentRange) candidate.contentRanges.add(exchange.response.contentRange);
      if (exchange.response.status != null) candidate.statuses.add(exchange.response.status);
      this.#storeAccessMaterial(candidate.id, {
        requestId: state.id,
        request,
        response,
        url: state.url,
        method: state.method,
        requestHeaders,
        responseHeaders,
        rawBody: null,
      });
      return;
    }

    if (classification.priority === 'p1') {
      let descriptor = this.descriptorsByKey.get(key);
      if (!descriptor) {
        const id = `descriptor-${String(++this.descriptorSequence).padStart(4, '0')}`;
        descriptor = { id, key, count: 0, body: { bodyRef: null, bodyCapture: 'pending' } };
        this.descriptorsByKey.set(key, descriptor);
        const capturedBody = await this.#captureBody({ response, responseHeaders, bodyKind: classification.bodyKind, id });
        descriptor.body = capturedBody.diagnostic;
        this.#write({
          type: 'resource_descriptor',
          priority: 'p1',
          descriptorId: id,
          ...exchange,
          ...capturedBody.diagnostic,
        });
        this.#storeAccessMaterial(descriptor.id, {
          requestId: state.id,
          request,
          response,
          url: state.url,
          method: state.method,
          requestHeaders,
          responseHeaders,
          rawBody: capturedBody.rawBody,
        });
      }
      descriptor.count += 1;
      this.#storeAccessMaterial(descriptor.id, {
        requestId: state.id,
        request,
        response,
        url: state.url,
        method: state.method,
        requestHeaders,
        responseHeaders,
        rawBody: null,
      });
      return;
    }

    const aggregationKey = `${classification.category}:${exchange.response.status ?? 'none'}`;
    increment(classification.priority === 'p3' ? this.ignored : this.ordinary, aggregationKey);
  }

  async #onRequestFailed(request) {
    const state = this.#requestState(request);
    if (state.handled) return;
    state.handled = true;
    const requestHeaders = await readAllHeaders(request);
    state.requestHeaders = requestHeaders;
    const classification = this.classify({
      request: { url: state.url, method: state.method, resourceType: state.resourceType, headers: requestHeaders },
      response: null,
    });
    const failure = call(request, 'failure') ?? {};
    const errorText = typeof failure?.errorText === 'string' ? failure.errorText : 'request_failed';
    increment(this.failures, `${classification.category}:${errorText}`);

    if (classification.priority !== 'p0') return;
    const key = `${state.method}:${normalizedUrlKey(state.url)}:${classification.category}`;
    let candidate = this.mediaByKey.get(key);
    if (!candidate) {
      const id = `media-${String(++this.candidateSequence).padStart(4, '0')}`;
      candidate = {
        id,
        key,
        category: classification.category,
        count: 0,
        requestRanges: new Set(),
        contentRanges: new Set(),
        statuses: new Set(),
        firstExchange: null,
        body: { bodyRef: null, bodyCapture: 'not-applicable' },
      };
      this.mediaByKey.set(key, candidate);
      this.#write({
        type: 'media_candidate',
        priority: 'p0',
        candidateId: id,
        category: candidate.category,
        request: this.#requestRecord(state),
        response: null,
        failure: { errorText },
        observedAt: this.#timestamp(),
      });
    }
    candidate.count += 1;
    if (state.requestHeaders.range) candidate.requestRanges.add(state.requestHeaders.range);
    this.#storeAccessMaterial(candidate.id, {
      requestId: state.id,
      request,
      response: null,
      url: state.url,
      method: state.method,
      requestHeaders,
      responseHeaders: {},
    });
  }

  start() {
    if (this.started) return this;
    mkdirSync(this.paths.job, { recursive: true, mode: 0o700 });
    writeFileSync(this.paths.networkEvents, '', { flag: 'w', mode: 0o600 });
    eventMethod(this.page, 'on', 'addListener')('request', this.onRequest);
    eventMethod(this.page, 'on', 'addListener')('response', this.onResponse);
    eventMethod(this.page, 'on', 'addListener')('requestfailed', this.onRequestFailed);
    this.started = true;
    this.#write({ type: 'network_probe_started', jobId: this.jobId, observedAt: this.#timestamp() });
    return this;
  }

  getMediaCandidates() {
    return [...this.mediaByKey.values()].map((candidate) => Object.freeze({
      id: candidate.id,
      category: candidate.category,
      count: candidate.count,
      request: candidate.firstExchange?.request ?? null,
      response: candidate.firstExchange?.response ?? null,
      bodyRef: candidate.body.bodyRef,
    }));
  }

  getResourceDescriptors() {
    return [...this.descriptorsByKey.values()].map((descriptor) => Object.freeze({
      id: descriptor.id,
      count: descriptor.count,
      bodyRef: descriptor.body.bodyRef,
      bodyCapture: descriptor.body.bodyCapture,
    }));
  }

  getAccessMaterial(candidateId) {
    return this.accessMaterial.get(requiredString(candidateId, 'candidateId')) ?? null;
  }

  async flush() {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
    return Object.freeze({
      mediaCandidates: this.getMediaCandidates(),
      resourceDescriptors: this.getResourceDescriptors(),
      internalErrors: this.internalErrors,
    });
  }

  async stop() {
    if (!this.started) throw new Error('NetworkProbe has not started');
    if (this.stopped) return this.summary;
    this.stopped = true;
    eventMethod(this.page, 'off', 'removeListener')('request', this.onRequest);
    eventMethod(this.page, 'off', 'removeListener')('response', this.onResponse);
    eventMethod(this.page, 'off', 'removeListener')('requestfailed', this.onRequestFailed);
    await this.flush();

    for (const candidate of this.mediaByKey.values()) {
      this.#write({
        type: 'media_candidate_summary',
        priority: 'p0',
        candidateId: candidate.id,
        requests: candidate.count,
        requestRanges: [...candidate.requestRanges],
        contentRanges: [...candidate.contentRanges],
        statuses: [...candidate.statuses],
      });
    }
    for (const descriptor of this.descriptorsByKey.values()) {
      this.#write({
        type: 'resource_descriptor_summary',
        priority: 'p1',
        descriptorId: descriptor.id,
        requests: descriptor.count,
      });
    }
    this.#write({
      type: 'network_traffic_summary',
      ordinary: sortedObject(this.ordinary),
      ignored: sortedObject(this.ignored),
      failures: sortedObject(this.failures),
      internalErrors: this.internalErrors,
      observedAt: this.#timestamp(),
    });
    this.#write({ type: 'network_probe_stopped', jobId: this.jobId, observedAt: this.#timestamp() });

    this.summary = Object.freeze({
      jobId: this.jobId,
      networkEvents: this.paths.networkEvents,
      mediaCandidates: this.mediaByKey.size,
      resourceDescriptors: this.descriptorsByKey.size,
      internalErrors: this.internalErrors,
    });
    return this.summary;
  }
}
