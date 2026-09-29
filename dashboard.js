/* ============================================================
   dashboard.js — Plush Intentions Admin Dashboard
   RULE: loader MUST be hidden SYNCHRONOUSLY before any await/async
   ============================================================ */

// ── Supabase init ──────────────────────────────────────────────
const SUPA_URL = 'https://gsneugdwoxpibajghwge.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbmV1Z2R3b3hwaWJhamdod2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjk2NjUsImV4cCI6MjA5Mzg0NTY2NX0.wmZDgY_fAfeiDlZzWLA4KT5_dlbyG7Ns1W4z_HZH8Ws'; // ← paste your anon key here
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

// ── Mapbox token ───────────────────────────────────────────────
const MAPBOX_TOKEN = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

// ── Global state ───────────────────────────────────────────────
let allJobs         = [];
let allTechs        = [];
let allClients      = [];
let allInfractions  = [];
let mapInstance     = null;
let techMarkers     = [];
let currentAssignJobId = null;

// ══════════════════════════════════════════════════════════════
//  BOOT — DOMContentLoaded
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {

  // ✅ STEP 1 — Hide loader RIGHT NOW (zero async, zero await)
  var loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';

  // ✅ STEP 2 — Feather icons
  if (window.feather) feather.replace();

  // ✅ STEP 3 — Show default panel
  showPanel('map');

  // ✅ STEP 4 — Session check in background (.then only, never await)
  sb.auth.getSession().then(function (result) {
    var session = result && result.data && result.data.session;
    if (!session) {
      window.location.href = 'index.html';
      return;
    }
    var emailEl = document.getElementById('signed-in-email');
    if (emailEl) emailEl.textContent = session.user.email;

    loadAllData();
    initMap();
  }).catch(function (e) {
    console.warn('Session check failed:', e);
  });
});

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
function showToast(msg, type) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.className = ''; }, 3500);
}

// ══════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════
function openSidebar() {
  var sb2 = document.getElementById('sidebar');
  var bd  = document.getElementById('sidebar-backdrop');
  if (sb2) sb2.classList.add('open');
  if (bd)  bd.classList.add('show');
}
window.openSidebar = openSidebar;

function closeSidebar() {
  var sb2 = document.getElementById('sidebar');
  var bd  = document.getElementById('sidebar-backdrop');
  if (sb2) sb2.classList.remove('open');
  if (bd)  bd.classList.remove('show');
}
window.closeSidebar = closeSidebar;


// ══════════════════════════════════════════════════════════════
//  PANEL NAVIGATION
// ══════════════════════════════════════════════════════════════
var PANELS = ['map','jobs','pending','techs','clients','completed',
              'approvals','workorders','infractions','earnings','usermgmt','newjob'];

function showPanel(name) {
  PANELS.forEach(function (p) {
    var panel = document.getElementById('panel-' + p);
    var nav   = document.getElementById('nav-' + p);

    if (panel) {
      panel.classList.toggle('active', p === name);
    }

    if (nav) {
      nav.classList.toggle('active', p === name);
    }
  });

  closeSidebar();

  if (name === 'map' && mapInstance) {
    setTimeout(function () { mapInstance.resize(); }, 200);
  }

  if (name === 'earnings') loadEarnings();
}

window.showPanel = showPanel;

// ══════════════════════════════════════════════════════════════
//  SIGN OUT
// ══════════════════════════════════════════════════════════════
function signOut() {
  sb.auth.signOut().then(function () {
    window.location.href = 'index.html';
  });
}
window.signOut = signOut;

// ══════════════════════════════════════════════════════════════
//  LOAD ALL DATA
// ══════════════════════════════════════════════════════════════
function loadAllData() {
  loadJobs();
  loadTechs();
  loadClients();
  loadInfractions();
  loadPendingTechs();
}
window.loadAllData = loadAllData;
window.allTechs = [];


// ── Jobs ───────────────────────────────────────────────────────
function loadJobs() {
  sb.from('jobs').select('*, clients(name), technicians!jobs_technician_id_fkey (full_name)').then(function (res) {
    if (res.error) { console.error('jobs:', res.error); return; }
    allJobs = res.data || [];
    renderJobs();
    updateStats();
  });
}

