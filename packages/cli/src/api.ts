import axios, { AxiosInstance, AxiosError } from 'axios';
import { getApiClient } from './config.js';

export function createApiClient(): AxiosInstance {
  const config = getApiClient();
  
  const client = axios.create({
    baseURL: config.url,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    }
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.data) {
        const data = error.response.data as any;
        const message = data.error?.error || data.error || data.message || error.message;
        const traceId = data.trace_id;
        
        if (traceId) {
          throw new Error(`[${error.response.status}] ${message} (trace: ${traceId})`);
        }
        throw new Error(`[${error.response.status}] ${message}`);
      }
      throw new Error(error.message);
    }
  );

  return client;
}
