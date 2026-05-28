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
 * @param {'morning'|'evening'|'both'} [deliveryShift] — default both (whole day)
 */
export async function setOverride(dateStr, customerMobile, type, deliveryShift = 'both') {
  return await apiClient.post('/delivery-overrides', {
    date: dateStr,
    customerMobile: String(customerMobile).trim(),
    type,
    deliveryShift,
  });
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} customerMobile - 10 digits
 * @param {'cancelled'|'added'} type
 * @param {'morning'|'evening'|'both'} [deliveryShift] — default both
 */
export async function removeOverride(dateStr, customerMobile, type, deliveryShift = 'both') {
  const q = new URLSearchParams({
    date: dateStr,
    customerMobile: String(customerMobile).trim(),
    type,
    deliveryShift,
  });
  return await apiClient.delete(`/delivery-overrides?${q.toString()}`);
}
