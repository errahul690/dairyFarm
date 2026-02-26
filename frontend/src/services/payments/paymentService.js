/**
 * Payment Service
 * Handle customer payment operations
 */

import { apiClient, API_BASE_URL } from '../api/apiClient';

export const paymentService = {
  /**
   * Get all payments (with optional filters)
   * @param {string} customerId - Optional customer ID filter
   * @param {string} customerMobile - Optional customer mobile filter
   * @returns {Promise<Array>}
   */
  getPayments: async (customerId = null, customerMobile = null, paymentDirection = null) => {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (customerMobile) params.append('customerMobile', customerMobile);
    if (paymentDirection) params.append('paymentDirection', paymentDirection);
    
    const queryString = params.toString();
    const url = queryString ? `/payments?${queryString}` : '/payments';
    const response = await apiClient.get(url);
    
    // Convert date strings to Date objects
    return response.map((payment) => ({
      ...payment,
      paymentDate: new Date(payment.paymentDate),
      createdAt: new Date(payment.createdAt),
      updatedAt: new Date(payment.updatedAt),
    }));
  },

  /**
   * Create a new payment
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>}
   */
  createPayment: async (paymentData) => {
    const payload = {
      customerId: paymentData.customerId,
      customerName: paymentData.customerName,
      customerMobile: paymentData.customerMobile,
      amount: paymentData.amount,
      paymentDate: paymentData.paymentDate.toISOString(),
      paymentType: paymentData.paymentType || 'cash',
      notes: paymentData.notes || '',
      referenceNumber: paymentData.referenceNumber || '',
    };
    if (paymentData.paymentDirection) payload.paymentDirection = paymentData.paymentDirection;
    
    const response = await apiClient.post('/payments', payload);
    return {
      ...response,
      paymentDate: new Date(response.paymentDate),
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    };
  },

  /**
   * Get a specific payment by ID
   * @param {string} paymentId
   * @returns {Promise<Object>}
   */
  getPayment: async (paymentId) => {
    const response = await apiClient.get(`/payments/${paymentId}`);
    return {
      ...response,
      paymentDate: new Date(response.paymentDate),
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    };
  },

  /**
   * Update a payment
   * @param {string} paymentId
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  updatePayment: async (paymentId, updates) => {
    const payload = { ...updates };
    if (payload.paymentDate) {
      payload.paymentDate = new Date(payload.paymentDate).toISOString();
    }
    
    const response = await apiClient.patch(`/payments/${paymentId}`, payload);
    return {
      ...response,
      paymentDate: new Date(response.paymentDate),
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    };
  },

  /**
   * Delete a payment
   * @param {string} paymentId
   * @returns {Promise<void>}
   */
  deletePayment: async (paymentId) => {
    await apiClient.delete(`/payments/${paymentId}`);
  },

  getSettlements: async (paymentDirection = null) => {
    const params = new URLSearchParams();
    if (paymentDirection) params.append('paymentDirection', paymentDirection);
    const query = params.toString();
    const url = query ? `/payments/settlements?${query}` : '/payments/settlements';
    const response = await apiClient.get(url);
    return (response || []).map((s) => ({
      ...s,
      settledAt: new Date(s.settledAt),
    }));
  },

  createSettlement: async (data) => {
    const response = await apiClient.post('/payments/settle', data);
    return { ...response, settledAt: new Date(response.settledAt) };
  },

  /**
   * Full URL for downloading cleared statement PDF (auth required via Bearer token).
   * @param {Object} options - Optional: { customerMobile } for single customer PDF
   * Use with react-native-blob-util fetch + react-native-share to download/share.
   */
  getClearedStatementPdfUrl: (options = {}) => {
    const base = `${API_BASE_URL}/payments/statement/cleared/pdf`;
    const params = new URLSearchParams();
    if (options?.customerMobile != null) params.append('customerMobile', String(options.customerMobile).trim());
    if (options?.paymentDirection) params.append('paymentDirection', options.paymentDirection);
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  },
};

