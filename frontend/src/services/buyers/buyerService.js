/**
 * Buyer Service
 * Handle buyer operations
 */

import { apiClient } from '../api/apiClient';

export const buyerService = {
  /** Current user's buyer profile (for role 2). */
  getMyProfile: async () => {
    const response = await apiClient.get('/buyers/me');
    return response;
  },

  /** @param {boolean} [activeOnly] - if true, only active buyers (for Sale / Quick Sale) */
  getBuyers: async (activeOnly = false) => {
    try {
      const url = activeOnly ? '/buyers?active=true' : '/buyers';
      const response = await apiClient.get(url);
      if (!Array.isArray(response)) {
        console.warn('[buyerService] Response is not an array:', response);
        return [];
      }
      return response.map((buyer) => ({
        ...buyer,
        id: buyer._id || buyer.id,
        userId: buyer.userId ? buyer.userId.toString() : (buyer._id || buyer.id),
      }));
    } catch (error) {
      console.error('[buyerService] Error fetching buyers:', error);
      return [];
    }
  },

  updateBuyerActive: async (buyerId, active) => {
    const id = typeof buyerId === 'string' ? buyerId : (buyerId?.toString?.() || buyerId);
    return await apiClient.patch(`/buyers/${id}`, { active: !!active });
  },

  /** Update buyer fields (e.g. deliveryDays, deliveryCycleDays, deliveryCycleStartDate, name, quantity, rate). */
  updateBuyer: async (buyerId, payload) => {
    const id = typeof buyerId === 'string' ? buyerId : (buyerId?.toString?.() || buyerId);
    return await apiClient.patch(`/buyers/${id}`, payload);
  },

  /**
   * Add existing seller as buyer (same person, no duplicate user).
   * @param {string} sellerId - Seller _id
   */
  addBuyerFromSeller: async (sellerId) => {
    const id = typeof sellerId === 'string' ? sellerId : (sellerId?.toString?.() || sellerId);
    const response = await apiClient.post(`/buyers/from-seller/${id}`);
    return response;
  },
};

