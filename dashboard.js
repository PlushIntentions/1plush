/* ============================================================
   dashboard.js — Plush Intentions Admin Dashboard
   ============================================================
   IMPORTANT: Replace YOUR_ANON_KEY_HERE with your real
   Supabase anon/public key before uploading.
   ============================================================ */

// ── 1. SUPABASE CLIENT ───────────────────────────────────────
const SUPABASE_URL = 'https://iazvpykfdckpffhakncd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA'; // ← paste your key here

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 2. STATE ─────────────────────────────────────────────────
let mapInstance = null;
let allTechs    = [];
let allJobs     = [];
let allClients  = [];
let allInfractions = [];
let currentPanel = 'map';

// ── 3. UTILITY ───────────────────────────────────────────────
function hideLoader() {
  const el = document.getElementById('loader');
  if (el) { el.style.display = 'none'; }
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'show' + (type === 'error' ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.className = ''; }, 3500);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) { el.textContent = count; el.style.display = 'inline-block'; }
  else           { el.style.display = 'none'; }
}

function techName(t) {
  return t.full_name || t.name || t.email || 'Unknown';
}

// ── 4. SIDEBAR / PANEL NAVIGATION ───────────────────────────
window.openSidebar = function () {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('open');
};

window.closeSidebar = function () {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
};

window.showPanel = function (name) {
  document.querySelectorAll('[id^="panel-"]').forEach(function (p) {
    p.style.display = 'none';
  });
  document.querySelectorAll('.nav-link').forEach(function (l) {
    l.classList.remove('active');
  });

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.style.display = 'block';

  const navLink = document.getElementById('nav-' + name);
  if (navLink) navLink.classList.add('active');

  const titles = {
    map:         'Live Map',
    jobs:        'All Jobs',
    pending:     'Pending Jobs',
    techs:       'Technicians',
    clients:     'Clients',
    completed:   'Completed Jobs',
    approvals:   'Pending Approvals',
    workorders:  'Work Orders',
    infractions: 'Infractions',
    earnings:    'Earnings',
    usermgmt:    'User Management',
    newjob:      'Create New Job'
  };
  setText('topbar-title', titles[name] || 'Dashboard');

  currentPanel = name;
  closeSidebar();

  if (name === 'map') {
    setTimeout(initMap, 300);
  }
};

// ── 5. SIGN OUT ───────────────────────────────────────────────
window.signOut = async function () {
  await sb.auth.signOut();
  window.location.href = 'index.html';
};

// ── 6. LOAD ALL DATA ─────────────────────────────────────────
window.loadAllData = async function () {
  try {
    await Promise.all([loadTechs(), loadJobs(), loadClients(), loadInfractions()]);
    updateStats();
    renderCurrentPanel();
  } catch (e) {
    console.error('loadAllData error:', e);
  }
};

async function loadTechs() {
  try {
    const { data, error } = await sb.from('technicians').select('*');
    if (error) { console.warn('technicians load error:', error.message); return; }
    allTechs = data || [];
  } catch (e) { console.warn('loadTechs exception:', e); }
}

async function loadJobs() {
  try {
    const { data, error } = await sb.from('jobs').select('*');
    if (error) { console.warn('jobs load error:', error.message); return; }
    allJobs = data || [];
  } catch (e) { console.warn('loadJobs exception:', e); }
}

async function loadClients() {
  try {
    const { data, error } = await sb.from('clients').select('*');
    if (error) { console.warn('clients load error:', error.message); return; }
    allClients = data || [];
  } catch (e) { console.warn('loadClients exception:', e); }
}

async function loadInfractions() {
  try {
    const { data, error } = await sb.from('infractions').select('*');
    if (error) { console.warn('infractions load error:', error.message); return; }
    allInfractions = data || [];
  } catch (e) { console.warn('loadInfractions exception:', e); }
}

