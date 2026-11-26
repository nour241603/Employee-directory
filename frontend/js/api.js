// Shared request helper: every page calls the backend through apiRequest().
// Returns the JSON body, or throws an Error with the API's message.
async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem('token');
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new Error('Cannot reach the API. Check that the backend is running.');
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    let message = data?.error?.message || data?.message || `Request failed (${response.status})`;
    const details = data?.error?.details;
    if (Array.isArray(details) && details.length && details[0].message) {
      message += ' ' + details.map((d) => d.message).join(' ');
    }
    const error = new Error(message);
    error.status = response.status;
    error.details = details;
    throw error;
  }
  return data;
}

// Shows a success or error message in the element with id="message".
function showMessage(text, type = 'success') {
  const box = document.getElementById('message');
  if (!box) return;
  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Always use this when putting user data into HTML, so nobody can inject code.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Fills a <select> with options. items: [{ value, label }]
function fillSelect(select, items, placeholder) {
  select.innerHTML = '';
  if (placeholder !== undefined) select.add(new Option(placeholder, ''));
  for (const item of items) select.add(new Option(item.label, item.value));
}

async function checkApiStatus() {
  const badge = document.getElementById('api-status');
  if (!badge) return;
  try {
    const health = await apiRequest('/api/health');
    badge.textContent = `API online: ${health.runtime} (${health.environment})`;
    badge.className = 'api-status online';
  } catch {
    badge.textContent = 'API offline';
    badge.className = 'api-status offline';
  }
}

document.addEventListener('DOMContentLoaded', checkApiStatus);
