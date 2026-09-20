function positiveDimension(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function dimensions(value, name) {
  if (!value) throw new TypeError(`${name} is required`);
  return Object.freeze({
    width: positiveDimension(value.width, `${name}.width`),
    height: positiveDimension(value.height, `${name}.height`),
  });
}

export function verifyExpectedVideo({ expectedVideo = null, actualVideo } = {}) {
  const actual = dimensions(actualVideo, 'actualVideo');
  if (expectedVideo == null) return Object.freeze({ matched: true, expected: null, actual });
  const expected = dimensions(expectedVideo, 'expectedVideo');
  if (actual.width !== expected.width || actual.height !== expected.height) {
    const error = new Error(
      `Selected quality was not applied: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}`,
    );
    error.code = 'quality_not_applied';
    error.expected = expected;
    error.actual = actual;
    throw error;
  }
  return Object.freeze({ matched: true, expected, actual });
}
