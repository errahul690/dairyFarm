/**
 * Date Utility Functions
 * Helper functions for date operations
 */

export const formatDate = (date) => {
  return date.toLocaleDateString('en-IN');
};

export const formatDateTime = (date) => {
  return date.toLocaleString('en-IN');
};

export const getToday = () => {
  return new Date();
};

export const getStartOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const getEndOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

