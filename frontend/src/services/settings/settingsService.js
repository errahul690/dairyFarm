/**
 * Settings Service
 * UPI ID / name for payment QR (admin sets, buyer app reads)
 */

import { apiClient } from '../api/apiClient';

export const settingsService = {
  getUpi: async () => {
    const res = await apiClient.get('/settings/upi');
    return {
      upiId: res.upiId || '',
      upiName: res.upiName || 'Farm',
      qrImageBase64: res.qrImageBase64 || null,
    };
  },

  updateUpi: async ({ upiId, upiName }) => {
    const res = await apiClient.patch('/settings/upi', {
      upiId: upiId != null ? String(upiId).trim() : '',
      upiName: upiName != null ? String(upiName).trim() : 'Farm',
    });
    return { upiId: res.upiId || '', upiName: res.upiName || 'Farm' };
  },
};
