// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Coerce any API/error shape into a safe, renderable string.
 *
 * FastAPI returns `detail` as a string for HTTPExceptions, but as an ARRAY of
 * `{type, loc, msg, input, url}` objects for 422 validation errors. Passing such
 * an object/array straight into JSX throws "Objects are not valid as a React child".
 * Always run error payloads through this before storing them in render state.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;

  // Axios-style error: err.response.data.detail | err.response.data
  const anyErr = err as any;
  const detail =
    anyErr?.response?.data?.detail ??
    anyErr?.response?.data ??
    anyErr?.detail ??
    anyErr?.message;

  return stringifyDetail(detail, fallback);
}

/** Normalize a FastAPI `detail` payload (string | object | array) to a string. */
export function stringifyDetail(detail: unknown, fallback = 'Something went wrong.'): string {
  if (detail == null) return fallback;
  if (typeof detail === 'string') return detail;

  // 422 validation errors: array of { msg, loc, ... }
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === 'string' ? d : d?.msg ?? null))
      .filter(Boolean);
    return msgs.length ? msgs.join('; ') : fallback;
  }

  // Single error object
  if (typeof detail === 'object') {
    const obj = detail as any;
    if (typeof obj.msg === 'string') return obj.msg;
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.message === 'string') return obj.message;
    try {
      return JSON.stringify(obj);
    } catch {
      return fallback;
    }
  }

  return String(detail);
}
