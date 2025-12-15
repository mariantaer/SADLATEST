// Auth guard
const sessionUser = JSON.parse(localStorage.getItem('user'));
if (!sessionUser || sessionUser.role !== 'admin') {
  window.location.href = '../index.html';
}

// Enforce desktop-only admin: redirect mobile users back to main site
(function(){
  try {
    if (typeof window !== 'undefined' && window.innerWidth && window.innerWidth < 768) {
      alert('Admin dashboard is only available on desktop/laptop screens. You will be redirected to the main site.');
      window.location.href = '../index.html';
    }
  } catch (e) { /* ignore in non-browser contexts */ }
})();

// State
let complaints = JSON.parse(localStorage.getItem('complaints')) || [];
let currentView = 'overview';

// Keep admin view in sync across tabs/windows when complaints change
window.addEventListener('storage', (e) => {
  if (!e || e.key !== 'complaints') return;
  try {
    const oldLen = complaints.length;
    const updated = JSON.parse(localStorage.getItem('complaints') || '[]');
    complaints = updated;
    // notify admin if a new complaint was submitted
    if (Array.isArray(updated) && updated.length > oldLen) {
      showToast('New complaint submitted', 'success');
    }
    try { renderApp(); } catch (err) { /* ignore if render not ready */ }
  } catch (err) { /* ignore parse errors */ }
});

// Also listen via BroadcastChannel for faster cross-tab messaging when supported
try {
  if (typeof BroadcastChannel !== 'undefined') {
    const bc = new BroadcastChannel('complaints');
    bc.onmessage = (ev) => {
      try {
        const updated = JSON.parse(localStorage.getItem('complaints') || '[]');
        const oldLen = complaints.length;
        complaints = updated;
        if (Array.isArray(updated) && updated.length > oldLen) {
          showToast('New complaint submitted', 'success');
        }
        renderApp();
      } catch (err) { /* ignore */ }
    };
  }
} catch (e) { /* ignore non-browser environments */ }

