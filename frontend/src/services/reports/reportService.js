/**
 * Report Service
 * Handle profit/loss calculations and reports
 */
import { apiClient, API_BASE_URL } from '../api/apiClient';

function buildQueryString(params) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  if (!entries.length) {
    return '';
  }
  return `?${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')}`;
}

export const reportService = {
  getProfitLossReport: async (startDate, endDate) => {
    // Implement profit/loss calculation logic
    throw new Error('Not implemented');
  },

  getDashboardSummary: async ({ trendPeriod, buyerMobile } = {}) => {
    const query = buildQueryString({ trendPeriod, buyerMobile });
    return apiClient.get(`/reports/dashboard-summary${query}`);
  },

  getConsumerConsumptionMonthly: async ({ year, month } = {}) => {
    const query = buildQueryString({ year, month });
    return apiClient.get(`/reports/consumer-consumption-monthly${query}`);
  },

  getBuyerConsumptionDownloadUrl: ({ month, year, buyerMobile } = {}) => {
    const query = buildQueryString({ month, year, buyerMobile });
    return `${API_BASE_URL}/reports/buyer-consumption/export${query}`;
  },

  getConsumerExportUrl: ({ year, month, format, buyerMobile } = {}) => {
    const params = { year, month };
    if (buyerMobile != null && String(buyerMobile).trim() !== '') {
      params.buyerMobile = String(buyerMobile).trim();
    } else {
      params.allConsumers = '1';
    }
    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(month) === now.getMonth() + 1;
    if (isCurrentMonth) {
      params.upToToday = '1';
    }
    const query = buildQueryString(params);
    const path = format === 'pdf'
      ? `/reports/consumer-consumption-monthly/export/pdf${query}`
      : `/reports/consumer-consumption-monthly/export/excel${query}`;
    return `${API_BASE_URL}${path}`;
  },
};