function renderJobs() {
  var allGrid       = document.getElementById('jobs-grid');
  var pendingGrid   = document.getElementById('pending-grid');
  var completedGrid = document.getElementById('completed-grid');
  var woGrid        = document.getElementById('workorders-grid');
  var badge         = document.getElementById('badge-pending');

  var pending   = allJobs.filter(function (j) { return j.status === 'pending'; });
  var completed = allJobs.filter(function (j) { return j.status === 'completed'; });

  if (badge) badge.textContent = pending.length > 0 ? pending.length : '';

  if (allGrid)       allGrid.innerHTML       = allJobs.map(jobCard).join('');
  if (pendingGrid)   pendingGrid.innerHTML   = pending.map(jobCard).join('');
  if (completedGrid) completedGrid.innerHTML = completed.map(jobCard).join('');
  if (woGrid) woGrid.innerHTML = allJobs.map(workOrderCard).join('');


  if (window.feather) feather.replace();
}

function jobCard(j) {
  var clientName = (j.clients && j.clients.name) ? j.clients.name : 'No Client';
  var techName   = (j.technicians && j.technicians.full_name) ? j.technicians.full_name : 'Unassigned';
  var statusCls  = 'status-' + (j.status || 'pending');
  var priCls     = 'pri-' + (j.priority || 'low');

  var requestedTechs = (j.requested_by_list || [])
    .map(function(id){ return '<li>' + esc(id) + '</li>'; })
    .join('');

  return '' +
    '<div class="job-card glass">' +

      '<div class="job-card-header">' +
        '<span class="job-title">' + esc(j.title || 'Untitled') + '</span>' +
        '<span class="badge ' + statusCls + '">' + esc(j.status || 'pending') + '</span>' +
      '</div>' +

      '<div class="job-meta">' +
        '<span><i data-feather="user"></i> ' + esc(clientName) + '</span>' +
        '<span><i data-feather="tool"></i> ' + esc(techName) + '</span>' +
        '<span class="badge ' + priCls + '">' + esc(j.priority || 'low') + '</span>' +
      '</div>' +

      (j.scheduled_date ? (
        '<div class="job-date"><i data-feather="calendar"></i> ' +
        esc(j.scheduled_date) +
        (j.scheduled_time ? ' @ ' + esc(j.scheduled_time) : '') +
        '</div>'
      ) : '') +

      '<div class="job-section">' +
        '<strong>Description:</strong>' +
        '<div class="job-box">' + esc(j.description || 'No description provided.') + '</div>' +
      '</div>' +

      '<div class="job-section">' +
        '<strong>Notes:</strong>' +
        '<div class="job-box">' + esc(j.notes || 'No notes added.') + '</div>' +
      '</div>' +

      '<div class="job-section">' +
        '<strong>Requested By Technicians:</strong>' +
        '<ul class="job-tech-list">' + requestedTechs + '</ul>' +
      '</div>' +

      '<div class="job-actions">' +
        '<button class="btn-sm btn-blue" onclick="viewDocuments(\'' + j.id + '\')">Documents</button>' +
        '<button class="btn-sm btn-blue" onclick="viewMessages(\'' + j.id + '\')">Messages</button>' +
        '<button class="btn-sm btn-pink" onclick="openAssignModal(\'' + j.id + '\',\'' + esc(j.title) + '\')">Assign</button>' +
        '<button class="btn-sm btn-gray" onclick="unassignJobUI(\'' + j.id + '\')">Unassign</button>' +
      '</div>' +

    '</div>';
}
function workOrderCard(j) {
  var clientName = (j.clients && j.clients.name) ? j.clients.name : 'No Client';
  var techName   = (j.technicians && j.technicians.full_name) ? j.technicians.full_name : 'Unassigned';
  var statusCls  = 'status-' + (j.status || 'pending');
  var priCls     = 'pri-' + (j.priority || 'low');

  var requestedTechs = (j.requested_by_list || [])
    .map(function(id){ return '<li>' + esc(id) + '</li>'; })
    .join('');

  return '' +
    '<div class="workorder-card glass">' +

      '<div class="job-card-header">' +
        '<span class="job-title">' + esc(j.title || 'Untitled') + '</span>' +
        '<span class="badge ' + statusCls + '">' + esc(j.status || 'pending') + '</span>' +
      '</div>' +

      '<div class="job-meta">' +
        '<span><i data-feather="user"></i> ' + esc(clientName) + '</span>' +
        '<span><i data-feather="tool"></i> ' + esc(techName) + '</span>' +
        '<span class="badge ' + priCls + '">' + esc(j.priority || 'low') + '</span>' +
      '</div>' +

      (j.scheduled_date ? (
        '<div class="job-date"><i data-feather="calendar"></i> ' +
        esc(j.scheduled_date) +
        (j.scheduled_time ? ' @ ' + esc(j.scheduled_time) : '') +
        '</div>'
      ) : '') +

      '<div class="job-section">' +
        '<strong>Description:</strong>' +
        '<div class="job-box">' + esc(j.description || 'No description provided.') + '</div>' +
      '</div>' +

      '<div class="job-section">' +
        '<strong>Notes:</strong>' +
        '<div class="job-box">' + esc(j.notes || 'No notes added.') + '</div>' +
      '</div>' +

      '<div class="job-section">' +
        '<strong>Requested By Technicians:</strong>' +
        '<ul class="job-tech-list">' + requestedTechs + '</ul>' +
      '</div>' +

      '<div class="job-actions">' +
        '<button class="btn-sm btn-blue" onclick="viewDocuments(\'' + j.id + '\')">Documents</button>' +
        '<button class="btn-sm btn-blue" onclick="viewMessages(\'' + j.id + '\')">Messages</button>' +
        '<button class="btn-sm btn-pink" onclick="openAssignModal(\'' + j.id + '\',\'' + esc(j.title) + '\')">Assign</button>' +
        '<button class="btn-sm btn-gray" onclick="unassignJobUI(\'' + j.id + '\')">Unassign</button>' +
      '</div>' +

    '</div>';
}



