import { validateExtractor } from './contracts.mjs';

export function createExtractorRegistry(extractors = []) {
  const registered = extractors.map(validateExtractor);
  const ids = new Set();
  for (const extractor of registered) {
    if (ids.has(extractor.id)) throw new TypeError(`duplicate extractor.id: ${extractor.id}`);
    ids.add(extractor.id);
  }

  return Object.freeze({
    list() {
      return registered.map(({ id, browserCapability }) => ({ id, browserCapability }));
    },
    match(url) {
      const matched = registered.filter((extractor) => extractor.matches(url));
      if (matched.length === 0) {
        const error = new Error('No extractor supports this URL');
        error.code = 'extractor_not_found';
        throw error;
      }
      if (matched.length > 1) {
        const error = new Error(`Multiple extractors support this URL: ${matched.map(({ id }) => id).join(', ')}`);
        error.code = 'extractor_ambiguous';
        throw error;
      }
      return matched[0];
    },
  });
}

