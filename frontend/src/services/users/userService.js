/**
 * User Service
 * Handle user-related operations
 */

import { apiClient } from '../api/apiClient';

export const userService = {
  /**
   * Get users by role
   * @param {number} role - User role (0 = Super Admin, 1 = Admin, 2 = Consumer)
   * @returns {Promise<Array>}
   */
  getUsersByRole: async (role) => {
    try {
      console.log('[userService] Fetching users with role:', role);
      const response = await apiClient.get(`/users?role=${role}`);
      console.log('[userService] API response:', response);
      console.log('[userService] Response type:', typeof response);
      console.log('[userService] Is array:', Array.isArray(response));
      
      // Handle different response formats
      if (Array.isArray(response)) {
        console.log(`[userService] Returning ${response.length} users`);
        return response;
      } else if (response && Array.isArray(response.data)) {
        console.log(`[userService] Returning ${response.data.length} users from data field`);
        return response.data;
      } else if (response && response.users && Array.isArray(response.users)) {
        console.log(`[userService] Returning ${response.users.length} users from users field`);
        return response.users;
      } else {
        console.warn('[userService] Unexpected response format:', response);
        return [];
      }
    } catch (error) {
      console.error('[userService] Error fetching users:', error);
      console.error('[userService] Error details:', {
        message: error.message,
        response: error.response,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack,
      });
      // Return empty array instead of throwing to allow graceful degradation
      return [];
    }
  },

  /**
   * Update user (only admin/super_admin should call)
   * @param {string} userId
   * @param {Object} data - name?, email?, mobile?, address?, isActive?, milkFixedPrice?, dailyMilkQuantity?
   */
  updateUser: async (userId, data) => {
    const response = await apiClient.patch(`/users/${userId}`, data);
    return response;
  },

  /**
   * Create admin (only admin/super_admin can call)
   * @param {Object} data - name, mobile, password, email?, address?, gender?
   */
  createAdmin: async (data) => {
    const response = await apiClient.post("/users/admin", data);
    return response;
  },
};