// ── Technicians ────────────────────────────────────────────────
function loadTechs() {
  sb.from('technicians').select('*').then(function (res) {
    if (res.error) { console.error('techs:', res.error); return; }
    window.allTechs = res.data || [];
    renderTechs();
    renderApprovals();
    renderUserMgmt();
    updateStats();
    placeTechMarkers();
    populateTechSelects();
  });
}

function renderTechs() {
  var grid = document.getElementById('techs-grid');
  if (!grid) return;
  var active = allTechs.filter(function (t) { return t.status === 'approved' || t.status === 'active'; });
  grid.innerHTML = active.length === 0
    ? '<p class="empty-msg">No approved technicians yet.</p>'
    : active.map(techCard).join('');
  if (window.feather) feather.replace();
}

function techCard(t) {
  return '<div class="tech-card glass">' +
    '<div class="tech-name">' + esc(t.full_name || 'Unknown') + '</div>' +
    '<div class="tech-meta">' +
      '<span><i data-feather="mail"></i> ' + esc(t.email || '') + '</span>' +
      '<span><i data-feather="phone"></i> ' + esc(t.phone || '') + '</span>' +
      '<span><i data-feather="map-pin"></i> ' + esc(t.city || '') + '</span>' +
    '</div>' +
    '<div class="tech-skills">' + esc(t.skills || '') + '</div>' +
    '<div class="tech-actions">' +
      '<button class="btn-sm btn-outline" onclick="openResetPwModal(\'' + t.id + '\',\'' + esc(t.full_name) + '\')">Reset PW</button>' +
    '</div>' +
  '</div>';
}

function loadPendingTechs() {
  sb.from('pending_technicians').select('*').then(res => {
    window.pendingTechs = res.data || [];
    renderApprovals();
  });
}