function saveComplaints() {
  localStorage.setItem('complaints', JSON.stringify(complaints));
}
function fmt(dateStr) {
  return new Date(dateStr).toLocaleString();
}
function showToast(message, type='success') {
  const t = document.createElement('div');
  t.className = `toast ${type==='success'?'bg-green-500':'bg-red-500'} text-white`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// Actions
function updateStatus(id, status) {
  const c = complaints.find(x => x.complaint_id === id);
  if (!c) return;
  c.status = status;
  c.last_update = new Date().toISOString();
  // optional admin message/response
  const msg = arguments.length > 2 ? arguments[2] : undefined;
  if (msg && (''+msg).trim()) {
    if (!Array.isArray(c.responses)) c.responses = [];
    c.responses.push({ admin: sessionUser.username, message: (''+msg).trim(), at: new Date().toISOString() });
  }
  saveComplaints();
  showToast(`Status set to ${status}`);
  // switch to the segmented view for the new status so the complaint appears under its category
  if (status === 'Pending') currentView = 'pending';
  else if (status === 'In Progress') currentView = 'progress';
  else if (status === 'Resolved') currentView = 'resolved';
  renderApp();
}
function logout() {
  localStorage.removeItem('user');
  window.location.href = '../index.html';
}

// Mark a resolved complaint as removed from the admin interface only.
// The complaint remains in localStorage so residents continue to see it in their "My Complaints".
function removeResolved(id) {
  const c = complaints.find(x => x.complaint_id === id);
  if (!c) return;
  // only allow remove when complaint is resolved
  if (c.status !== 'Resolved') {
    showToast('Only resolved complaints can be removed from admin view', 'error');
    return;
  }
  c.admin_removed = true;
  c.last_update = new Date().toISOString();
  saveComplaints();
  // this will trigger storage events in other tabs/windows and keep resident view in sync
  showToast('Complaint removed from admin list (resident copy remains)', 'success');
  renderApp();
}

// Verification actions: approve or reject resident ID verification
function approveVerification(username) {
  const requests = JSON.parse(localStorage.getItem('verifyRequests') || '[]');
  const req = requests.find(r => r.username === username);
  if (!req) {
    showToast('Verification request not found', 'error');
    return;
  }
  req.status = 'Verified';
  req.reviewed_by = sessionUser.username;
  req.reviewed_at = new Date().toISOString();

  // update the user record
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const u = users.find(x => x.username === username);
  if (u) {
    u.verified_status = 'Verified';
    u.id_type = req.id_type;
    u.id_image = req.id_image;
    localStorage.setItem('users', JSON.stringify(users));
  }

  localStorage.setItem('verifyRequests', JSON.stringify(requests));
  // add notification for resident
  try {
    const notes = JSON.parse(localStorage.getItem('notifications') || '[]');
    notes.push({ username, message: 'Your ID verification was approved', type: 'info', at: new Date().toISOString(), read: false });
    localStorage.setItem('notifications', JSON.stringify(notes));
  } catch (e) { /* ignore */ }
  showToast(`User ${username} verified`);
  renderApp();
}

function rejectVerification(username) {
  const requests = JSON.parse(localStorage.getItem('verifyRequests') || '[]');
  const req = requests.find(r => r.username === username);
  if (!req) {
    showToast('Verification request not found', 'error');
    return;
  }
  req.status = 'Rejected';
  req.reviewed_by = sessionUser.username;
  req.reviewed_at = new Date().toISOString();

  // update the user record
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const u = users.find(x => x.username === username);
  if (u) {
    u.verified_status = 'Unverified';
    // keep id_image on user if you want; here we clear it so rejected users must re-upload
    delete u.id_image;
    delete u.id_type;
    localStorage.setItem('users', JSON.stringify(users));
  }

  localStorage.setItem('verifyRequests', JSON.stringify(requests));
  // ask for optional reason and attach to request/notification
  const reason = prompt('Optional reason for rejection (shown to resident):', '') || '';
  req.reason = reason;
  try {
    const notes = JSON.parse(localStorage.getItem('notifications') || '[]');
    const msg = reason ? `Your ID verification was rejected: ${reason}` : 'Your ID verification was rejected';
    notes.push({ username, message: msg, type: 'error', at: new Date().toISOString(), read: false });
    localStorage.setItem('notifications', JSON.stringify(notes));
  } catch (e) { /* ignore */ }
  showToast(`Verification for ${username} rejected`, 'error');
  renderApp();
}

// Views
function header() {
  return `
    <header class="gradient-bg shadow-md">
      <div class="max-w-7xl mx-auto px-4 py-6 flex items-center gap-4 justify-between">
        <div class="flex items-center gap-4 text-white">
          <div style="font-size: 40px;">🛠️</div>
          <div>
            <h1 class="text-white font-bold text-2xl">Admin • South Daang Hari Barangay Complaints</h1>
            <p class="text-white opacity-80">Manage and update community reports</p>
          </div>
        </div>
        <div class="text-white flex items-center gap-3">
          <span class="font-semibold">👤 ${sessionUser.username}</span>
          <span class="px-3 py-1 rounded bg-white/20 text-sm">Admin Mode</span>
          <button class="ml-2 bg-white/20 px-3 py-1 rounded" onclick="logout()">Logout</button>
        </div>
      </div>
    </header>
  `;
}

// Danger: clear all users, complaints, and verification requests
function clearAllData() {
  const proceed = confirm('This will permanently delete ALL application data stored in your browser (users, complaints, verifications, notifications, and settings). This cannot be undone. Proceed?');
  if (!proceed) return;

  try {
    // Clear everything in localStorage for a full reset
    localStorage.clear();
  } catch (e) {
    // fallback: remove common keys if clear fails
    const keys = Object.keys(localStorage || {});
    keys.forEach(k => { try { localStorage.removeItem(k); } catch (err) { /* ignore */ } });
  }

  // Notify and redirect to login page (main index)
  showToast('All data permanently cleared', 'success');
  // redirect to index so user can seed new admin on next login
  setTimeout(() => { window.location.href = '../index.html'; }, 800);
}
function nav() {
  const items = [
    { id:'overview', label:'Overview', icon:'📊' },
    { id:'all', label:'All Complaints', icon:'📚' },
    { id:'pending', label:'Pending', icon:'⏳' },
    { id:'progress', label:'In Progress', icon:'🔧' },
    { id:'resolved', label:'Resolved', icon:'✅' },
    { id:'verify', label:'Verification', icon:'🪪' }
  ];
  return `
    <nav class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 flex overflow-x-auto">
        ${items.map(i=>`
          <button onclick="currentView='${i.id}'; renderApp();"
                  class="px-6 py-4 font-semibold ${currentView===i.id ? 'text-red-600 border-b-2 border-red-600':'text-gray-700'}">
            <span class="mr-2">${i.icon}</span>${i.label}
          </button>
        `).join('')}
      </div>
    </nav>
  `;
}

function viewOverview() {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const complaints = JSON.parse(localStorage.getItem('complaints') || '[]');
  const verify = JSON.parse(localStorage.getItem('verifyRequests') || '[]');
  const counts = {
    totalUsers: users.length,
    totalComplaints: complaints.length,
    pending: complaints.filter(c=>c.status==='Pending').length,
    inProgress: complaints.filter(c=>c.status==='In Progress').length,
    resolved: complaints.filter(c=>c.status==='Resolved').length,
    verifyRequests: verify.length
  };
  return `
    <div class="p-6">
      <div class="max-w-7xl mx-auto grid gap-6">
        <div class="bg-white p-6 rounded-lg shadow">
          <div>
            <h2 class="text-2xl font-bold">Welcome, ${sessionUser.username}</h2>
            <p class="muted mt-1">Admin dashboard overview</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 bg-white rounded-lg shadow">
            <div class="text-sm text-gray-500">Total Users</div>
            <div class="text-2xl font-bold">${counts.totalUsers}</div>
          </div>
          <div class="p-4 bg-white rounded-lg shadow">
            <div class="text-sm text-gray-500">Total Complaints</div>
            <div class="text-2xl font-bold">${counts.totalComplaints}</div>
          </div>
          <div class="p-4 bg-white rounded-lg shadow">
            <div class="text-sm text-gray-500">Verification Requests</div>
            <div class="text-2xl font-bold">${counts.verifyRequests}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 bg-white rounded-lg shadow">
            <div class="text-sm text-gray-500">Pending</div>
            <div class="text-2xl font-bold">${counts.pending}</div>
          </div>
          <div class="p-4 bg-white rounded-lg shadow">
            <div class="text-sm text-gray-500">In Progress</div>
            <div class="text-2xl font-bold">${counts.inProgress}</div>
          </div>
          <div class="p-4 bg-white rounded-lg shadow">
            <div class="text-sm text-gray-500">Resolved</div>
            <div class="text-2xl font-bold">${counts.resolved}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function viewVerifications() {
  const requests = JSON.parse(localStorage.getItem('verifyRequests') || '[]');
  if (!requests || requests.length === 0) {
    return `
      <div class="p-6">
        <div class="max-w-7xl mx-auto bg-white rounded-lg shadow p-10 text-center">
          <div class="text-6xl mb-4">🪪</div>
          <p class="text-xl font-semibold">No verification requests</p>
          <p class="text-sm text-gray-500">Residents will appear here after they upload an ID for verification.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="p-6">
      <div class="max-w-7xl mx-auto grid gap-6">
        ${requests.map(r=>`
          <div class="bg-white p-5 rounded-xl shadow">
            <div class="flex justify-between items-center">
              <div>
                <div class="font-bold text-lg">${r.username}</div>
                <div class="text-sm text-gray-500">Requested: ${fmt(r.requested_at)} • Status: <span class="font-semibold">${r.status}</span></div>
              </div>
              <div class="text-sm">
                ${r.status === 'Pending' ? `
                  <button class="px-3 py-1 bg-green-600 text-white rounded" onclick="approveVerification('${r.username}')">Approve</button>
                  <button class="ml-2 px-3 py-1 bg-red-600 text-white rounded" onclick="rejectVerification('${r.username}')">Reject</button>
                ` : `
                  <span class="px-3 py-1 rounded bg-gray-100 text-gray-700">${r.status}</span>
                `}
              </div>
            </div>
            <div class="mt-4">
              <div class="text-sm font-semibold mb-2">ID Preview (${r.id_type})</div>
              ${r.id_image && r.id_image.startsWith('data:application/pdf') ? `
                <div class="text-sm"><a href="${r.id_image}" target="_blank" class="text-blue-600 underline">Open PDF</a></div>
              ` : r.id_image ? `
                <img src="${r.id_image}" alt="id" style="max-width:360px;border-radius:8px;display:block" />
              ` : `<div class="text-sm text-gray-500">No file uploaded</div>`}
            </div>
            ${r.reviewed_at ? `<div class="mt-3 text-xs text-gray-500">Reviewed by ${r.reviewed_by} • ${fmt(r.reviewed_at)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
function list(filterFn) {
  // By default exclude complaints that were removed from the admin view (admin_removed flag).
  // However, when the admin is viewing 'All Complaints' we want to show the full history
  // (including items previously removed from admin lists) to prevent manipulation.
  const data = complaints.slice()
                         .filter(c => (currentView === 'all') ? true : !c.admin_removed)
                         .sort((a,b)=> new Date(b.submitted_date)-new Date(a.submitted_date))
                         .filter(filterFn || (()=>true));
  if (data.length===0) {
    return `
      <div class="p-6">
        <div class="max-w-7xl mx-auto bg-white rounded-lg shadow p-10 text-center">
          <div class="text-6xl mb-4">📭</div>
          <p class="text-xl font-semibold">No complaints found</p>
        </div>
      </div>
    `;
  }
  return `
    <div class="p-6">
      <div class="max-w-7xl mx-auto grid gap-6 md:grid-cols-2">
        ${data.map(c=>`
          <div class="bg-white p-5 rounded-xl shadow ${c.admin_removed ? 'archived' : ''}">
            <div class="flex justify-between items-start mb-2">
              <div>
                <h3 class="font-bold text-lg">${c.title}</h3>
              </div>
              <span class="text-xs font-semibold px-3 py-1 rounded-full ${
                c.status==='Resolved' ? 'bg-green-100 text-green-700'
                : c.status==='In Progress' ? 'bg-blue-100 text-blue-700'
                : 'bg-yellow-100 text-yellow-700'
              }">${c.status}</span>
            </div>
            <p class="text-sm text-gray-700">${c.description}</p>
            ${c.media ? `
              <div class="mt-3">
                ${c.media_type && c.media_type.startsWith('image') ? `
                  <img src="${c.media}" alt="attachment" style="max-width:100%;border-radius:8px;display:block" />
                ` : c.media_type && c.media_type.startsWith('video') ? `
                  <video controls style="max-width:100%;border-radius:8px;display:block">
                    <source src="${c.media}" type="${c.media_type}">
                    Your browser does not support the video tag.
                  </video>
                ` : `<a href="${c.media}" target="_blank">View attachment</a>`}
              </div>
            ` : ''}
            <div class="text-xs text-gray-500 mt-2 flex gap-3 flex-wrap">
              <span>📂 ${c.category}</span><span>•</span><span>📍 ${c.location}</span><span>•</span>
              <span>👤 ${c.submitter_name}</span>
            </div>
            <div class="border-t mt-3 pt-2 text-xs text-gray-500">
              <div>ID: ${c.complaint_id}</div>
              <div>Submitted: ${fmt(c.submitted_date)}</div>
              <div>Last Update: ${fmt(c.last_update)}</div>
            </div>
            <div class="mt-4">
              <form onsubmit="event.preventDefault(); updateStatus('${c.complaint_id}', this.querySelector('select').value, this.querySelector('textarea').value)">
                <div>
                  <div>
                    <label class="text-sm font-semibold">Update Status:</label>
                    <select class="p-2 border rounded ml-2">
                      <option value="Pending" ${c.status==='Pending'?'selected':''}>Pending</option>
                      <option value="In Progress" ${c.status==='In Progress'?'selected':''}>In Progress</option>
                      <option value="Resolved" ${c.status==='Resolved'?'selected':''}>Resolved</option>
                    </select>
                  </div>
                  <div class="mt-3">
                    <label class="text-sm font-semibold">Message (optional)</label>
                    <textarea class="w-full p-2 border rounded mt-1" rows="3" placeholder="Write a message to the resident (optional)"></textarea>
                  </div>

                  <div class="mt-4" style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="px-4 py-2 bg-red-600 text-white rounded">Update Status</button>
                    ${currentView === 'resolved' ? `<button type="button" class="px-3 py-2 bg-gray-200 rounded" onclick="removeResolved('${c.complaint_id}')">Remove</button>` : ''}
                  </div>
                </div>
              </form>

              ${c.responses && c.responses.length ? `
                <div class="mt-4">
                  <div class="text-sm font-semibold mb-2">Responses</div>
                  <div class="space-y-2 text-sm">
                    ${c.responses.map(r=>`<div class="p-2 bg-gray-50 rounded"><div class="text-xs text-gray-500">${r.admin} • ${fmt(r.at)}</div><div class="mt-1">${r.message}</div></div>`).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// App
function content() {
  switch (currentView) {
    case 'overview': return viewOverview();
    // 'All' should show the full history of complaints (including any that were
    // removed from segmented views). This prevents manipulation by keeping a
    // complete audit-style list accessible to admins.
    case 'all': return list();
    case 'pending': return list(c => c.status === 'Pending');
    case 'progress': return list(c => c.status === 'In Progress');
    case 'resolved': return list(c => c.status === 'Resolved');
    case 'verify': return viewVerifications();
    default: return viewOverview();
  }
}
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `${header()}${nav()}${content()}`;
}
renderApp();
