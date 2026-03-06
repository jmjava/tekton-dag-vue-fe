/**
 * Re-export from the standalone @tekton-dag/baggage library.
 * This file exists for backward compatibility.
 */
export {
  parseBaggage,
  mergeBaggage,
  serializeBaggage,
  createBaggageConfig,
  defaultConfig,
  createBaggageFetch,
  createAxiosInterceptor,
} from '@tekton-dag/baggage'
