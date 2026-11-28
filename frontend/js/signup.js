// OWNER: Jana - sign-up page
//
// Sends the request to the public sign-up route. The account is created as Pending,
// so this page never logs anyone in: HR approves the request first.
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup-form');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;

    // Quick checks in the browser; the server checks everything again.
    if (!PASSWORD_PATTERN.test(password)) {
      showMessage('Password must be 8 to 72 characters with at least one letter and one number.', 'error');
      return;
    }
    if (password !== confirm) {
      showMessage('The two passwords do not match.', 'error');
      return;
    }

    const body = {
      name: document.getElementById('signup-name').value,
      email: document.getElementById('signup-email').value,
      password,
      skills: document.getElementById('signup-skills').value.split(',').map((s) => s.trim()).filter(Boolean)
    };
    const phone = document.getElementById('signup-phone').value.trim();
    if (phone) body.phone = phone;

    try {
      const result = await apiRequest('/api/employees/signup', { method: 'POST', body });
      form.reset();
      form.hidden = true;
      showMessage(result.message);
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });
});
