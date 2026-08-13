let authToken = localStorage.getItem('motiv_token') || '';

export function setToken(token) {
  authToken = token || '';
  if (token) localStorage.setItem('motiv_token', token);
  else localStorage.removeItem('motiv_token');
}

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const money = (value, digits = 0) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: digits,
}).format(Number(value || 0));

export const shortDate = (value) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
}).format(new Date(value));

export const dateRange = (start, end) => `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(start))} – ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(end))}`;
