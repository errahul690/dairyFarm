import { apiClient } from '../api/apiClient';

/**
 * @param {string} dateStr - YYYY-MM-DD
 */
export async function getOverridesForDate(dateStr) {
  const response = await apiClient.get(`/delivery-overrides?date=${encodeURIComponent(dateStr)}`);
  return Array.isArray(response) ? response : [];
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} customerMobile - 10 digits
 * @param {'cancelled'|'added'} type
 */
export async function setOverride(dateStr, customerMobile, type) {
  return await apiClient.post('/delivery-overrides', {
    date: dateStr,
    customerMobile: String(customerMobile).trim(),
    type,
  });
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} customerMobile - 10 digits
 * @param {'cancelled'|'added'} type
 */
export async function removeOverride(dateStr, customerMobile, type) {
  const q = new URLSearchParams({
    date: dateStr,
    customerMobile: String(customerMobile).trim(),
    type,
  });
  return await apiClient.delete(`/delivery-overrides?${q.toString()}`);
}
