/**
 * Client-side baggage propagation for Vue / browser apps.
 *
 * Roles:
 *   originator — sets headers on all outgoing calls from configured session value
 *   forwarder  — reads incoming session (e.g. from a cookie or meta tag), propagates
 *   terminal   — no outgoing propagation
 *
 * Production safety:
 *   - In production builds (import.meta.env.PROD), defaultConfig() returns enabled:false.
 *   - Vite tree-shakes dead branches so interceptor registration is eliminated.
 *   - VITE_BAGGAGE_ENABLED must be "true" for the middleware to activate.
 */

// ---------------------------------------------------------------------------
// W3C Baggage codec
// ---------------------------------------------------------------------------

export function parseBaggage(header) {
  const entries = {}
  if (!header || !header.trim()) return entries
  for (const member of header.split(',')) {
    const trimmed = member.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    entries[trimmed.substring(0, eq).trim()] = trimmed.substring(eq + 1).trim()
  }
  return entries
}

export function mergeBaggage(existingHeader, key, value) {
  const entries = parseBaggage(existingHeader)
  entries[key] = value
  return serializeBaggage(entries)
}

export function serializeBaggage(entries) {
  return Object.entries(entries)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function createBaggageConfig(overrides = {}) {
  return {
    headerName: overrides.headerName || 'x-dev-session',
    baggageKey: overrides.baggageKey || 'dev-session',
    sessionValue: overrides.sessionValue || '',
    role: (overrides.role || 'originator').toLowerCase(),
    enabled: overrides.enabled ?? false,
  }
}

export function defaultConfig() {
  if (import.meta.env.PROD) return createBaggageConfig({ enabled: false })
  return createBaggageConfig({
    headerName: import.meta.env.VITE_BAGGAGE_HEADER_NAME,
    baggageKey: import.meta.env.VITE_BAGGAGE_KEY,
    sessionValue: import.meta.env.VITE_DEV_SESSION,
    role: import.meta.env.VITE_BAGGAGE_ROLE,
    enabled: import.meta.env.VITE_BAGGAGE_ENABLED === 'true',
  })
}

// ---------------------------------------------------------------------------
// fetch wrapper
// ---------------------------------------------------------------------------

export function createBaggageFetch(config, baseFetch = globalThis.fetch) {
  const resolvedConfig = config || defaultConfig()

  return function baggageFetch(url, options = {}) {
    if (!resolvedConfig.enabled) {
      return baseFetch(url, options)
    }

    const value = resolveOutgoing(resolvedConfig)
    if (!value) return baseFetch(url, options)

    const headers = new Headers(options.headers || {})
    headers.set(resolvedConfig.headerName, value)
    const existing = headers.get('baggage') || ''
    headers.set('baggage', mergeBaggage(existing, resolvedConfig.baggageKey, value))

    return baseFetch(url, { ...options, headers })
  }
}

// ---------------------------------------------------------------------------
// Axios request interceptor factory
// ---------------------------------------------------------------------------

export function createAxiosInterceptor(config) {
  const resolvedConfig = config || defaultConfig()

  return function baggageInterceptor(axiosConfig) {
    if (!resolvedConfig.enabled) return axiosConfig

    const value = resolveOutgoing(resolvedConfig)
    if (!value) return axiosConfig

    axiosConfig.headers = axiosConfig.headers || {}
    axiosConfig.headers[resolvedConfig.headerName] = value
    const existing = axiosConfig.headers['baggage'] || ''
    axiosConfig.headers['baggage'] = mergeBaggage(
      existing,
      resolvedConfig.baggageKey,
      value,
    )
    return axiosConfig
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function resolveOutgoing(config) {
  switch (config.role) {
    case 'originator':
      return config.sessionValue?.trim() || null
    case 'forwarder':
      return config.sessionValue?.trim() || null
    case 'terminal':
    default:
      return null
  }
}
