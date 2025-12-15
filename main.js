// Toggle logic
const container = document.querySelector('.container');
const registerBtn = document.querySelector('.register-btn');
const loginBtn = document.querySelector('.login-btn');
registerBtn.addEventListener('click', () => container.classList.add('active'));
loginBtn.addEventListener('click', () => container.classList.remove('active'));

// Helpers
function getUsers() {
  return JSON.parse(localStorage.getItem('users')) || [];
}
function saveUsers(users) {
  localStorage.setItem('users', JSON.stringify(users));
}
function setSession(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

// Registration
document.querySelector('.register form').addEventListener('submit', function(e) {
  e.preventDefault();
  const username = this.querySelector('input[type="text"]').value.trim();
  const email = this.querySelector('input[type="email"]').value.trim();
  const password = this.querySelector('input[type="password"]').value;

  const users = getUsers();
  const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    alert('❌ Username already taken.');
    return;
  }

  // default role: resident
  const newUser = { username, email, password, role: 'resident' };
  users.push(newUser);
  saveUsers(users);
  alert('✅ Account created! You can now login.');
  container.classList.remove('active');
});

// Login
document.querySelector('.login form').addEventListener('submit', function(e) {
  e.preventDefault();
  const username = this.querySelector('input[type="text"]').value.trim();
  const password = this.querySelector('input[type="password"]').value;

  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  // Optional: seed a demo admin account if none exists
  if (!users.find(u => u.role === 'admin')) {
    users.push({ username: 'admin', email: 'admin@example.com', password: 'admin123', role: 'admin' });
    saveUsers(users);
  }

  if (!user) {
    alert('❌ Invalid credentials. Please register first.');
    return;
  }

  setSession(user);
  alert(`✅ Welcome, ${user.username}!`);

  if (user.role === 'admin') {
    window.location.href = './Admin/admindashboard.html';
  } else {
    // initialize simple profile keys for resident UX
    localStorage.setItem('userName', user.username);
    localStorage.setItem('userEmail', user.email);
    window.location.href = './resident/dashboard.html';
  }
});

// Forgot password (resident) — simple email-based reset flow
document.addEventListener('DOMContentLoaded', () => {
  const forgot = document.getElementById('forgotLink');
  const modal = document.getElementById('forgotModal');
  const close = document.getElementById('forgotClose');
  const cancel = document.getElementById('fpCancel');
  const form = document.getElementById('forgotForm');
  if (!forgot || !modal || !form) return;

  function resetForgotForm() {
    // hide password fields and set to verify stage
    try {
      document.getElementById('fpPasswordField').style.display = 'none';
      document.getElementById('fpPassword2Field').style.display = 'none';
    } catch (e) { /* ignore */ }
    form.setAttribute('data-stage', 'verify');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Verify';
    form.reset();
  }

  function openModal(){
    resetForgotForm();
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden','false');
    document.getElementById('fpUsername').focus();
  }

  function closeModal(){
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
    resetForgotForm();
  }

  forgot.addEventListener('click', function(e){ e.preventDefault(); openModal(); });
  close.addEventListener('click', closeModal);
  cancel.addEventListener('click', closeModal);

  modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    const stage = form.getAttribute('data-stage') || 'verify';
    const username = (document.getElementById('fpUsername').value || '').trim();
    const email = (document.getElementById('fpEmail').value || '').trim().toLowerCase();

    if (!username || !email) { alert('Please provide both username and registered email.'); return; }

    const users = getUsers();
    const user = users.find(u => (u.username || '').toLowerCase() === username.toLowerCase() && (u.email || '').toLowerCase() === email);
    if (!user) { alert('No account found matching that username and email.'); return; }

    if (stage === 'verify') {
      // Verification success — reveal password fields and switch stage
      document.getElementById('fpPasswordField').style.display = '';
      document.getElementById('fpPassword2Field').style.display = '';
      form.setAttribute('data-stage', 'change');
      // change primary button text to 'Change Password'
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Change Password';
      alert('User verified — please enter your new password');
      document.getElementById('fpPassword').focus();
      return;
    }

    // stage === 'change' -> perform password change
    const p1 = document.getElementById('fpPassword').value || '';
    const p2 = document.getElementById('fpPassword2').value || '';
    if (p1.length < 6) { alert('Password must be at least 6 characters.'); return; }
    if (p1 !== p2) { alert('Passwords do not match.'); return; }

    user.password = p1;
    saveUsers(users);
    alert('Password changed successfully. You can now login with your new password.');
    // reset modal to initial state
    document.getElementById('fpPasswordField').style.display = 'none';
    document.getElementById('fpPassword2Field').style.display = 'none';
    form.setAttribute('data-stage', 'verify');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Verify';
    closeModal();
  });
});