// ── Approvals ──────────────────────────────────────────────────
function renderApprovals() {
  const el = document.getElementById("approvals-grid");
  if (!el) return;

  const list = allJobs.filter(j =>
    j.status === 'pending_approval' ||
    j.status === 'approval_pending'
  );

  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <i data-feather="user-check"></i>
        <p>No pending approvals</p>
      </div>
    `;
    feather.replace();
    return;
  }

  el.innerHTML = list.map(a => `
    <div class="card card-large">
      <div class="card-top">
        <div>
          <div class="card-title">${a.title || ''}</div>
          <div class="card-sub">${a.client_name || ''}</div>
        </div>
      </div>

      <div class="card-body">
        <span><strong>Scheduled:</strong> ${a.scheduled_date || ''} ${a.scheduled_time || ''}</span>
        <span><strong>Rate:</strong> $${a.rate || 0}</span>
      </div>

      <div class="card-actions">
        <button class="btn-sm btn-pink" onclick="approveJob('${a.id}')">Approve</button>
        <button class="btn-sm btn-danger" onclick="rejectJob('${a.id}')">Reject</button>
      </div>
    </div>
  `).join('');

  feather.replace();
}

function approveTech(id) {
  sb.from('technicians').update({ status: 'approved' }).eq('id', id).then(function (res) {
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    showToast('Technician approved!', 'success');
    loadTechs();
  });
}
window.approveTech = approveTech;

function rejectTech(id) {
  if (!confirm('Reject and delete this technician?')) return;
  sb.from('technicians').delete().eq('id', id).then(function (res) {
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    showToast('Technician rejected.', 'success');
    loadTechs();
  });
}
window.rejectTech = rejectTech;

// ── User Management ────────────────────────────────────────────
function renderUserMgmt() {
  var grid = document.getElementById('usermgmt-techs-grid');
  if (!grid) return;
  grid.innerHTML = allTechs.length === 0
    ? '<p class="empty-msg">No users found.</p>'
    : allTechs.map(function (t) {
        return '<div class="tech-card glass">' +
          '<div class="tech-name">' + esc(t.full_name || 'Unknown') + '</div>' +
          '<div class="tech-meta">' +
            '<span>' + esc(t.email || '') + '</span>' +
            '<span class="badge status-' + esc(t.status || '') + '">' + esc(t.status || '') + '</span>' +
          '</div>' +
          '<div class="tech-actions">' +
            '<button class="btn-sm btn-outline" onclick="openResetPwModal(\'' + t.id + '\',\'' + esc(t.full_name) + '\')">Reset PW</button>' +
          '</div>' +
        '</div>';
      }).join('');
  if (window.feather) feather.replace();
}

// ── Clients ────────────────────────────────────────────────────
function loadClients() {
  sb.from('clients').select('*').then(function (res) {
    if (res.error) { console.error('clients:', res.error); return; }
    allClients = res.data || [];
    renderClients();
    populateClientSelect();
  });
}

function renderClients() {
  var tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  if (allClients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:.6">No clients yet.</td></tr>';
    return;
  }
  tbody.innerHTML = allClients.map(function (c) {
    return '<tr>' +
      '<td>' + esc(c.name || '') + '</td>' +
      '<td>' + esc(c.email || '') + '</td>' +
      '<td>' + esc(c.phone || '') + '</td>' +
      '<td>' + esc(c.city || '') + '</td>' +
      '<td><button class="btn-sm btn-danger" onclick="deleteClient(\'' + c.id + '\')">Delete</button></td>' +
    '</tr>';
  }).join('');
}

function deleteClient(id) {
  if (!confirm('Delete this client?')) return;
  sb.from('clients').delete().eq('id', id).then(function (res) {
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    showToast('Client deleted.', 'success');
    loadClients();
  });
}
window.deleteClient = deleteClient;

// ── Infractions ────────────────────────────────────────────────
function loadInfractions() {
  sb.from('infractions').select('*, technicians(full_name)').then(function (res) {
    if (res.error) { console.error('infractions:', res.error); return; }
    allInfractions = res.data || [];
    renderInfractions();
  });
}

function renderInfractions() {
  var grid  = document.getElementById('infractions-grid');
  var badge = document.getElementById('badge-infractions');
  if (!grid) return;
  var open = allInfractions.filter(function (i) { return !i.resolved; });
  if (badge) badge.textContent = open.length > 0 ? open.length : '';
  if (allInfractions.length === 0) {
    grid.innerHTML = '<p class="empty-msg">No infractions on record.</p>';
    return;
  }
  grid.innerHTML = allInfractions.map(function (inf) {
    var techName = (inf.technicians && inf.technicians.full_name)
      ? inf.technicians.full_name : 'Unknown';
    return '<div class="infraction-card glass ' + (inf.resolved ? 'resolved' : '') + '">' +
      '<div class="inf-header">' +
        '<span class="inf-tech">' + esc(techName) + '</span>' +
        '<span class="badge sev-' + esc(inf.severity || 'low') + '">' + esc(inf.severity || 'low') + '</span>' +
      '</div>' +
      '<div class="inf-desc">' + esc(inf.description || '') + '</div>' +
      '<div class="inf-reason">' + esc(inf.reason || '') + '</div>' +
      (!inf.resolved
        ? '<button class="btn-sm btn-pink" onclick="resolveInfraction(\'' + inf.id + '\')">Resolve</button>'
        : '<span class="resolved-label">✓ Resolved</span>') +
    '</div>';
  }).join('');
  if (window.feather) feather.replace();
}

function resolveInfraction(id) {
  sb.from('infractions').update({ resolved: true, status: 'resolved' }).eq('id', id).then(function (res) {
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    showToast('Infraction resolved.', 'success');
    loadInfractions();
  });
}
window.resolveInfraction = resolveInfraction;

// ── Earnings ───────────────────────────────────────────────────
function loadEarnings() {
  var completedJobs = allJobs.filter(function (j) { return j.status === 'completed'; });
  var total = completedJobs.reduce(function (sum, j) {
    return sum + (parseFloat(j.job_rate) || 0);
  }, 0);
  setText('earn-total', '$' + total.toFixed(2));
  setText('earn-hours', (completedJobs.length * 2) + 'h');
  setText('earn-count', completedJobs.length);
  renderEarningsBreakdown(completedJobs);
}
window.loadEarnings = loadEarnings;

function renderEarningsBreakdown(jobs) {
  var el = document.getElementById('earnings-breakdown');
  if (!el) return;
  if (jobs.length === 0) { el.innerHTML = '<p class="empty-msg">No completed jobs yet.</p>'; return; }
  el.innerHTML = jobs.map(function (j) {
    return '<div class="earn-row glass">' +
      '<span>' + esc(j.title || 'Untitled') + '</span>' +
      '<span>$' + parseFloat(j.job_rate || 0).toFixed(2) + '</span>' +
    '</div>';
  }).join('');
}

// ── Stats ──────────────────────────────────────────────────────
function updateStats() {
  var active  = allTechs.filter(function (t) {
    return t.status === 'approved' || t.status === 'active';
  }).length;
  var pending = allJobs.filter(function (j) { return j.status === 'pending'; }).length;

  setText('stat-jobs',    allJobs.length);
  setText('stat-active',  active);
  setText('stat-pending', pending);
  setText('stat-techs',   allTechs.length);
  setText('m-stat-jobs',    allJobs.length);
  setText('m-stat-active',  active);
  setText('m-stat-pending', pending);
  setText('m-stat-techs',   allTechs.length);
}

function setText(id, val2) {
  var el = document.getElementById(id);
  if (el) el.textContent = val2;
}

// ══════════════════════════════════════════════════════════════
//  MAP
// ══════════════════════════════════════════════════════════════
function initMap() {
  if (mapInstance) return;
  var container = document.getElementById('map-container');
  if (!container) return;
  mapboxgl.accessToken = MAPBOX_TOKEN;
  mapInstance = new mapboxgl.Map({
    container: 'map-container',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-82.0, 41.5],
    zoom: 9
  });
  mapInstance.addControl(new mapboxgl.NavigationControl());
}

function placeTechMarkers() {
  if (!mapInstance) return;
  techMarkers.forEach(function (m) { m.remove(); });
  techMarkers = [];
  allTechs.forEach(function (t) {
    if (!t.lat || !t.lng) return;
    var el = document.createElement('div');
    el.className = 'tech-marker';
    el.title = t.full_name || 'Tech';
    var marker = new mapboxgl.Marker(el)
      .setLngLat([t.lng, t.lat])
      .setPopup(new mapboxgl.Popup().setHTML(
        '<strong>' + esc(t.full_name || '') + '</strong><br/>' +
        esc(t.city || '') + '<br/>Status: ' + esc(t.status || '')
      ))
      .addTo(mapInstance);
    techMarkers.push(marker);
  });
}

// ══════════════════════════════════════════════════════════════
//  SELECTS
// ══════════════════════════════════════════════════════════════


function populateTechSelect() {
  var sel = document.getElementById('nj-tech');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Technician --</option>' +
    allTechs.map(function (c) {
      return '<option value="' + t.id + '">' + esc(t.full_name) + '</option>';
    }).join('');
}




function populateClientSelect() {
  var sel = document.getElementById('nj-client');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Client --</option>' +
    allClients.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');
}

// ══════════════════════════════════════════════════════════════
//  ASSIGN MODAL
// ══════════════════════════════════════════════════════════════
function openAssignModal(jobId, jobTitle) {
  currentAssignJobId = jobId;
  var titleEl = document.getElementById('modal-job-title');
  if (titleEl) titleEl.textContent = jobTitle || 'Job';
  openModal('assign-modal');
}
window.openAssignModal = openAssignModal;

function confirmAssign() {
  var sel = document.getElementById('modal-tech-select');
  if (!sel || !sel.value) { showToast('Select a technician first.', 'error'); return; }
  if (!currentAssignJobId) { showToast('No job selected.', 'error'); return; }
  sb.from('jobs').update({ technician_id: sel.value, status: 'assigned' })
    .eq('id', currentAssignJobId).then(function (res) {
      if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
      showToast('Technician assigned!', 'success');
      closeModal('assign-modal');
      loadJobs();
    });
}
window.confirmAssign = confirmAssign;

// ══════════════════════════════════════════════════════════════
//  CREATE USER MODAL
// ══════════════════════════════════════════════════════════════
function openCreateUserModal() {
  clearField('cu-name');
  clearField('cu-email');
  clearField('cu-password');
  clearField('cu-phone');
  clearField('cu-city');
  var roleEl = document.getElementById('cu-role');
  if (roleEl) roleEl.value = 'technician';
  setError('cu-error', '');
  toggleTechFields();
  openModal('create-user-modal');
}
window.openCreateUserModal = openCreateUserModal;

function toggleTechFields() {
  var roleEl    = document.getElementById('cu-role');
  var techBlock = document.getElementById('cu-tech-fields');
  if (!roleEl || !techBlock) return;
  techBlock.style.display = (roleEl.value === 'technician') ? '' : 'none';
}
window.toggleTechFields = toggleTechFields;

function createUser() {
  var name  = val('cu-name');
  var email = val('cu-email');
  var pass  = val('cu-password');
  var role  = val('cu-role') || 'technician';
  var phone = val('cu-phone');
  var city  = val('cu-city');

  if (!name || !email || !pass) {
    setError('cu-error', 'Name, email and password are required.');
    return;
  }
  if (pass.length < 6) {
    setError('cu-error', 'Password must be at least 6 characters.');
    return;
  }

  var btn = document.getElementById('cu-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  setError('cu-error', '');

  sb.auth.signUp({
    email: email,
    password: pass,
    options: { data: { full_name: name, role: role } }
  }).then(function (res) {
    if (res.error) {
      var msg = res.error.message || 'Signup error';
      setError('cu-error', msg);
      if (btn) { btn.disabled = false; btn.textContent = 'Create User'; }
      return;
    }

    var userId = res.data && res.data.user && res.data.user.id;

    // Insert into technicians table if role = technician
    if (userId && role === 'technician') {
      sb.from('technicians').insert({
        user_id:   userId,
        full_name: name,
        email:     email,
        phone:     phone,
        city:      city,
        status:    'approved',
        role:      'technician',
        is_active: true
      }).then(function (insRes) {
        if (insRes.error) console.warn('Tech row insert error:', insRes.error);
      });
    }

    showToast('User created: ' + email, 'success');
    closeModal('create-user-modal');
    if (btn) { btn.disabled = false; btn.textContent = 'Create User'; }

    // Refresh the correct panel
    loadTechs();
  }).catch(function (e) {
    setError('cu-error', e.message || 'Unknown error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create User'; }
  });
}
window.createUser = createUser;


// ══════════════════════════════════════════════════════════════
//  RESET PASSWORD MODAL
// ══════════════════════════════════════════════════════════════
function openResetPwModal(techId, techName) {
  var uidEl   = document.getElementById('reset-pw-uid');
  var labelEl = document.getElementById('reset-pw-label');
  if (uidEl)   uidEl.value       = techId || '';
  if (labelEl) labelEl.textContent = 'Reset password for: ' + (techName || '');
  clearField('reset-pw-input');
  clearField('reset-pw-confirm');
  setError('reset-pw-error', '');
  openModal('reset-pw-modal');
}
window.openResetPwModal = openResetPwModal;
window.openResetPw = openResetPwModal;

function confirmResetPw() {
  var newPw    = val('reset-pw-input');
  var confirm2 = val('reset-pw-confirm');
  if (!newPw || newPw.length < 6) {
    setError('reset-pw-error', 'Password must be at least 6 characters.');
    return;
  }
  if (newPw !== confirm2) {
    setError('reset-pw-error', 'Passwords do not match.');
    return;
  }
  sb.auth.updateUser({ password: newPw }).then(function (res) {
    if (res.error) { setError('reset-pw-error', res.error.message); return; }
    showToast('Password updated!', 'success');
    closeModal('reset-pw-modal');
  });
}
window.confirmResetPw = confirmResetPw;

// ══════════════════════════════════════════════════════════════
//  CREATE CLIENT MODAL
// ══════════════════════════════════════════════════════════════
function openCreateClientModal() {
  clearField('cc-name');
  clearField('cc-email');
  clearField('cc-phone');
  clearField('cc-city');
  clearField('cc-address');
  setError('cc-error', '');
  openModal('create-client-modal');
}
window.openCreateClientModal = openCreateClientModal;

function createClient() {
  var name    = val('cc-name');
  var email   = val('cc-email');
  var phone   = val('cc-phone');
  var city    = val('cc-city');
  var address = val('cc-address');

  if (!name) { setError('cc-error', 'Client name is required.'); return; }

  var btn = document.querySelector('#create-client-modal .btn-pink');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  setError('cc-error', '');

  sb.from('clients')
    .insert({ name: name, email: email, phone: phone, city: city, address: address })
    .then(function (res) {
      if (res.error) {
        setError('cc-error', res.error.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Add Client'; }
        return;
      }
      showToast('Client added!', 'success');
      closeModal('create-client-modal');
      if (btn) { btn.disabled = false; btn.textContent = 'Add Client'; }
      loadClients();
    });
}
window.createClient = createClient;

// ══════════════════════════════════════════════════════════════
//  NEW JOB / WORK ORDER
// ══════════════════════════════════════════════════════════════
function createWorkOrder() {
  var title    = val('nj-title');
  var desc     = val('nj-description');
  var clientId = val('nj-client');
  var techId   = val('nj-tech');
  var priority = val('nj-priority') || 'low';
  var rate     = val('nj-rate');
  var date     = val('nj-date');
  var time     = val('nj-time');
  var notes    = val('nj-notes');

  if (!title || !clientId) {
    showToast('Title and client are required.', 'error');
    return;
  }

  sb.from('jobs').insert({
    title:          title,
    description:    desc     || null,
    client_id:      clientId || null,
    technician_id:  techId   || null,
    priority:       priority,
    status:         techId ? 'assigned' : 'pending',
    job_rate:       rate  ? parseFloat(rate) : null,
    scheduled_date: date  || null,
    scheduled_time: time  || null,
    notes:          notes || null
  }).then(function (res) {
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    showToast('Work order created!', 'success');
    ['nj-title','nj-description','nj-client','nj-tech',
     'nj-rate','nj-date','nj-time','nj-notes'].forEach(clearField);
    loadJobs();
    showPanel('workorders');
  });
}
window.createWorkOrder = createWorkOrder;

// ══════════════════════════════════════════════════════════════
//  WORK ORDER FILTERS
// ══════════════════════════════════════════════════════════════
function filterWorkOrders(status, el) {
  var tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(function (t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');

  var grid = document.getElementById('workorders-grid');
  if (!grid) return;
  var filtered = status === 'all'
    ? allJobs
    : allJobs.filter(function (j) { return j.status === status; });
  grid.innerHTML = filtered.map(jobCard).join('');
  if (window.feather) feather.replace();
}
window.filterWorkOrders = filterWorkOrders;

// ══════════════════════════════════════════════════════════════
//  MODAL HELPERS
// ══════════════════════════════════════════════════════════════
function openModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
window.closeModal = closeModal;

// ══════════════════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════════════════
function val(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function clearField(id) {
  var el = document.getElementById(id);
  if (el) el.value = '';
}

function setError(id, msg) {
  var el = document.getElementById(id);
  if (el) el.textContent = msg || '';
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


if (jobs.technician_id === null) {
  showAssignButton(job.id);
} else {
  showUnassignButton(job.id);
}

async function loadPendingRequests() {
  try {
    const { data, error } = await sb
      .from("job_requests")
      .select("id, job_id, tech_id, status, created_at, jobs(title, location)")
      .eq("status", "Pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const container = document.getElementById("pending-requests-list");
    container.innerHTML = "";

    data.forEach(req => {
      const item = document.createElement("div");
      item.className = "request-item";
      item.innerHTML = `
        <h3>${req.jobs.title}</h3>
        <p>Tech: ${req.tech_id}</p>
        <p>Requested: ${new Date(req.created_at).toLocaleString()}</p>
        <button onclick="approveRequest('${req.id}', '${req.job_id}', '${req.tech_id}')">Approve</button>
        <button onclick="denyRequest('${req.id}')">Deny</button>
      `;
      container.appendChild(item);
    });

  } catch (err) {
    console.error(err);
    showToast("Failed to load requests.");
  }
}


function renderAdminJobRequests(reqs) {
  const el = document.getElementById("jobrequests-grid");
  if (!el) return;

  if (reqs.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <i data-feather="file-text"></i>
        <p>No job requests</p>
      </div>
    `;
    return;
  }

  el.innerHTML = reqs.map(r => `
    <div class="card card-large">
      <div class="card-top">
        <div>
          <div class="card-title">${r.jobs.title}</div>
          <div class="card-sub">${r.jobs.clients.name} — ${r.jobs.clients.address}</div>
        </div>
      </div>

      <div class="card-body">
        <span><strong>Requested By:</strong> ${r.technicians.full_name}</span>
        <span><strong>Scheduled:</strong> ${r.jobs.scheduled_date} ${r.jobs.scheduled_time}</span>

        <div class="desc-scroll">
          ${r.jobs.description || "No description provided."}
        </div>
      </div>

      <div class="card-actions">
        <button class="btn-sm btn-pink"
                onclick="approveRequest('${r.id}', '${r.job_id}', '${r.tech_id}')">
          Approve
        </button>

        <button class="btn-sm btn-danger"
                onclick="rejectRequest('${r.id}')">
          Reject
        </button>
      </div>
    </div>
  `).join("");

  feather.replace();
}


