// OWNER: Jana - login page (written by the team: security control)
//
// On submit the email and password go to the backend login route. The returned
// token is kept in sessionStorage; api.js sends it as "Authorization: Bearer <token>"
// on every request. Closing the tab clears it, so nothing stays on a shared PC.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
      const result = await apiRequest('/api/employees/login', { method: 'POST', body: { email, password } });
      sessionStorage.setItem('token', result.token);
      sessionStorage.setItem('userName', result.user.name);
      // Accounts created by HR start with the shared default password: replace it first.
      if (result.user.mustChangePassword) {
        showMessage(`Welcome, ${result.user.name}! Please choose your own password first...`);
        setTimeout(() => { window.location.href = 'change-password.html?first=1'; }, 800);
        return;
      }
      showMessage(`Welcome, ${result.user.name}! Taking you to the directory...`);
      setTimeout(() => { window.location.href = 'index.html'; }, 800);
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });
});
