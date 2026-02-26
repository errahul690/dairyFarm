/**
 * Seller Service
 * Handle seller operations
 */

import { apiClient } from '../api/apiClient';

export const sellerService = {
  getSellers: async () => {
    try {
      const response = await apiClient.get('/sellers');
      console.log('[sellerService] Raw response:', response);
      console.log('[sellerService] Response type:', typeof response);
      console.log('[sellerService] Is array:', Array.isArray(response));
      
      // Ensure response is an array
      if (Array.isArray(response)) {
        const sellers = response.map((seller) => ({
          ...seller,
          id: seller._id || seller.id,
        }));
        console.log('[sellerService] Mapped sellers:', sellers);
        return sellers;
      }
      
      // If response is not an array, try to handle it
      if (response && typeof response === 'object') {
        console.warn('[sellerService] Response is object, not array:', response);
        // If it's a single seller object, wrap it in array
        if (response._id || response.id) {
          return [{
            ...response,
            id: response._id || response.id,
          }];
        }
      }
      
      console.warn('[sellerService] Response is not an array, returning empty:', response);
      return [];
    } catch (error) {
      // If endpoint doesn't exist (404) or other errors, return empty array
      console.error('[sellerService] Error fetching sellers:', error?.message || error);
      console.error('[sellerService] Full error:', error);
      return [];
    }
  },

  /**
   * Add existing buyer as seller (same person, no duplicate user).
   * @param {string} buyerId - Buyer _id
   */
  addSellerFromBuyer: async (buyerId) => {
    const id = typeof buyerId === 'string' ? buyerId : (buyerId?.toString?.() || buyerId);
    const response = await apiClient.post(`/sellers/from-buyer/${id}`);
    return response;
  },
};
