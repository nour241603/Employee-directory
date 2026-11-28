// OWNER: Jana - change password page (security control)
//
// Sends the current and the new password to PATCH /api/employees/me/password.
// The server takes the user from the login token, so this page can only change the
// logged-in user's own password. After a change every old token stops working, so
// the page clears the session and sends the user back to log in.
const NEW_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

document.addEventListener('DOMContentLoaded', () => {
  if (!sessionStorage.getItem('token')) {
    window.location.href = 'login.html';
    return;
  }
  if (new URLSearchParams(window.location.search).get('first')) {
    document.getElementById('first-login').hidden = false;
  }

  const form = document.getElementById('password-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;

    // Quick checks in the browser; the server checks everything again.
    if (!NEW_PASSWORD_PATTERN.test(newPassword)) {
      showMessage('New password must be 8 to 72 characters with at least one letter and one number.', 'error');
      return;
    }
    if (newPassword !== confirm) {
      showMessage('The two new passwords do not match.', 'error');
      return;
    }
    if (newPassword === currentPassword) {
      showMessage('The new password must be different from the current one.', 'error');
      return;
    }

    try {
      const result = await apiRequest('/api/employees/me/password', {
        method: 'PATCH',
        body: { currentPassword, newPassword }
      });
      form.reset();
      form.hidden = true;
      sessionStorage.clear();
      showMessage(`${result.message} Taking you to the login page...`);
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });
});
