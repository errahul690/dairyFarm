/**
 * API Client
 * Base configuration for API calls
 */

import { API_BASE_URL as ENV_API_BASE_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (!ENV_API_BASE_URL || typeof ENV_API_BASE_URL !== 'string' || !ENV_API_BASE_URL.trim()) {
  throw new Error('API_BASE_URL is not set. Define it in frontend/.env');
}
const API_BASE_URL = ENV_API_BASE_URL.trim();
console.log('[apiClient] Using API_BASE_URL:', API_BASE_URL);

const AUTH_TOKEN_KEY = '@auth_token';

let authToken = null;
let onTokenExpiredCallback = null;

// Set callback to handle token expiry
export function setOnTokenExpired(callback) {
  onTokenExpiredCallback = callback;
}

// Initialize token from storage (called lazily to avoid issues if AsyncStorage isn't ready)
async function initializeTokenFromStorage() {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      authToken = token;
      console.log('[apiClient] Token loaded from storage');
    }
  } catch (error) {
    console.error('[apiClient] Error loading token from storage:', error);
  }
}

// Initialize token on module load, but handle errors gracefully
initializeTokenFromStorage().catch((error) => {
  console.error('[apiClient] Error initializing token:', error);
});

export async function setAuthToken(token) {
  authToken = token;
  if (token) {
    try {
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      console.log('[apiClient] Token saved to storage');
    } catch (error) {
      console.error('[apiClient] Error saving token to storage:', error);
    }
  } else {
    try {
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      console.log('[apiClient] Token removed from storage');
    } catch (error) {
      console.error('[apiClient] Error removing token from storage:', error);
    }
  }
}

export async function getAuthToken() {
  if (!authToken) {
    try {
      authToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('[apiClient] Error getting token from storage:', error);
    }
  }
  return authToken;
}

/**
 * Sanitize sensitive data before logging
 * Removes passwords and other sensitive fields
 */
function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sensitiveFields = ['password', 'confirmPassword', 'oldPassword', 'newPassword'];
  const sanitized = { ...data };
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***HIDDEN***';
    }
  });
  
  return sanitized;
}

async function request(method, endpoint, data) {
  // Ensure we have the latest token from storage
  if (!authToken) {
    authToken = await getAuthToken();
  }
  
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const url = `${API_BASE_URL}${endpoint}`;
  const sanitizedData = sanitizeForLogging(data);
  console.log(`[apiClient] ${method} ${url}`, { hasToken: !!authToken, data: sanitizedData });
  
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
    
    const text = await res.text();
    console.log(`[apiClient] Response status: ${res.status}`, { text: text.substring(0, 200) });
    
    const json = text ? JSON.parse(text) : null;
    
    
    if (!res.ok) {
      if (res.status === 401) {
        const errorMessage = json?.error || json?.message || 'Unauthorized';
        if (errorMessage.toLowerCase().includes('token expired') || errorMessage.toLowerCase().includes('expired')) {
          console.log('[apiClient] Token expired, clearing authentication');
          // Clear token and user data
          await setAuthToken(null);
          // Notify App.jsx to redirect to login
          if (onTokenExpiredCallback) {
            onTokenExpiredCallback();
          }
          throw new Error('Your session has expired. Please login again.');
        } else if (errorMessage.toLowerCase().includes('unauthorized') || errorMessage.toLowerCase().includes('invalid token')) {
          // Invalid token, clear it
          console.log('[apiClient] Invalid token, clearing authentication');
          await setAuthToken(null);
          if (onTokenExpiredCallback) {
            onTokenExpiredCallback();
          }
        }
      }
      
      // Try to extract detailed error message
      let errorMessage = 'Request failed';
      if (json?.error) {
        if (typeof json.error === 'string') {
          errorMessage = json.error;
        } else if (json.error?.message) {
          errorMessage = json.error.message;
        } else if (json.error?.fieldErrors) {
          // Format validation errors
          const fieldErrors = Object.entries(json.error.fieldErrors)
            .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
            .join('\n');
          errorMessage = fieldErrors || json.error.message || 'Validation failed';
        }
      } else if (json?.message) {
        errorMessage = json.message;
      } else {
        errorMessage = res.statusText || 'Request failed';
      }
      console.error(`[apiClient] Request failed:`, { status: res.status, message: errorMessage, json });
      throw new Error(errorMessage);
    }
    
    return json;
  } catch (error) {
    console.error(`[apiClient] Request error:`, error);
    throw error;
  }
}

export const apiClient = {
  get: async (endpoint) => {
    return request('GET', endpoint);
  },
  post: async (endpoint, data) => {
    return request('POST', endpoint, data);
  },
  put: async (endpoint, data) => {
    return request('PUT', endpoint, data);
  },
  patch: async (endpoint, data) => {
    return request('PATCH', endpoint, data);
  },
  delete: async (endpoint) => {
    return request('DELETE', endpoint);
  },
};

export { API_BASE_URL };
