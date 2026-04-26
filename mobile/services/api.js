/**
 * Grocer-E API Service
 * Handles all communication with the backend API
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

/**
 * Request interceptor - add auth token if available
 */
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - handle errors
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config } = error;

    // Retry logic for network errors
    if (!config) {
      return Promise.reject(error);
    }

    config.retryCount = config.retryCount || 0;

    if (
      config.retryCount < MAX_RETRIES &&
      (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED')
    ) {
      config.retryCount += 1;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(apiClient(config));
        }, 1000 * config.retryCount);
      });
    }

    // Handle specific status codes
    if (error.response?.status === 401) {
      // Unauthorized - clear token and notify
      await AsyncStorage.removeItem('authToken');
      // You could dispatch a logout action here
    }

    return Promise.reject(error);
  }
);

/**
 * API Service Methods
 */
const api = {
  /**
   * Compare basket prices across nearby stores
   * POST /api/basket/compare
   */
  compareBasketPrices: async (data) => {
    try {
      const response = await apiClient.post('/api/basket/compare', {
        items: data.items,
        latitude: data.latitude,
        longitude: data.longitude,
        radius: data.radius || 5,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error comparing basket prices:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to compare prices',
        status: error.response?.status,
      };
    }
  },

  /**
   * Get nearby supermarkets
   * GET /api/basket/nearby
   */
  getNearbyStores: async (latitude, longitude, radius = 5) => {
    try {
      const response = await apiClient.get('/api/basket/nearby', {
        params: {
          latitude,
          longitude,
          radius,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error fetching nearby stores:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch nearby stores',
        status: error.response?.status,
      };
    }
  },

  /**
   * Get all supermarket chains
   * GET /api/basket/supermarkets
   */
  getSupermarkets: async () => {
    try {
      const response = await apiClient.get('/api/basket/supermarkets');

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error fetching supermarkets:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch supermarkets',
        status: error.response?.status,
      };
    }
  },

  /**
   * Add a new supermarket location (Admin)
   * POST /api/basket/add-store
   */
  addStore: async (storeData) => {
    try {
      const response = await apiClient.post('/api/basket/add-store', {
        name: storeData.name,
        chain_name: storeData.chain_name,
        latitude: storeData.latitude,
        longitude: storeData.longitude,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error adding store:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to add store',
        status: error.response?.status,
      };
    }
  },

  /**
   * Add or update product price (Admin)
   * POST /api/basket/add-price
   */
  addPrice: async (priceData) => {
    try {
      const response = await apiClient.post('/api/basket/add-price', {
        supermarket_id: priceData.supermarket_id,
        product_name: priceData.product_name,
        price: priceData.price,
        unit: priceData.unit || 'item',
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error adding price:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to add price',
        status: error.response?.status,
      };
    }
  },

  /**
   * Health check - verify API is running
   * GET /api/health
   */
  healthCheck: async () => {
    try {
      const response = await apiClient.get('/api/health');

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error checking API health:', error);
      return {
        success: false,
        error: 'API is unavailable',
        status: error.response?.status,
      };
    }
  },

  /**
   * Set authentication token
   */
  setAuthToken: async (token) => {
    try {
      await AsyncStorage.setItem('authToken', token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      console.error('Error setting auth token:', error);
    }
  },

  /**
   * Clear authentication token
   */
  clearAuthToken: async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      delete apiClient.defaults.headers.common['Authorization'];
    } catch (error) {
      console.error('Error clearing auth token:', error);
    }
  },
};

export default api;
