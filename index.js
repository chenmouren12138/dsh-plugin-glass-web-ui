/**
 * Host half of @local/glass-liquid.
 *
 * The bundle is mostly a Client-side appearance plugin: the browser half
 * (client.js, wired by `dsh.client`) paints the liquid-glass layer and the
 * particle field, and styles shell surfaces through the supported
 * `theme.overrideTokens` API.
 *
 * The Host half registers nothing. It exists so the bundle has an inventory
 * entry, exported display metadata, and a Config schema that validates the row's
 * defaults.
 *
 * The native Windows caption (─ □ ✕) was attempted from here and cannot work:
 * this half runs in the standalone Node backend, so `electron` is not
 * resolvable. See README §"标题栏：实测结论" for the evidence chain.
 */

/**
 * `Config` must be a Standard Schema (v1): cordis resolves a plugin row's config
 * with `Config['~standard'].validate(...)`, and a plain JSON Schema object has no
 * `~standard` member — activation then fails with
 * `TypeError: Cannot read properties of undefined (reading 'validate')`.
 */

const NUMBER_FIELDS = {
  glow: { min: 0, max: 1, fallback: 0.5 },
  grid: { min: 0, max: 1, fallback: 0.16 },
  specular: { min: 0, max: 1, fallback: 0.3 },
  orbSpeed: { min: 8, max: 60, fallback: 26 },
  surface: { min: 0, max: 0.7, fallback: 0 },
  sub: { min: 1, max: 8, integer: true, fallback: 3 },
  dotSize: { min: 0.6, max: 3, fallback: 1 },
  dotAlpha: { min: 0.05, max: 1, fallback: 0.45 },
  radius: { min: 60, max: 320, fallback: 150 },
  push: { min: 0, max: 6, fallback: 2.5 },
  damping: { min: 0.8, max: 0.98, fallback: 0.98 },
};

const BOOLEAN_FIELDS = { pointer: { fallback: true }, titlebar: { fallback: true } };

const COLOUR_FIELDS = {
  accent: { fallback: '#7c5cff' },
  accent2: { fallback: '#22d3ee' },
  accent3: { fallback: '#ff5c8a' },
};

const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;

function issue(message, path) {
  return { message, path };
}

function validateOptions(raw) {
  const issues = [];
  const value = {};
  const input = raw === undefined || raw === null ? {} : raw;

  if (typeof input !== 'object' || Array.isArray(input)) {
    return [{}, [issue('expected an object', [])]];
  }

  const known = new Set([
    ...Object.keys(NUMBER_FIELDS),
    ...Object.keys(BOOLEAN_FIELDS),
    ...Object.keys(COLOUR_FIELDS),
  ]);
  for (const key of Object.keys(input)) {
    if (!known.has(key)) issues.push(issue(`unknown option "${key}"`, [key]));
  }

  for (const [key, rule] of Object.entries(NUMBER_FIELDS)) {
    const given = input[key];
    if (given === undefined) {
      value[key] = rule.fallback;
      continue;
    }
    if (typeof given !== 'number' || !Number.isFinite(given)) {
      issues.push(issue(`expected a number, received ${typeof given}`, [key]));
      value[key] = rule.fallback;
      continue;
    }
    if (given < rule.min || given > rule.max) {
      issues.push(issue(`expected ${rule.min}..${rule.max}, received ${given}`, [key]));
    }
    value[key] = rule.integer ? Math.round(given) : given;
  }

  for (const [key, rule] of Object.entries(COLOUR_FIELDS)) {
    const given = input[key];
    if (given === undefined) {
      value[key] = rule.fallback;
      continue;
    }
    if (typeof given !== 'string' || !COLOUR_PATTERN.test(given)) {
      issues.push(issue('expected a #rrggbb colour', [key]));
      value[key] = rule.fallback;
      continue;
    }
    value[key] = given;
  }

  for (const [key, rule] of Object.entries(BOOLEAN_FIELDS)) {
    const given = input[key];
    if (given === undefined) {
      value[key] = rule.fallback;
      continue;
    }
    if (typeof given !== 'boolean') {
      issues.push(issue(`expected a boolean, received ${typeof given}`, [key]));
      value[key] = rule.fallback;
      continue;
    }
    value[key] = given;
  }

  return [value, issues];
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-glass-liquid',
    validate(raw) {
      const [value, issues] = validateOptions(raw);
      return issues.length ? { issues } : { value };
    },
  },
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accent: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      accent2: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      accent3: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      glow: { type: 'number', minimum: 0, maximum: 1 },
      grid: { type: 'number', minimum: 0, maximum: 1 },
      specular: { type: 'number', minimum: 0, maximum: 1 },
      orbSpeed: { type: 'number', minimum: 8, maximum: 60 },
      surface: { type: 'number', minimum: 0, maximum: 0.7 },
      sub: { type: 'integer', minimum: 1, maximum: 8 },
      dotSize: { type: 'number', minimum: 0.6, maximum: 3 },
      dotAlpha: { type: 'number', minimum: 0.05, maximum: 1 },
      radius: { type: 'number', minimum: 60, maximum: 320 },
      push: { type: 'number', minimum: 0, maximum: 6 },
      damping: { type: 'number', minimum: 0.8, maximum: 0.98 },
      pointer: { type: 'boolean' },
      titlebar: { type: 'boolean' },
    },
  },
};

export function apply() {
  /*
   * The Host half registers nothing.
   *
   * The native Windows caption was attempted from here (an HTTP route calling
   * `BrowserWindow.setTitleBarOverlay`) and it cannot work: the dsh backend runs
   * as a standalone Node process, so `electron` is not resolvable in this half.
   * See README §"标题栏：实测结论" for the full evidence chain.
   */
}