async function closeJob(jobId) {
  try {
    const timestamp = new Date().toISOString();

    const { data, error } = await sb
      .from("jobs")
      .update({
        status: "closed",
        closed_at: timestamp
      })
      .eq("id", jobId);

    if (error) throw error;

    showToast("Job closed successfully.");
    loadAllJobs(); 
    showPanel("jobs-panel");

  } catch (err) {
    console.error(err);
    showToast("Failed to close job.");
  }
}

function workOrderCard(j) {
  var clientName = (j.clients && j.clients.name) ? j.clients.name : 'No Client';
  var techName   = (j.technicians && j.technicians.full_name) ? j.technicians.full_name : 'Unassigned';
  var statusCls  = 'status-' + (j.status || 'pending');
  var priCls     = 'pri-' + (j.priority || 'low');

  var requestedTechs = (j.requested_by_list || [])
    .map(id => '<li>' + esc(id) + '</li>')
    .join('');

  return '' +
    '<div class="workorder-card-wide">' +

      '<h3 class="wo-title">' + esc(j.title || 'Untitled') + '</h3>' +

      '<div class="wo-row">' +
        '<p><strong>Client:</strong> ' + esc(clientName) + '</p>' +
        '<p><strong>Address:</strong> ' + esc(j.clients?.address || 'N/A') + '</p>' +
      '</div>' +

      '<div class="wo-row">' +
        '<p><strong>Status:</strong> ' + esc(j.status || 'N/A') + '</p>' +
        '<p><strong>Priority:</strong> ' + esc(j.priority || 'normal') + '</p>' +
      '</div>' +

      '<div class="wo-row">' +
        '<p><strong>Scheduled:</strong> ' + esc(j.scheduled_date || 'N/A') +
        (j.scheduled_time ? ' @ ' + esc(j.scheduled_time) : '') +
        '</p>' +
      '</div>' +

      '<div class="wo-section">' +
        '<strong>Description:</strong>' +
        '<div class="wo-box">' + esc(j.description || 'No description provided.') + '</div>' +
      '</div>' +

      '<div class="wo-section">' +
        '<strong>Notes:</strong>' +
        '<div class="wo-box">' + esc(j.notes || 'No notes added.') + '</div>' +
      '</div>' +

      '<div class="wo-section">' +
        '<strong>Requested By Technicians:</strong>' +
        '<ul class="wo-tech-list">' + requestedTechs + '</ul>' +
      '</div>' +

      '<div class="wo-actions">' +
        '<button onclick="viewDocuments(\'' + j.id + '\')">Documents</button>' +
        '<button onclick="viewMessages(\'' + j.id + '\')">Messages</button>' +
        '<button onclick="openAssignModal(\'' + j.id + '\',\'' + esc(j.title) + '\')">Assign</button>' +
        '<button onclick="unassignJobUI(\'' + j.id + '\')">Unassign</button>' +
      '</div>' +

    '</div>';
}
window.viewDocuments = function(jobId) {
  console.log("View Documents for:", jobId);
  alert("Documents viewer coming soon for job " + jobId);
};