// ── 7. STATS ─────────────────────────────────────────────────
function updateStats() {
  const totalJobs       = allJobs.length;
  const activeJobs      = allJobs.filter(function (j) { return j.status === 'active' || j.status === 'in_progress'; }).length;
  const pendingJobs     = allJobs.filter(function (j) { return j.status === 'pending'; }).length;
  const approvalCount   = allTechs.filter(function (t) { return t.status === 'pending_approval'; }).length;
  const infractionCount = allInfractions.filter(function (i) { return !i.resolved; }).length;

  setText('stat-jobs',    totalJobs);
  setText('stat-active',  activeJobs);
  setText('stat-pending', pendingJobs);
  setText('stat-techs',   allTechs.length);

  setText('m-stat-jobs',    totalJobs);
  setText('m-stat-active',  activeJobs);
  setText('m-stat-pending', pendingJobs);
  setText('m-stat-techs',   allTechs.length);

  setBadge('badge-pending',     pendingJobs);
  setBadge('badge-approvals',   approvalCount);
  setBadge('badge-infractions', infractionCount);
}

function renderCurrentPanel() {
  switch (currentPanel) {
    case 'map':         renderMap();              break;
    case 'jobs':        renderJobs();             break;
    case 'pending':     renderPending();          break;
    case 'techs':       renderTechs();            break;
    case 'clients':     renderClients();          break;
    case 'completed':   renderCompleted();        break;
    case 'approvals':   renderApprovals();        break;
    case 'workorders':  renderWorkOrders('all');  break;
    case 'infractions': renderInfractions();      break;
    case 'earnings':    renderEarnings();         break;
    case 'usermgmt':    renderUserMgmt();         break;
    case 'newjob':      renderNewJobForm();       break;
  }
}

// ── 8. MAP ────────────────────────────────────────────────────
function initMap() {
  const container = document.getElementById('map-container');
  if (!container || mapInstance) return;
  try {
    mapboxgl.accessToken = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';
    mapInstance = new mapboxgl.Map({
      container: 'map-container',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-82.1824, 41.4525],
      zoom: 10
    });
    mapInstance.on('load', function () { renderMap(); });
  } catch (e) {
    console.warn('Map init error:', e);
  }
}

function renderMap() {
  if (!mapInstance) return;
  document.querySelectorAll('.mapboxgl-marker').forEach(function (m) { m.remove(); });
  allTechs.forEach(function (t) {
    if (!t.lat || !t.lng) return;
    const el = document.createElement('div');
    el.style.cssText = 'width:14px;height:14px;background:#FF4F9F;border-radius:50%;border:2px solid #fff;cursor:pointer;';
    el.title = techName(t);
    new mapboxgl.Marker(el)
      .setLngLat([t.lng, t.lat])
      .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(techName(t) + ' — ' + (t.status || '')))
      .addTo(mapInstance);
  });
}

// ── 9. JOB CARD BUILDER ───────────────────────────────────────
function jobCard(j) {
  const tech   = allTechs.find(function (t) { return t.id === j.technician_id; });
  const client = allClients.find(function (c) { return c.id === j.client_id; });
  const statusClass = {
    pending:    'status-pending',
    active:     'status-active',
    in_progress:'status-active',
    completed:  'status-completed',
    cancelled:  'status-cancelled'
  }[j.status] || 'status-pending';

  return '<div class="card">' +
    '<div class="card-header">' +
      '<span class="card-title">' + esc(j.title || 'Untitled') + '</span>' +
      '<span class="status-badge ' + statusClass + '">' + (j.status || 'pending') + '</span>' +
    '</div>' +
    '<div class="card-meta">' +
      '<span><i data-feather="user"></i> ' + (tech ? techName(tech) : 'Unassigned') + '</span>' +
      '<span><i data-feather="briefcase"></i> ' + (client ? esc(client.name) : 'No client') + '</span>' +
    '</div>' +
    '<div class="card-meta">' +
      '<span><i data-feather="calendar"></i> ' + (j.scheduled_date || '—') + '</span>' +
      '<span><i data-feather="dollar-sign"></i> $' + (j.job_rate || '0') + '/hr</span>' +
    '</div>' +
    '<div class="card-actions">' +
    (j.status !== 'completed' && j.status !== 'cancelled'
      ? '<button class="btn btn-sm btn-pink" onclick="openAssignModal(\'' + j.id + '\',\'' + esc(j.title) + '\')">Assign</button>' +
        '<button class="btn btn-sm" onclick="updateJobStatus(\'' + j.id + '\',\'completed\')">Complete</button>' +
        '<button class="btn btn-sm btn-danger" onclick="updateJobStatus(\'' + j.id + '\',\'cancelled\')">Cancel</button>'
      : '') +
    '</div>' +
    '</div>';
}

