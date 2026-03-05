import { describe, it, expect, vi } from 'vitest'
import {
  parseBaggage,
  mergeBaggage,
  serializeBaggage,
  createBaggageConfig,
  createBaggageFetch,
  createAxiosInterceptor,
} from '../baggage.js'

// ---------------------------------------------------------------------------
// W3C Baggage codec
// ---------------------------------------------------------------------------

describe('W3C Baggage codec', () => {
  it('parses null and empty', () => {
    expect(parseBaggage(null)).toEqual({})
    expect(parseBaggage('')).toEqual({})
    expect(parseBaggage('  ')).toEqual({})
  })

  it('parses single entry', () => {
    expect(parseBaggage('dev-session=abc')).toEqual({ 'dev-session': 'abc' })
  })

  it('parses multiple entries', () => {
    const result = parseBaggage('k1=v1,k2=v2,k3=v3')
    expect(result).toEqual({ k1: 'v1', k2: 'v2', k3: 'v3' })
  })

  it('preserves entry properties', () => {
    const result = parseBaggage('k1=v1;prop=pval,k2=v2')
    expect(result.k1).toBe('v1;prop=pval')
  })

  it('merges new entry', () => {
    const result = mergeBaggage('k1=v1', 'dev-session', 'abc')
    expect(result).toContain('k1=v1')
    expect(result).toContain('dev-session=abc')
  })

  it('replaces existing entry', () => {
    const result = mergeBaggage('dev-session=old,k1=v1', 'dev-session', 'new')
    expect(result).toContain('dev-session=new')
    expect(result).not.toContain('=old')
  })

  it('merges on empty', () => {
    expect(mergeBaggage(null, 'dev-session', 'abc')).toBe('dev-session=abc')
  })

  it('round-trips', () => {
    const original = 'k1=v1,k2=v2'
    expect(serializeBaggage(parseBaggage(original))).toBe(original)
  })
})

// ---------------------------------------------------------------------------
// createBaggageFetch
// ---------------------------------------------------------------------------

describe('createBaggageFetch', () => {
  it('originator sets headers on outgoing fetch', async () => {
    const config = createBaggageConfig({
      enabled: true,
      role: 'originator',
      sessionValue: 'my-session',
    })

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    const baggageFetch = createBaggageFetch(config, mockFetch)

    await baggageFetch('http://api/test')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, options] = mockFetch.mock.calls[0]
    const headers = new Headers(options.headers)
    expect(headers.get('x-dev-session')).toBe('my-session')
    expect(headers.get('baggage')).toContain('dev-session=my-session')
  })

  it('terminal never sets headers', async () => {
    const config = createBaggageConfig({
      enabled: true,
      role: 'terminal',
      sessionValue: 'should-not',
    })

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    const baggageFetch = createBaggageFetch(config, mockFetch)

    await baggageFetch('http://api/test')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, options] = mockFetch.mock.calls[0]
    const headers = new Headers(options?.headers || {})
    expect(headers.get('x-dev-session')).toBeNull()
    expect(headers.get('baggage')).toBeNull()
  })

  it('disabled config passes through without headers', async () => {
    const config = createBaggageConfig({
      enabled: false,
      role: 'originator',
      sessionValue: 'ignored',
    })

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    const baggageFetch = createBaggageFetch(config, mockFetch)

    await baggageFetch('http://api/test', { headers: { Accept: 'text/plain' } })

    const [, options] = mockFetch.mock.calls[0]
    expect(new Headers(options.headers).get('x-dev-session')).toBeNull()
  })

  it('merges with existing baggage header', async () => {
    const config = createBaggageConfig({
      enabled: true,
      role: 'originator',
      sessionValue: 'sess',
    })

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    const baggageFetch = createBaggageFetch(config, mockFetch)

    await baggageFetch('http://api/test', {
      headers: { baggage: 'traceId=abc' },
    })

    const [, options] = mockFetch.mock.calls[0]
    const headers = new Headers(options.headers)
    const baggage = headers.get('baggage')
    expect(baggage).toContain('traceId=abc')
    expect(baggage).toContain('dev-session=sess')
  })
})

// ---------------------------------------------------------------------------
// createAxiosInterceptor
// ---------------------------------------------------------------------------

describe('createAxiosInterceptor', () => {
  it('originator adds headers to axios config', () => {
    const config = createBaggageConfig({
      enabled: true,
      role: 'originator',
      sessionValue: 'ax-session',
    })

    const interceptor = createAxiosInterceptor(config)
    const axConfig = interceptor({ headers: {} })

    expect(axConfig.headers['x-dev-session']).toBe('ax-session')
    expect(axConfig.headers.baggage).toContain('dev-session=ax-session')
  })

  it('terminal leaves axios config unchanged', () => {
    const config = createBaggageConfig({
      enabled: true,
      role: 'terminal',
    })

    const interceptor = createAxiosInterceptor(config)
    const axConfig = interceptor({ headers: {} })

    expect(axConfig.headers['x-dev-session']).toBeUndefined()
  })

  it('disabled interceptor is no-op', () => {
    const config = createBaggageConfig({
      enabled: false,
      role: 'originator',
      sessionValue: 'nope',
    })

    const interceptor = createAxiosInterceptor(config)
    const axConfig = interceptor({ url: '/api', headers: {} })

    expect(axConfig.headers['x-dev-session']).toBeUndefined()
  })
})
