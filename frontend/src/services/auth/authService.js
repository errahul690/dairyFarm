/**
 * Authentication Service
 * Handle user login, signup, and authentication
 */

import { apiClient, setAuthToken, getAuthToken } from '../api/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_DATA_KEY = '@user_data';

export const authService = {
  login: async (emailOrMobile, password) => {
    const res = await apiClient.post('/auth/login', { emailOrMobile, password });
    if (res?.token) {
      await setAuthToken(res.token);
      // Save user data to AsyncStorage
      if (res.user) {
        try {
          await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(res.user));
          console.log('[authService] User data saved to storage');
        } catch (error) {
          console.error('[authService] Error saving user data:', error);
        }
      }
    }
    return res.user;
  },

  signup: async (
    name,
    email,
    password,
    mobile,
    gender,
    address,
    milkFixedPrice,
    dailyMilkQuantity,
    role,
    milkSource
  ) => {
    const emailValue = (email != null && String(email).trim()) ? String(email).trim() : '';
    const res = await apiClient.post('/auth/signup', {
      name,
      email: emailValue,
      password,
      mobile,
      gender,
      address,
      milkFixedPrice,
      dailyMilkQuantity,
      role,
      milkSource: (milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(milkSource)) ? milkSource : 'cow',
    });
    return res;
  },

  logout: async () => {
    await setAuthToken(null);
    try {
      await AsyncStorage.removeItem(USER_DATA_KEY);
      console.log('[authService] User data removed from storage');
    } catch (error) {
      console.error('[authService] Error removing user data:', error);
    }
  },

  getCurrentUser: async () => {
    try {
      const userData = await AsyncStorage.getItem(USER_DATA_KEY);
      if (userData) {
        return JSON.parse(userData);
      }
    } catch (error) {
      console.error('[authService] Error getting user data:', error);
    }
    return null;
  },

  checkAuthToken: async () => {
    const token = await getAuthToken();
    if (token) {
      return token;
    }
    return null;
  },

  forgotPassword: async (emailOrMobile) => {
    const res = await apiClient.post('/auth/forgot-password', { emailOrMobile });
    return res;
  },

  resetPassword: async (emailOrMobile, otp, newPassword) => {
    const res = await apiClient.post('/auth/reset-password', {
      emailOrMobile,
      otp,
      newPassword,
    });
    return res;
  },

  resendOtp: async (emailOrMobile) => {
    const res = await apiClient.post('/auth/resend-otp', { emailOrMobile });
    return res;
  },

  /**
   * Send OTP for login (uses same API as Forgot Password - sends OTP to registered mobile).
   * @param {string} mobile - 10-digit mobile number
   */
  sendOtpForLogin: async (mobile) => {
    const res = await apiClient.post('/auth/forgot-password', { emailOrMobile: mobile });
    return res;
  },

  /**
   * Login with OTP (verify OTP and get token - same OTP flow as forgot password).
   * @param {string} mobile - 10-digit mobile number
   * @param {string} otp - 4-digit OTP
   */
  loginWithOtp: async (mobile, otp) => {
    const res = await apiClient.post('/auth/verify-otp', { mobile, otp });
    if (res?.data?.token) {
      await setAuthToken(res.data.token);
      if (res.data.user) {
        try {
          await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(res.data.user));
        } catch (error) {
          console.error('[authService] Error saving user data:', error);
        }
      }
    }
    return res?.data?.user;
  },
};