// ── 10. PANELS ────────────────────────────────────────────────
function renderJobs() {
  const el = document.getElementById('jobs-grid');
  if (!el) return;
  if (!allJobs.length) { el.innerHTML = '<p class="empty-msg">No jobs found.</p>'; return; }
  el.innerHTML = allJobs.map(jobCard).join('');
  feather.replace();
}

function renderPending() {
  const el = document.getElementById('pending-grid');
  if (!el) return;
  const list = allJobs.filter(function (j) { return j.status === 'pending'; });
  if (!list.length) { el.innerHTML = '<p class="empty-msg">No pending jobs.</p>'; return; }
  el.innerHTML = list.map(jobCard).join('');
  feather.replace();
}

function renderCompleted() {
  const el = document.getElementById('completed-grid');
  if (!el) return;
  const list = allJobs.filter(function (j) { return j.status === 'completed'; });
  if (!list.length) { el.innerHTML = '<p class="empty-msg">No completed jobs.</p>'; return; }
  el.innerHTML = list.map(jobCard).join('');
  feather.replace();
}

// ── 11. WORK ORDERS ───────────────────────────────────────────
window.filterWorkOrders = function (filter, btn) {
  document.querySelectorAll('.filter-tab').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderWorkOrders(filter);
};

function renderWorkOrders(filter) {
  const el = document.getElementById('workorders-grid');
  if (!el) return;
  let list = allJobs;
  if (filter && filter !== 'all') list = allJobs.filter(function (j) { return j.status === filter; });
  if (!list.length) { el.innerHTML = '<p class="empty-msg">No work orders found.</p>'; return; }
  el.innerHTML = list.map(jobCard).join('');
  feather.replace();
}

