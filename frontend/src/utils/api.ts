import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const CACHE_PREFIX = 'api_cache_';
const CACHE_EXPIRY = 5 * 60 * 1000;

const cache: Map<string, { data: any; timestamp: number }> = new Map();

function getBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return envUrl;

  if (Platform.OS === 'web') {
    return 'http://localhost:8001';
  }

  try {
    const Constants = require('expo-constants');
    const hostUri = Constants.default?.expoConfig?.hostUri
      || Constants.default?.manifest?.debuggerHost
      || Constants.default?.manifest2?.extra?.expoGo?.debuggerHost;

    if (hostUri) {
      const host = hostUri.split(':')[0];
      return `http://${host}:8001`;
    }
  } catch {}

  return 'http://localhost:8001';
}

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  return headers;
}

function getCachedData(path: string): any | null {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    return cached.data;
  }
  cache.delete(path);
  return null;
}

function setCachedData(path: string, data: any): void {
  cache.set(path, { data, timestamp: Date.now() });
}

export const api = {
  get: async (path: string, useCache = true) => {
    if (useCache) {
      const cached = getCachedData(path);
      if (cached) return cached;
    }
    const headers = await getHeaders();
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/api${path}`, { headers });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    const data = await res.json();
    if (useCache) setCachedData(path, data);
    return data;
  },
  post: async (path: string, body: any) => {
    const headers = await getHeaders();
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json();
  },
  clearCache: () => cache.clear(),
  getCachedData,
};

export { getCachedData };
