export interface JsonPathContext {
  payload?: Record<string, unknown>;
  results?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  [key: string]: unknown | undefined;
}

export function resolveJsonPath(path: string, context: JsonPathContext): string {
  if (!path.startsWith('$.')) {
    return path;
  }

  const pathWithoutPrefix = path.slice(2);
  const parts = pathWithoutPrefix.split('.');

  let value: unknown = context;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (value === null || value === undefined) {
      throw new Error(`Null value at path: ${path} (stopped at ${parts.slice(0, i).join('.')})`);
    }

    if (typeof value !== 'object') {
      throw new Error(`Cannot access property '${part}' on non-object at path: ${path}`);
    }

    const obj = value as Record<string, unknown>;

    if (!(part in obj)) {
      throw new Error(`Path not found: ${path} (missing '${part}')`);
    }

    value = obj[part];
  }

  if (value === null) {
    throw new Error(`Null value at path: ${path}`);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  throw new Error(`Invalid value type at path ${path}: expected string, got ${typeof value}`);
}
