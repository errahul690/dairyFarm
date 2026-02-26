/**
 * Notification Service
 * Admin notifications (e.g. milk request from buyer app)
 */

import { apiClient } from '../api/apiClient';

export const notificationService = {
  getList: async (opts = {}) => {
    const params = new URLSearchParams();
    if (opts.unreadOnly) params.append('unreadOnly', 'true');
    if (opts.limit) params.append('limit', String(opts.limit));
    const qs = params.toString();
    const url = qs ? `/notifications?${qs}` : '/notifications';
    return await apiClient.get(url);
  },

  getUnreadCount: async () => {
    const res = await apiClient.get('/notifications/unread-count');
    return res?.count ?? 0;
  },

  markRead: async (id) => {
    return await apiClient.patch(`/notifications/${id}/read`);
  },

  markAllRead: async () => {
    return await apiClient.patch('/notifications/read-all');
  },
};
