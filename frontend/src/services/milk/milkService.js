/**
 * Milk Service
 * Handle milk sales and purchase operations
 */

import { apiClient } from '../api/apiClient';

export const milkService = {
  recordSale: async (transaction) => {
    const milkSource = (transaction.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(transaction.milkSource))
      ? transaction.milkSource
      : 'cow';
    const payload = {
      date: transaction.date.toISOString(),
      quantity: transaction.quantity,
      pricePerLiter: transaction.pricePerLiter,
      totalAmount: transaction.totalAmount,
      buyer: transaction.buyer,
      buyerPhone: transaction.buyerPhone,
      notes: transaction.notes,
      fixedPrice: transaction.fixedPrice,
      milkSource,
    };
    if (transaction.buyerId) payload.buyerId = typeof transaction.buyerId === 'string' ? transaction.buyerId : (transaction.buyerId._id || transaction.buyerId).toString();
    if (transaction.paymentType) payload.paymentType = transaction.paymentType;
    if (transaction.amountReceived != null) payload.amountReceived = transaction.amountReceived;
    const response = await apiClient.post('/milk/sale', payload);
    
    // Convert date string back to Date object
    return {
      ...response,
      date: new Date(response.date),
    };
  },

  recordPurchase: async (transaction) => {
    const payload = {
      date: transaction.date.toISOString(),
      quantity: transaction.quantity,
      pricePerLiter: transaction.pricePerLiter,
      totalAmount: transaction.totalAmount,
      seller: transaction.seller,
      sellerPhone: transaction.sellerPhone,
      notes: transaction.notes,
      milkSource: transaction.milkSource,
    };
    if (transaction.sellerId) payload.sellerId = typeof transaction.sellerId === 'string' ? transaction.sellerId : (transaction.sellerId._id || transaction.sellerId).toString();
    if (transaction.paymentType) payload.paymentType = transaction.paymentType;
    if (transaction.amountReceived != null) payload.amountReceived = transaction.amountReceived;
    const response = await apiClient.post('/milk/purchase', payload);
    
    // Convert date string back to Date object
    return {
      ...response,
      date: new Date(response.date),
    };
  },

  getTransactions: async (startDate = null, endDate = null, limit = null, skip = null, type = null) => {
    const params = new URLSearchParams();
    if (startDate) params.append('from', startDate instanceof Date ? startDate.toISOString() : String(startDate));
    if (endDate) params.append('to', endDate instanceof Date ? endDate.toISOString() : String(endDate));
    if (limit != null) params.append('limit', String(limit));
    if (skip != null) params.append('skip', String(skip));
    if (type) params.append('type', String(type));
    const qs = params.toString();
    const response = await apiClient.get(qs ? `/milk?${qs}` : '/milk');
    
    // Convert date strings back to Date objects
    return response.map((tx) => ({
      ...tx,
      date: new Date(tx.date),
    }));
  },

  updateTransaction: async (transactionId, transaction) => {
    // Validate transactionId
    if (!transactionId) {
      throw new Error('Transaction ID is required for update');
    }
    
    // Convert to string if it's an object (MongoDB ObjectId)
    const id = typeof transactionId === 'string' ? transactionId : (transactionId.toString ? transactionId.toString() : String(transactionId));
    
    console.log('[milkService] Updating transaction:', { id, transactionType: transaction.type });
    
    const payload = {
      date: transaction.date.toISOString(),
      quantity: transaction.quantity,
      pricePerLiter: transaction.pricePerLiter,
      totalAmount: transaction.totalAmount,
      notes: transaction.notes,
      milkSource: transaction.milkSource,
    };

    // Add buyer/seller fields based on transaction type
    if (transaction.type === 'sale') {
      payload.buyer = transaction.buyer;
      payload.buyerPhone = transaction.buyerPhone;
      if (transaction.buyerId) payload.buyerId = typeof transaction.buyerId === 'string' ? transaction.buyerId : (transaction.buyerId._id || transaction.buyerId).toString();
      if (transaction.fixedPrice) payload.fixedPrice = transaction.fixedPrice;
    } else {
      payload.seller = transaction.seller;
      payload.sellerPhone = transaction.sellerPhone;
      if (transaction.sellerId) payload.sellerId = typeof transaction.sellerId === 'string' ? transaction.sellerId : (transaction.sellerId._id || transaction.sellerId).toString();
    }
    
    if (transaction.paymentType) payload.paymentType = transaction.paymentType;
    if (transaction.amountReceived != null) payload.amountReceived = transaction.amountReceived;
    
    console.log('[milkService] Update payload:', payload);
    
    const response = await apiClient.patch(`/milk/${id}`, payload);
    
    // Convert date string back to Date object
    return {
      ...response,
      date: new Date(response.date),
    };
  },

  deleteTransaction: async (id) => {
    await apiClient.delete(`/milk/${id}`);
  },

  /**
   * Quick sale: record delivery for a buyer (default calendar day: today).
   * @param {string} buyerMobile - 10-digit buyer mobile
   * @param {number} [quantity] - optional; if omitted uses buyer's set daily quantity
   * @param {number} [pricePerLiter] - optional; if omitted uses buyer's set rate
   * @param {string} [milkSource] - optional; cow/buffalo/sheep/goat; if omitted uses buyer's default
   * @param {string|Date} [saleDate] - optional YYYY-MM-DD (IST calendar day) for the sale
   */
  quickSale: async (buyerMobile, quantity = null, pricePerLiter = null, milkSource = null, saleDate = null) => {
    const payload = { buyerMobile: String(buyerMobile).trim() };
    if (quantity != null && quantity > 0) payload.quantity = quantity;
    if (pricePerLiter != null && pricePerLiter >= 0) payload.pricePerLiter = pricePerLiter;
    if (milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(milkSource)) payload.milkSource = milkSource;
    if (saleDate != null && saleDate !== '') {
      const ymd =
        saleDate instanceof Date
          ? (() => {
              const y = saleDate.getFullYear();
              const m = String(saleDate.getMonth() + 1).padStart(2, '0');
              const d = String(saleDate.getDate()).padStart(2, '0');
              return `${y}-${m}-${d}`;
            })()
          : String(saleDate).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        payload.date = ymd;
      }
    }
    const response = await apiClient.post('/milk/quick-sale', payload);
    if (response && Array.isArray(response.transactions)) return response;
    return {
      ...response,
      date: new Date(response.date),
    };
  },

  /** Admin only: list milk requests from buyer app */
  getMilkRequests: async () => {
    const response = await apiClient.get('/milk/requests');
    return (response || []).map((tx) => ({
      ...tx,
      date: new Date(tx.date),
    }));
  },

  getUnpaidTransactions: async (customerMobile, customerId = null) => {
    const params = new URLSearchParams();
    if (customerMobile) params.append('customerMobile', customerMobile);
    if (customerId) params.append('customerId', customerId);
    
    const queryString = params.toString();
    const url = queryString ? `/milk/unpaid?${queryString}` : '/milk/unpaid';
    const response = await apiClient.get(url);
    
    // Convert date strings back to Date objects
    return response.map((tx) => ({
      ...tx,
      date: new Date(tx.date),
    }));
  },
};