window.viewMessages = function(jobId) {
  console.log("View Messages for:", jobId);
  alert("Messages viewer coming soon for job " + jobId);
};

window.unassignJobUI = function(jobId) {
  console.log("Unassign job:", jobId);
  alert("Unassign function coming soon for job " + jobId);
};

window.openAssignModal = function(jobId, jobTitle) {
  console.log("Assign modal opened for:", jobId, jobTitle);
  alert("Assign modal coming soon for job " + jobTitle);
};

// ── Global Work Order Actions ────────────────────────────────
window.viewDocuments = function(jobId) {
  console.log("View Documents for:", jobId);
  alert("Documents viewer coming soon for job " + jobId);
};

window.viewMessages = function(jobId) {
  console.log("View Messages for:", jobId);
  alert("Messages viewer coming soon for job " + jobId);
};

window.unassignJobUI = function(jobId) {
  console.log("Unassign job:", jobId);
  alert("Unassign function coming soon for job " + jobId);
};

window.openAssignModal = function(jobId, jobTitle) {
  console.log("Assign modal opened for:", jobId, jobTitle);
  alert("Assign modal coming soon for job " + jobTitle);
};
window.populateTechSelects = function() {
  // Find ALL dropdowns that should contain technicians
  var selects = document.querySelectorAll('.tech-select');
  if (!selects.length) return;

  // Build the options
  var options = window.allTechs.map(function(t) {
    return '<option value="' + t.id + '">' + esc(t.full_name || 'Unnamed Tech') + '</option>';
  }).join('');

  // Insert into every dropdown
  selects.forEach(function(sel) {
    sel.innerHTML = options;
  });
};

};
function loadPendingTechs() {
  sb.from('pending_technicians').select('*').then(res => {
    window.pendingTechs = res.data || [];
    renderApprovals();
  });
}

