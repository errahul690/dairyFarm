/**
 * WhatsApp API – send message, template, templates list, chat history
 */
import { apiClient } from '../api/apiClient';

export const whatsappService = {
  sendText: async (to, message, options = {}) => {
    const res = await apiClient.post('/whatsapp/send-message', {
      to,
      message,
      ...options,
    });
    return res;
  },

  sendTemplate: async (to, templateName, language = 'en', components = [], options = {}) => {
    const res = await apiClient.post('/whatsapp/send-template', {
      to,
      templateName,
      language,
      components,
      ...options,
    });
    return res;
  },

  getTemplates: async () => {
    const res = await apiClient.get('/whatsapp/templates');
    return res?.data ?? [];
  },

  getChatHistory: async (phone, tenantId) => {
    const url = tenantId
      ? `/whatsapp/chat-history/${encodeURIComponent(phone)}?tenantId=${encodeURIComponent(tenantId)}`
      : `/whatsapp/chat-history/${encodeURIComponent(phone)}`;
    const res = await apiClient.get(url);
    return res?.data ?? [];
  },
};