// ── 12. TECHNICIANS ───────────────────────────────────────────
function renderTechs() {
  const el = document.getElementById('techs-grid');
  if (!el) return;
  const list = allTechs.filter(function (t) { return t.status !== 'pending_approval'; });
  if (!list.length) { el.innerHTML = '<p class="empty-msg">No technicians found.</p>'; return; }
  el.innerHTML = list.map(function (t) {
    return '<div class="card">' +
      '<div class="card-header">' +
        '<span class="card-title">' + esc(techName(t)) + '</span>' +
        '<span class="status-badge ' + (t.is_active ? 'status-active' : 'status-cancelled') + '">' + (t.is_active ? 'Active' : 'Inactive') + '</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span><i data-feather="mail"></i> ' + esc(t.email || '—') + '</span>' +
        '<span><i data-feather="phone"></i> ' + esc(t.phone || '—') + '</span>' +
      '</div>' +
      '<div class="card-meta"><span><i data-feather="map-pin"></i> ' + esc(t.city || '—') + '</span></div>' +
      '<div class="card-actions">' +
        '<button class="btn btn-sm btn-pink" onclick="setTechStatus(\'' + t.id + '\',' + (t.is_active ? 'false' : 'true') + ')">' + (t.is_active ? 'Deactivate' : 'Activate') + '</button>' +
        '<button class="btn btn-sm" onclick="openResetPw(\'' + (t.user_id || t.id) + '\',\'' + esc(techName(t)) + '\')">Reset PW</button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteTech(\'' + t.id + '\')">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');
  feather.replace();
}

// ── 13. APPROVALS ─────────────────────────────────────────────
function renderApprovals() {
  const el = document.getElementById('approvals-grid');
  if (!el) return;
  const list = allTechs.filter(function (t) { return t.status === 'pending_approval'; });
  if (!list.length) { el.innerHTML = '<p class="empty-msg">No pending approvals.</p>'; return; }
  el.innerHTML = list.map(function (t) {
    return '<div class="card">' +
      '<div class="card-header">' +
        '<span class="card-title">' + esc(techName(t)) + '</span>' +
        '<span class="status-badge status-pending">Pending</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span><i data-feather="mail"></i> ' + esc(t.email || '—') + '</span>' +
        '<span><i data-feather="map-pin"></i> ' + esc(t.city || '—') + '</span>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="btn btn-sm btn-pink" onclick="approveTech(\'' + t.id + '\')">Approve</button>' +
        '<button class="btn btn-sm btn-danger" onclick="rejectTech(\'' + t.id + '\')">Reject</button>' +
      '</div>' +
    '</div>';
  }).join('');
  feather.replace();
}

// ── 14. CLIENTS ───────────────────────────────────────────────
function renderClients() {
  const el = document.getElementById('clients-tbody');
  if (!el) return;
  if (!allClients.length) {
    el.innerHTML = '<tr><td colspan="5" class="empty-msg">No clients found.</td></tr>';
    return;
  }
  el.innerHTML = allClients.map(function (c) {
    return '<tr>' +
      '<td>' + esc(c.name || '—') + '</td>' +
      '<td>' + esc(c.email || '—') + '</td>' +
      '<td>' + esc(c.phone || '—') + '</td>' +
      '<td>' + esc(c.city || '—') + '</td>' +
      '<td><button class="btn btn-sm btn-danger" onclick="deleteClient(\'' + c.id + '\')">Delete</button></td>' +
    '</tr>';
  }).join('');
}

// ── 15. INFRACTIONS ───────────────────────────────────────────
function renderInfractions() {
  const el = document.getElementById('infractions-grid');
  if (!el) return;
  if (!allInfractions.length) { el.innerHTML = '<p class="empty-msg">No infractions found.</p>'; return; }
  el.innerHTML = allInfractions.map(function (inf) {
    const tech = allTechs.find(function (t) { return t.id === inf.technician_id; });
    const sevClass = inf.severity === 'high' ? 'status-cancelled' : inf.severity === 'medium' ? 'status-pending' : 'status-active';
    return '<div class="card">' +
      '<div class="card-header">' +
        '<span class="card-title">' + esc(tech ? techName(tech) : 'Unknown Tech') + '</span>' +
        '<span class="status-badge ' + sevClass + '">' + (inf.severity || 'low') + '</span>' +
      '</div>' +
      '<p style="margin:8px 0;color:var(--text-muted);font-size:.85rem;">' + esc(inf.description || inf.reason || '—') + '</p>' +
      '<div class="card-meta"><span>Status: ' + (inf.resolved ? '✅ Resolved' : '🔴 Open') + '</span></div>' +
      '<div class="card-actions">' +
        (!inf.resolved ? '<button class="btn btn-sm btn-pink" onclick="resolveInfraction(\'' + inf.id + '\')">Resolve</button>' : '') +
        '<button class="btn btn-sm btn-danger" onclick="deleteInfraction(\'' + inf.id + '\')">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');
  feather.replace();
}

// ── 16. EARNINGS ──────────────────────────────────────────────
function renderEarnings() {
  const completed = allJobs.filter(function (j) { return j.status === 'completed'; });
  let total = 0, hours = 0;
  completed.forEach(function (j) {
    const rate = parseFloat(j.job_rate) || 0;
    let hrs = 0;
    if (j.check_in_time && j.check_out_time) {
      const diff = new Date(j.check_out_time) - new Date(j.check_in_time);
      hrs = diff > 0 ? diff / 3600000 : 0;
    }
    total += rate * hrs;
    hours += hrs;
  });

  setText('earn-total', '$' + total.toFixed(2));
  setText('earn-hours', hours.toFixed(1) + ' hrs');
  setText('earn-count', completed.length);

  const breakdown = document.getElementById('earnings-breakdown');
  if (!breakdown) return;
  if (!completed.length) { breakdown.innerHTML = '<p class="empty-msg">No completed jobs yet.</p>'; return; }
  breakdown.innerHTML = completed.map(function (j) {
    const tech = allTechs.find(function (t) { return t.id === j.technician_id; });
    const rate = parseFloat(j.job_rate) || 0;
    let hrs = 0;
    if (j.check_in_time && j.check_out_time) {
      const diff = new Date(j.check_out_time) - new Date(j.check_in_time);
      hrs = diff > 0 ? diff / 3600000 : 0;
    }
    return '<div class="card" style="margin-bottom:10px;">' +
      '<div class="card-header">' +
        '<span class="card-title">' + esc(j.title || 'Untitled') + '</span>' +
        '<span class="status-badge status-completed">$' + (rate * hrs).toFixed(2) + '</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span>' + (tech ? techName(tech) : 'Unknown') + '</span>' +
        '<span>' + hrs.toFixed(1) + ' hrs @ $' + rate + '/hr</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── 17. USER MANAGEMENT ───────────────────────────────────────
function renderUserMgmt() {
  const adminsEl = document.getElementById('admins-grid');
  const techsEl  = document.getElementById('usermgmt-techs-grid');
  const admins = allTechs.filter(function (t) { return t.role === 'admin'; });
  const techs  = allTechs.filter(function (t) { return t.role !== 'admin'; });

  if (adminsEl) {
    adminsEl.innerHTML = admins.length
      ? admins.map(userCard).join('')
      : '<p class="empty-msg">No admins found.</p>';
    feather.replace();
  }
  if (techsEl) {
    techsEl.innerHTML = techs.length
      ? techs.map(userCard).join('')
      : '<p class="empty-msg">No technician accounts found.</p>';
    feather.replace();
  }
}

function userCard(t) {
  return '<div class="card">' +
    '<div class="card-header">' +
      '<span class="card-title">' + esc(techName(t)) + '</span>' +
      '<span class="status-badge status-active">' + esc(t.role || 'technician') + '</span>' +
    '</div>' +
    '<div class="card-meta"><span><i data-feather="mail"></i> ' + esc(t.email || '—') + '</span></div>' +
    '<div class="card-actions">' +
      '<button class="btn btn-sm btn-pink" onclick="openResetPw(\'' + (t.user_id || t.id) + '\',\'' + esc(techName(t)) + '\')">Reset PW</button>' +
    '</div>' +
  '</div>';
}

// ── 18. NEW JOB FORM ─────────────────────────────────────────
function renderNewJobForm() {
  const clientSel = document.getElementById('nj-client');
  if (clientSel) {
    clientSel.innerHTML = '<option value="">Select client…</option>' +
      allClients.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
  }
  const techSel = document.getElementById('nj-tech');
  if (techSel) {
    const active = allTechs.filter(function (t) { return t.is_active && t.status !== 'pending_approval'; });
    techSel.innerHTML = '<option value="">Assign technician…</option>' +
      active.map(function (t) { return '<option value="' + t.id + '">' + esc(techName(t)) + '</option>'; }).join('');
  }
}

window.createWorkOrder = async function () {
  const title    = (document.getElementById('nj-title')       || {}).value;
  const desc     = (document.getElementById('nj-description') || {}).value;
  const clientId = (document.getElementById('nj-client')      || {}).value;
  const techId   = (document.getElementById('nj-tech')        || {}).value;
  const priority = (document.getElementById('nj-priority')    || {}).value || 'normal';
  const rate     = (document.getElementById('nj-rate')        || {}).value;
  const date     = (document.getElementById('nj-date')        || {}).value;
  const time     = (document.getElementById('nj-time')        || {}).value;
  const notes    = (document.getElementById('nj-notes')       || {}).value;

  if (!title) { showToast('Job title is required.', 'error'); return; }

  const { error } = await sb.from('jobs').insert([{
    title: title, description: desc,
    client_id: clientId || null, technician_id: techId || null,
    priority: priority, job_rate: parseFloat(rate) || 0,
    scheduled_date: date || null, scheduled_time: time || null,
    notes: notes, status: 'pending'
  }]);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast('Job created!');
  await loadJobs();
  updateStats();
  showPanel('jobs');
};

// ── 19. ASSIGN MODAL ─────────────────────────────────────────
let _assignJobId = null;

window.openAssignModal = function (jobId, title) {
  _assignJobId = jobId;
  setText('modal-job-title', title || 'Job');
  const sel = document.getElementById('modal-tech-select');
  if (sel) {
    sel.innerHTML = '<option value="">Select technician…</option>' +
      allTechs.filter(function (t) { return t.is_active !== false && t.status !== 'pending_approval'; })
        .map(function (t) { return '<option value="' + t.id + '">' + esc(techName(t)) + '</option>'; }).join('');
  }
  const modal = document.getElementById('assign-modal');
  if (modal) modal.classList.add('open');
};

window.confirmAssign = async function () {
  const sel = document.getElementById('modal-tech-select');
  const techId = sel ? sel.value : null;
  if (!techId) { showToast('Select a technician.', 'error'); return; }
  const { error } = await sb.from('jobs').update({ technician_id: techId, status: 'active' }).eq('id', _assignJobId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Technician assigned!');
  closeModal('assign-modal');
  await loadJobs();
  updateStats();
  renderCurrentPanel();
};

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// ── 20. CREATE USER MODAL ────────────────────────────────────
window.openCreateUserModal = function () {
  const modal = document.getElementById('create-user-modal');
  if (modal) modal.classList.add('open');
  const err = document.getElementById('cu-error');
  if (err) err.textContent = '';
};

window.toggleTechFields = function () {
  const role = (document.getElementById('cu-role') || {}).value;
  const tf = document.getElementById('cu-tech-fields');
  if (tf) tf.style.display = (role === 'technician') ? 'block' : 'none';
};

window.createUser = async function () {
  const name     = (document.getElementById('cu-name')     || {}).value;
  const email    = (document.getElementById('cu-email')    || {}).value;
  const password = (document.getElementById('cu-password') || {}).value;
  const role     = (document.getElementById('cu-role')     || {}).value || 'technician';
  const phone    = (document.getElementById('cu-phone')    || {}).value;
  const city     = (document.getElementById('cu-city')     || {}).value;
  const errEl    = document.getElementById('cu-error');
  const btn      = document.getElementById('cu-submit-btn');

  if (!email || !password) {
    if (errEl) errEl.textContent = 'Email and password are required.';
    return;
  }
  if (btn) btn.disabled = true;
  if (errEl) errEl.textContent = '';

  const { data: authData, error: authErr } = await sb.auth.signUp({ email: email, password: password });
  if (authErr) {
    if (errEl) errEl.textContent = authErr.message;
    if (btn) btn.disabled = false;
    return;
  }

  const userId = authData.user ? authData.user.id : null;
  const { error: dbErr } = await sb.from('technicians').insert([{
    user_id: userId, full_name: name, email: email,
    phone: phone || null, city: city || null, role: role,
    status: role === 'admin' ? 'active' : 'pending_approval',
    is_active: role === 'admin'
  }]);

  if (dbErr) {
    if (errEl) errEl.textContent = 'Auth created but DB error: ' + dbErr.message;
    if (btn) btn.disabled = false;
    return;
  }

  showToast('User created!');
  closeModal('create-user-modal');
  await loadTechs();
  updateStats();
  renderUserMgmt();
  if (btn) btn.disabled = false;
};

// ── 21. RESET PASSWORD MODAL ─────────────────────────────────
window.openResetPw = function (userId, name) {
  setText('reset-pw-label', 'Reset password for ' + (name || 'user'));
  const el = document.getElementById('reset-pw-uid');
  if (el) el.value = userId;
  const modal = document.getElementById('reset-pw-modal');
  if (modal) modal.classList.add('open');
  const errEl = document.getElementById('reset-pw-error');
  if (errEl) errEl.textContent = '';
};

window.confirmResetPw = async function () {
  const pw    = (document.getElementById('reset-pw-input')   || {}).value;
  const pw2   = (document.getElementById('reset-pw-confirm') || {}).value;
  const errEl = document.getElementById('reset-pw-error');

  if (!pw || pw.length < 6) { if (errEl) errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (pw !== pw2)            { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }

  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) { if (errEl) errEl.textContent = error.message; return; }

  showToast('Password updated!');
  closeModal('reset-pw-modal');
};

// ── 22. CREATE CLIENT MODAL ──────────────────────────────────
window.openCreateClientModal = function () {
  const modal = document.getElementById('create-client-modal');
  if (modal) modal.classList.add('open');
  const errEl = document.getElementById('cc-error');
  if (errEl) errEl.textContent = '';
};

window.createClient = async function () {
  const name    = (document.getElementById('cc-name')    || {}).value;
  const email   = (document.getElementById('cc-email')   || {}).value;
  const phone   = (document.getElementById('cc-phone')   || {}).value;
  const city    = (document.getElementById('cc-city')    || {}).value;
  const address = (document.getElementById('cc-address') || {}).value;
  const errEl   = document.getElementById('cc-error');

  if (!name) { if (errEl) errEl.textContent = 'Client name is required.'; return; }

  const { error } = await sb.from('clients').insert([{
    name: name, email: email || null, phone: phone || null,
    city: city || null, address: address || null
  }]);
  if (error) { if (errEl) errEl.textContent = error.message; return; }

  showToast('Client created!');
  closeModal('create-client-modal');
  await loadClients();
  renderClients();
};

// ── 23. ACTIONS ───────────────────────────────────────────────
window.deleteClient = async function (id) {
  if (!confirm('Delete this client?')) return;
  const { error } = await sb.from('clients').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Client deleted.');
  await loadClients(); renderClients();
};

window.approveTech = async function (id) {
  const { error } = await sb.from('technicians').update({ status: 'active', is_active: true }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Technician approved!');
  await loadTechs(); updateStats(); renderApprovals();
};

window.rejectTech = async function (id) {
  if (!confirm('Reject and remove this technician?')) return;
  const { error } = await sb.from('technicians').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Technician rejected.');
  await loadTechs(); updateStats(); renderApprovals();
};

window.setTechStatus = async function (id, active) {
  const { error } = await sb.from('technicians').update({ is_active: active }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(active ? 'Technician activated.' : 'Technician deactivated.');
  await loadTechs(); renderTechs();
};

window.deleteTech = async function (id) {
  if (!confirm('Permanently delete this technician?')) return;
  const { error } = await sb.from('technicians').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Technician deleted.');
  await loadTechs(); updateStats(); renderTechs();
};

window.updateJobStatus = async function (id, status) {
  const updates = { status: status };
  if (status === 'completed') updates.check_out_time = new Date().toISOString();
  const { error } = await sb.from('jobs').update(updates).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Job updated to ' + status + '.');
  await loadJobs(); updateStats(); renderCurrentPanel();
};

window.resolveInfraction = async function (id) {
  const { error } = await sb.from('infractions').update({ resolved: true, status: 'resolved' }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Infraction resolved.');
  await loadInfractions(); updateStats(); renderInfractions();
};

window.deleteInfraction = async function (id) {
  if (!confirm('Delete this infraction record?')) return;
  const { error } = await sb.from('infractions').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Infraction deleted.');
  await loadInfractions(); updateStats(); renderInfractions();
};

// ── 24. MODAL BACKDROP & ESCAPE ──────────────────────────────
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal-overlay')) {
    document.querySelectorAll('.modal-overlay.open').forEach(function (m) { m.classList.remove('open'); });
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(function (m) { m.classList.remove('open'); });
    closeSidebar();
  }
});

// ── 25. XSS ESCAPE HELPER ─────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── 26. BOOT — LOADER HIDES FIRST, THEN ASYNC ────────────────
document.addEventListener('DOMContentLoaded', function () {

  // ✅ STEP 1 — Hide loader RIGHT NOW (zero async, zero delay)
  hideLoader();

  // ✅ STEP 2 — Render feather icons
  if (typeof feather !== 'undefined') feather.replace();

  // ✅ STEP 3 — Show the map panel immediately
  showPanel('map');

  // ✅ STEP 4 — Session check runs in the background, never blocks UI
  sb.auth.getSession().then(function (result) {
    const session = result.data && result.data.session;
    if (!session) {
      window.location.href = 'index.html';
      return;
    }
    setText('signed-in-email', session.user.email || '');
    window.loadAllData();
  }).catch(function (e) {
    console.warn('Session check failed:', e);
  });

});
