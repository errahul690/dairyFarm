/**
 * Date Utility Functions
 * Helper functions for date operations
 */

/** Calendar date YYYY-MM-DD in Asia/Kolkata (IST). Use this instead of manual UTC+offset hacks. */
export function getYmdInIST(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    return getYmdInIST(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function getTodayYmdIST() {
  return getYmdInIST(new Date());
}

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

