/* ═══════════════════════════════════════════════════════════════
   Plush Intentions — Admin Dashboard JS
   Supabase URL : https://faithkncd.supabase.co
   !! Replace YOUR_SUPABASE_ANON_KEY with your real anon/public key
═══════════════════════════════════════════════════════════════ */

const SUPABASE_URL  = 'https://iazvpykfdckpffhakncd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA';   // ← paste your key here

const MAPBOX_TOKEN  = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

/* ── Supabase client ──────────────────────────────────────── */
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── Global state ─────────────────────────────────────────── */
let allJobs      = [];
let allTechs     = [];
let allClients   = [];
let allInfract   = [];
let currentJobId = null;
let mapInstance  = null;
let mapMarkers   = [];

/* ═══════════════════════════════════════════════════════════
   INIT — session check then load data
═══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  feather.replace();

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  await loadAll();
  setTimeout(hideLoder, 3000);
});

function hideLoder() {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   LOAD ALL DATA
═══════════════════════════════════════════════════════════ */
async function loadAll() {
  const results = await Promise.allSettled([
    sb.from('jobs').select('*'),
    sb.from('technicians').select('*'),
    sb.from('clients').select('*'),
    sb.from('infractions').select('*'),
  ]);

  const [jobsRes, techsRes, clientsRes, infractRes] = results;

  if (jobsRes.status === 'fulfilled' && !jobsRes.value.error) {
    allJobs = jobsRes.value.data || [];
  } else {
    console.warn('Jobs table error:', jobsRes.reason || jobsRes.value?.error?.message);
    allJobs = [];
  }

  if (techsRes.status === 'fulfilled' && !techsRes.value.error) {
    allTechs = techsRes.value.data || [];
  } else {
    console.warn('Technicians table error:', techsRes.reason || techsRes.value?.error?.message);
    allTechs = [];
  }

  if (clientsRes.status === 'fulfilled' && !clientsRes.value.error) {
    allClients = clientsRes.value.data || [];
  } else {
    console.warn('Clients table error:', clientsRes.reason || clientsRes.value?.error?.message);
    allClients = [];
  }

  if (infractRes.status === 'fulfilled' && !infractRes.value.error) {
    allInfract = infractRes.value.data || [];
  } else {
    console.warn('Infractions table error:', infractRes.reason || infractRes.value?.error?.message);
    allInfract = [];
  }

  updateStats();
  updateBadges();
  renderJobs();
  renderPendingJobs();
  renderTechs();
  renderClients();
  renderCompletedJobs();
  renderApprovals();
  renderWorkOrders();
  renderInfractions();
  renderEarnings();
  renderUserMgmt();
  populateNewJobForm();
  initMap();

  hideLoder();
}

/* ═══════════════════════════════════════════════════════════
   STATS & BADGES
═══════════════════════════════════════════════════════════ */
function updateStats() {
  const totalJobs   = allJobs.length;
  const activeJobs  = allJobs.filter(j => j.status === 'active' || j.status === 'in_progress').length;
  const pendingJobs = allJobs.filter(j => j.status === 'pending').length;
  const totalTechs  = allTechs.length;

  setEl('stat-jobs',    totalJobs);
  setEl('stat-active',  activeJobs);
  setEl('stat-pending', pendingJobs);
  setEl('stat-techs',   totalTechs);

  setEl('m-stat-jobs',    totalJobs);
  setEl('m-stat-active',  activeJobs);
  setEl('m-stat-pending', pendingJobs);
  setEl('m-stat-techs',   totalTechs);
}

function updateBadges() {
  const pending   = allJobs.filter(j => j.status === 'pending').length;
  const approvals = allTechs.filter(t => t.status === 'pending_approval').length;
  const infracts  = allInfract.filter(i => !i.resolved).length;

  const bp = document.getElementById('badge-pending');
  const ba = document.getElementById('badge-approvals');
  const bi = document.getElementById('badge-infractions');

  if (bp) { bp.textContent = pending || ''; bp.style.display = pending ? 'inline-flex' : 'none'; }
  if (ba) { ba.textContent = approvals || ''; ba.style.display = approvals ? 'inline-flex' : 'none'; }
  if (bi) { bi.textContent = infracts || ''; bi.style.display = infracts ? 'inline-flex' : 'none'; }
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION / PANEL
═══════════════════════════════════════════════════════════ */
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');

  const navLink = document.getElementById('nav-' + name);
  if (navLink) navLink.classList.add('active');

  const bnavItem = document.getElementById('bnav-' + name);
  if (bnavItem) bnavItem.classList.add('active');

  if (name === 'map' && mapInstance) {
    setTimeout(() => mapInstance.resize(), 100);
  }

  closeSidebar();
}

/* ── Sidebar (mobile) ─────────────────────────────────────── */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) backdrop.classList.add('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) backdrop.classList.remove('active');
}

/* ═══════════════════════════════════════════════════════════
   MAP
═══════════════════════════════════════════════════════════ */
function initMap() {
  if (mapInstance) return;

  mapboxgl.accessToken = MAPBOX_TOKEN;

  mapInstance = new mapboxgl.Map({
    container : 'map-container',
    style     : 'mapbox://styles/mapbox/dark-v11',
    center    : [-83.3, 41.7],
    zoom      : 9,
  });

  mapInstance.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
  mapInstance.on('load', () => plotMapMarkers());
}

function plotMapMarkers() {
  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];

  allTechs.forEach(t => {
    if (!t.latitude || !t.longitude) return;
    const el = document.createElement('div');
    el.className = 'map-marker-tech';
    el.title = techName(t);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([t.longitude, t.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 25 })
        .setHTML(`<strong>${esc(techName(t))}</strong><br>Technician`))
      .addTo(mapInstance);
    mapMarkers.push(marker);
  });

  allJobs.forEach(j => {
    if (!j.latitude || !j.longitude) return;
    const el = document.createElement('div');
    el.className = 'map-marker-job';
    el.title = j.title || 'Job';

    const marker = new mapboxgl.Marker(el)
      .setLngLat([j.longitude, j.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 25 })
        .setHTML(`<strong>${esc(j.title || 'Job')}</strong><br>${esc(j.status || '')}`))
      .addTo(mapInstance);
    mapMarkers.push(marker);
  });
}

/* ═══════════════════════════════════════════════════════════
   RENDER — ALL JOBS
═══════════════════════════════════════════════════════════ */
function renderJobs() {
  const grid = document.getElementById('jobs-grid');
  if (!grid) return;

  if (!allJobs.length) {
    grid.innerHTML = emptyState('briefcase', 'No jobs found');
    return;
  }

  grid.innerHTML = allJobs.map(j => {
    const tech = allTechs.find(t => t.id === j.technician_id);
    return `
      <div class="job-card glass">
        <div class="job-card-header">
          <span class="job-title">${esc(j.title || 'Untitled Job')}</span>
          ${badge(j.status)}
        </div>
        <div class="job-meta">
          <span><i data-feather="user" style="width:12px;height:12px"></i> ${tech ? esc(techName(tech)) : 'Unassigned'}</span>
          <span><i data-feather="calendar" style="width:12px;height:12px"></i> ${formatDate(j.scheduled_date || j.created_at)}</span>
        </div>
        ${j.description ? `<p class="job-desc">${esc(j.description)}</p>` : ''}
        ${j.address ? `<p class="job-addr"><i data-feather="map-pin" style="width:11px;height:11px"></i> ${esc(j.address)}</p>` : ''}
        ${j.job_rate ? `<p class="job-rate">$${parseFloat(j.job_rate).toFixed(2)}/hr</p>` : ''}
      </div>`;
  }).join('');

  feather.replace();
}

/* ═══════════════════════════════════════════════════════════
   RENDER — PENDING JOBS
═══════════════════════════════════════════════════════════ */
function renderPendingJobs() {
  const grid = document.getElementById('pending-grid');
  if (!grid) return;

  const pending = allJobs.filter(j => j.status === 'pending');

  if (!pending.length) {
    grid.innerHTML = emptyState('clock', 'No pending jobs');
    return;
  }

  grid.innerHTML = pending.map(j => `
    <div class="job-card glass">
      <div class="job-card-header">
        <span class="job-title">${esc(j.title || 'Untitled Job')}</span>
        ${badge(j.status)}
      </div>
      <div class="job-meta">
        <span><i data-feather="calendar" style="width:12px;height:12px"></i> ${formatDate(j.scheduled_date || j.created_at)}</span>
        ${j.priority ? `<span class="priority-${j.priority}">${j.priority.toUpperCase()}</span>` : ''}
      </div>
      ${j.description ? `<p class="job-desc">${esc(j.description)}</p>` : ''}
      <button class="btn-assign" onclick="openAssignModal('${j.id}','${esc(j.title || 'Job')}')">
        <i data-feather="user-plus"></i> Assign Technician
      </button>
    </div>`).join('');

  feather.replace();
}

function filterPending() {
  const q = (document.getElementById('pending-search')?.value || '').toLowerCase();
  document.querySelectorAll('#pending-grid .job-card').forEach(c => {
    c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

/* ═══════════════════════════════════════════════════════════
   RENDER — COMPLETED JOBS
═══════════════════════════════════════════════════════════ */
function renderCompletedJobs() {
  const grid = document.getElementById('completed-grid');
  if (!grid) return;

  const done = allJobs.filter(j => j.status === 'completed');

  if (!done.length) {
    grid.innerHTML = emptyState('check-circle', 'No completed jobs yet');
    return;
  }

  grid.innerHTML = done.map(j => {
    const tech     = allTechs.find(t => t.id === j.technician_id);
    const hours    = calcHours(j.check_in_time, j.check_out_time);
    const earnings = hours && j.job_rate ? (hours * parseFloat(j.job_rate)).toFixed(2) : null;

    return `
      <div class="job-card glass">
        <div class="job-card-header">
          <span class="job-title">${esc(j.title || 'Completed Job')}</span>
          ${badge('completed')}
        </div>
        <div class="job-meta">
          <span><i data-feather="user" style="width:12px;height:12px"></i> ${tech ? esc(techName(tech)) : 'Unassigned'}</span>
          <span><i data-feather="calendar" style="width:12px;height:12px"></i> ${formatDate(j.completed_at || j.updated_at)}</span>
        </div>
        ${hours !== null ? `<p class="job-meta"><i data-feather="clock" style="width:12px;height:12px"></i> ${hours.toFixed(2)} hrs${earnings ? ` · <strong>$${earnings}</strong>` : ''}</p>` : ''}
        ${j.notes ? `<p class="job-desc">${esc(j.notes)}</p>` : ''}
      </div>`;
  }).join('');

  feather.replace();
}

/* ═══════════════════════════════════════════════════════════
   RENDER — TECHNICIANS
═══════════════════════════════════════════════════════════ */
function renderTechs() {
  const grid = document.getElementById('techs-grid');
  if (!grid) return;

  const active = allTechs.filter(t => t.status !== 'pending_approval');

  if (!active.length) {
    grid.innerHTML = emptyState('users', 'No technicians yet');
    return;
  }

  grid.innerHTML = active.map(t => {
    const hasGPS   = t.latitude && t.longitude;
    const assigned = allJobs.filter(j => j.technician_id === t.id && j.status !== 'completed').length;
    return `
      <div class="tech-card glass">
        <div class="tech-avatar">${techInitials(t)}</div>
        <div class="tech-info">
          <div class="tech-name">${esc(techName(t))}</div>
          <div class="tech-email">${esc(t.email || '')}</div>
          ${t.phone ? `<div class="tech-email">${esc(t.phone)}</div>` : ''}
          <div class="tech-meta">
            <span class="gps-${hasGPS ? 'on' : 'off'}">${hasGPS ? '● GPS Active' : '○ No GPS'}</span>
            <span>${assigned} active job${assigned !== 1 ? 's' : ''}</span>
          </div>
          ${t.skills ? `<div class="tech-skills">${t.skills.split(',').map(s => `<span class="skill-tag">${esc(s.trim())}</span>`).join('')}</div>` : ''}
        </div>
        <button class="btn-sm btn-outline" onclick="openResetPwModal('${t.id}','${esc(techName(t))}')">
          Reset PW
        </button>
      </div>`;
  }).join('');

  feather.replace();
}

/* ═══════════════════════════════════════════════════════════
   RENDER — CLIENTS
═══════════════════════════════════════════════════════════ */
function renderClients() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;

  if (!allClients.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.4;padding:32px">No clients yet</td></tr>`;
    return;
  }

  tbody.innerHTML = allClients.map(c => `
    <tr>
      <td>${esc(c.name || '')}</td>
      <td>${esc(c.email || '')}</td>
      <td>${esc(c.phone || '')}</td>
      <td>${esc(c.address || '')}</td>
      <td><button class="btn-sm btn-danger" onclick="deleteClient('${c.id}')">Delete</button></td>
    </tr>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   RENDER — APPROVALS
═══════════════════════════════════════════════════════════ */
function renderApprovals() {
  const grid = document.getElementById('approvals-grid');
  if (!grid) return;

  const pending = allTechs.filter(t => t.status === 'pending_approval');

  if (!pending.length) {
    grid.innerHTML = emptyState('check-circle', 'No pending approvals');
    return;
  }

  grid.innerHTML = pending.map(t => `
    <div class="approval-card glass">
      <div class="tech-avatar">${techInitials(t)}</div>
      <div class="approval-info">
        <div class="tech-name">${esc(techName(t))}</div>
        <div class="tech-email">${esc(t.email || '')}</div>
        ${t.city ? `<div class="tech-email">${esc(t.city)}</div>` : ''}
      </div>
      <div class="approval-actions">
        <button class="btn-sm btn-success" onclick="approveTech('${t.id}')">Approve</button>
        <button class="btn-sm btn-danger"  onclick="rejectTech('${t.id}')">Reject</button>
      </div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   RENDER — WORK ORDERS
═══════════════════════════════════════════════════════════ */
function renderWorkOrders() {
  const grid = document.getElementById('workorders-grid');
  if (!grid) return;

  const statusFilter = val('wo-filter-status') || 'all';
  const techFilter   = val('wo-filter-tech')   || 'all';

  let filtered = [...allJobs];
  if (statusFilter !== 'all') filtered = filtered.filter(j => j.status === statusFilter);
  if (techFilter   !== 'all') filtered = filtered.filter(j => j.technician_id === techFilter);

  const techSelect = document.getElementById('wo-filter-tech');
  if (techSelect && techSelect.options.length <= 1) {
    allTechs.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = techName(t);
      techSelect.appendChild(opt);
    });
  }

  if (!filtered.length) {
    grid.innerHTML = emptyState('file-text', 'No work orders match filters');
    return;
  }

  grid.innerHTML = filtered.map(j => {
    const tech  = allTechs.find(t => t.id === j.technician_id);
    const hours = calcHours(j.check_in_time, j.check_out_time);
    return `
      <div class="job-card glass">
        <div class="job-card-header">
          <span class="job-title">${esc(j.title || 'Work Order')}</span>
          ${badge(j.status)}
        </div>
        <div class="job-meta">
          <span><i data-feather="user" style="width:12px;height:12px"></i> ${tech ? esc(techName(tech)) : 'Unassigned'}</span>
          <span><i data-feather="calendar" style="width:12px;height:12px"></i> ${formatDate(j.scheduled_date || j.created_at)}</span>
          ${hours !== null ? `<span><i data-feather="clock" style="width:12px;height:12px"></i> ${hours.toFixed(2)} hrs</span>` : ''}
        </div>
        ${j.description ? `<p class="job-desc">${esc(j.description)}</p>` : ''}
        ${j.job_rate ? `<span class="job-rate">$${parseFloat(j.job_rate).toFixed(2)}/hr</span>` : ''}
      </div>`;
  }).join('');

  feather.replace();
}

function filterWorkOrders() { renderWorkOrders(); }

/* ═══════════════════════════════════════════════════════════
   RENDER — INFRACTIONS
═══════════════════════════════════════════════════════════ */
function renderInfractions() {
  const grid = document.getElementById('infractions-grid');
  if (!grid) return;

  if (!allInfract.length) {
    grid.innerHTML = emptyState('alert-triangle', 'No infractions recorded');
    return;
  }

  grid.innerHTML = allInfract.map(i => {
    const tech = allTechs.find(t => t.id === i.technician_id);
    return `
      <div class="infraction-card glass${i.resolved ? ' resolved' : ''}">
        <div class="infraction-header">
          <span class="infraction-severity sev-${(i.severity || 'low').toLowerCase()}">${(i.severity || 'low').toUpperCase()}</span>
          <span class="infraction-date">${formatDate(i.created_at)}</span>
        </div>
        <div class="tech-name" style="margin:8px 0 4px">${tech ? esc(techName(tech)) : 'Unknown Tech'}</div>
        <p class="job-desc">${esc(i.description || i.reason || '')}</p>
        ${!i.resolved
          ? `<button class="btn-sm btn-outline" style="margin-top:10px" onclick="resolveInfraction('${i.id}')">Mark Resolved</button>`
          : `<span style="opacity:.4;font-size:12px">✓ Resolved</span>`}
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   RENDER — EARNINGS & HOURS
═══════════════════════════════════════════════════════════ */
function renderEarnings() {
  const completed = allJobs.filter(j => j.status === 'completed');

  let totalEarnings = 0;
  let totalMinutes  = 0;
  const byTech = {};

  completed.forEach(j => {
    const hours = calcHours(j.check_in_time, j.check_out_time);
    const earn  = hours && j.job_rate ? hours * parseFloat(j.job_rate) : 0;

    totalEarnings += earn;
    if (hours) totalMinutes += hours * 60;

    const tid = j.technician_id || 'unassigned';
    if (!byTech[tid]) byTech[tid] = { jobs: 0, minutes: 0, earnings: 0 };
    byTech[tid].jobs++;
    byTech[tid].minutes  += hours ? hours * 60 : 0;
    byTech[tid].earnings += earn;
  });

  setEl('earn-total', '$' + totalEarnings.toFixed(2));
  setEl('earn-hours', (totalMinutes / 60).toFixed(1) + ' hrs');
  setEl('earn-count', completed.length);

  const breakdown = document.getElementById('earnings-breakdown');
  if (!breakdown) return;

  if (!Object.keys(byTech).length) {
    breakdown.innerHTML = emptyState('dollar-sign', 'No completed jobs with earnings');
    return;
  }

  breakdown.innerHTML = Object.entries(byTech).map(([tid, data]) => {
    const tech = allTechs.find(t => t.id === tid);
    return `
      <div class="earn-row glass">
        <div class="tech-avatar small">${tech ? techInitials(tech) : '?'}</div>
        <div style="flex:1">
          <div class="tech-name">${tech ? esc(techName(tech)) : 'Unassigned'}</div>
          <div class="tech-email">${data.jobs} job${data.jobs !== 1 ? 's' : ''} · ${(data.minutes / 60).toFixed(1)} hrs</div>
        </div>
        <div class="earn-amount">$${data.earnings.toFixed(2)}</div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   RENDER — USER MANAGEMENT
═══════════════════════════════════════════════════════════ */
function renderUserMgmt() {
  const adminsGrid = document.getElementById('admins-grid');
  const techsGrid  = document.getElementById('usermgmt-techs-grid');

  const admins = allTechs.filter(t => t.role === 'admin');
  const techs  = allTechs.filter(t => t.role !== 'admin');

  if (adminsGrid) {
    adminsGrid.innerHTML = !admins.length
      ? `<p style="opacity:.4;font-size:13px">No admins listed.</p>`
      : admins.map(a => `
        <div class="user-row glass">
          <div class="tech-avatar small">${techInitials(a)}</div>
          <div style="flex:1">
            <div class="tech-name">${esc(techName(a))}</div>
            <div class="tech-email">${esc(a.email || '')}</div>
          </div>
          <button class="btn-sm btn-outline" onclick="openResetPwModal('${a.id}','${esc(techName(a))}')">Reset PW</button>
        </div>`).join('');
  }

  if (techsGrid) {
    techsGrid.innerHTML = !techs.length
      ? `<p style="opacity:.4;font-size:13px">No technicians listed.</p>`
      : techs.map(t => `
        <div class="user-row glass">
          <div class="tech-avatar small">${techInitials(t)}</div>
          <div style="flex:1">
            <div class="tech-name">${esc(techName(t))}</div>
            <div class="tech-email">${esc(t.email || '')}</div>
          </div>
          <button class="btn-sm btn-outline" onclick="openResetPwModal('${t.id}','${esc(techName(t))}')">Reset PW</button>
        </div>`).join('');
  }
}

/* ═══════════════════════════════════════════════════════════
   NEW JOB FORM
═══════════════════════════════════════════════════════════ */
function populateNewJobForm() {
  const clientSel = document.getElementById('nj-client');
  const techSel   = document.getElementById('nj-tech');

  if (clientSel) {
    clientSel.innerHTML = '<option value="">Select client…</option>' +
      allClients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  if (techSel) {
    const active = allTechs.filter(t => t.status !== 'pending_approval');
    techSel.innerHTML = '<option value="">Select technician (optional)…</option>' +
      active.map(t => `<option value="${t.id}">${esc(techName(t))}</option>`).join('');
  }
}

async function createWorkOrder() {
  const title    = val('nj-title');
  const desc     = val('nj-description');
  const clientId = val('nj-client');
  const techId   = val('nj-tech');
  const priority = val('nj-priority') || 'normal';
  const rate     = val('nj-rate');
  const date     = val('nj-date');
  const time     = val('nj-time');
  const notes    = val('nj-notes');

  if (!title) { showToast('Please enter a job title.', 'error'); return; }

  const scheduled = date ? (time ? `${date}T${time}` : date) : null;

  const { error } = await sb.from('jobs').insert([{
    title,
    description   : desc || null,
    client_id     : clientId || null,
    technician_id : techId || null,
    priority,
    job_rate      : rate ? parseFloat(rate) : null,
    scheduled_date: scheduled,
    notes         : notes || null,
    status        : techId ? 'assigned' : 'pending',
  }]);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast('Work order created!', 'success');
  ['nj-title','nj-description','nj-client','nj-tech','nj-priority','nj-rate','nj-date','nj-time','nj-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  await loadAll();
  showPanel('workorders');
}

/* ═══════════════════════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════════════════════ */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModal();
});

/* ═══════════════════════════════════════════════════════════
   ASSIGN MODAL
═══════════════════════════════════════════════════════════ */
function openAssignModal(jobId, jobTitle) {
  currentJobId = jobId;
  setEl('modal-job-title', `Assign a technician to: "${jobTitle}"`);

  const sel = document.getElementById('modal-tech-select');
  if (sel) {
    const active = allTechs.filter(t => t.status !== 'pending_approval');
    sel.innerHTML = '<option value="">Choose technician…</option>' +
      active.map(t => `<option value="${t.id}">${esc(techName(t))}</option>`).join('');
  }

  openModal('assign-modal');
}

async function confirmAssign() {
  const techId = val('modal-tech-select');
  if (!techId) { showToast('Please choose a technician.', 'error'); return; }
  if (!currentJobId) return;

  const { error } = await sb.from('jobs')
    .update({ technician_id: techId, status: 'assigned' })
    .eq('id', currentJobId);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast('Technician assigned!', 'success');
  closeModal();
  currentJobId = null;
  await loadAll();
}

/* ═══════════════════════════════════════════════════════════
   CREATE USER MODAL
═══════════════════════════════════════════════════════════ */
function openCreateUserModal() {
  ['cu-name','cu-email','cu-password','cu-phone','cu-city','cu-skills'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const roleEl = document.getElementById('cu-role');
  if (roleEl) roleEl.value = 'technician';
  toggleTechFields();
  openModal('create-user-modal');
}

function toggleTechFields() {
  const role   = val('cu-role');
  const fields = document.getElementById('cu-tech-fields');
  if (fields) fields.style.display = role === 'technician' ? '' : 'none';
}

async function createUser() {
  const name     = val('cu-name');
  const email    = val('cu-email');
  const password = val('cu-password');
  const role     = val('cu-role') || 'technician';
  const phone    = val('cu-phone');
  const city     = val('cu-city');
  const skills   = val('cu-skills');

  if (!name || !email || !password) {
    showToast('Name, email, and password are required.', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  const { data: authData, error: authErr } = sb.auth.admin
    ? await sb.auth.admin.createUser({ email, password, email_confirm: true })
    : await sb.auth.signUp({ email, password });

  if (authErr) { showToast('Auth error: ' + authErr.message, 'error'); return; }

  const uid = authData?.user?.id;
  if (!uid) {
    showToast('Could not get user ID. Check Supabase email confirmation settings.', 'error');
    return;
  }

  const { error: profileErr } = await sb.from('technicians').upsert([{
    id       : uid,
    full_name: name,
    email,
    role,
    status   : 'active',
    ...(phone  ? { phone }  : {}),
    ...(city   ? { city }   : {}),
    ...(skills ? { skills } : {}),
  }]);

  if (profileErr) { showToast('Profile error: ' + profileErr.message, 'error'); return; }

  showToast(`${role === 'admin' ? 'Admin' : 'Technician'} "${name}" created!`, 'success');
  closeModal();
  await loadAll();
}

/* ═══════════════════════════════════════════════════════════
   RESET PASSWORD MODAL
═══════════════════════════════════════════════════════════ */
let resetTargetId = null;

function openResetPwModal(techId, techNameStr) {
  resetTargetId = techId;
  const label = document.getElementById('reset-pw-label');
  if (label) label.textContent = `Reset password for ${techNameStr}`;
  const inp = document.getElementById('reset-pw-input');
  if (inp) inp.value = '';
  openModal('reset-pw-modal');
}

async function confirmResetPw() {
  const newPw = val('reset-pw-input');
  if (!newPw || newPw.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  if (sb.auth.admin) {
    const { error } = await sb.auth.admin.updateUserById(resetTargetId, { password: newPw });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Password reset successfully!', 'success');
  } else {
    await sb.from('technicians').update({ password_reset_requested: true }).eq('id', resetTargetId);
    showToast('Reset flag saved — apply via Supabase Dashboard.', 'info');
  }

  closeModal();
  resetTargetId = null;
}

/* ═══════════════════════════════════════════════════════════
   CREATE CLIENT MODAL
═══════════════════════════════════════════════════════════ */
function openCreateClientModal() {
  ['cc-name','cc-email','cc-phone','cc-address'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  openModal('create-client-modal');
}

async function createClient() {
  const name    = val('cc-name');
  const email   = val('cc-email');
  const phone   = val('cc-phone');
  const address = val('cc-address');

  if (!name) { showToast('Client name is required.', 'error'); return; }

  const { error } = await sb.from('clients').insert([{ name, email, phone, address }]);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast('Client added!', 'success');
  closeModal();
  await loadAll();
}

async function deleteClient(id) {
  if (!confirm('Delete this client? This cannot be undone.')) return;
  const { error } = await sb.from('clients').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Client deleted.', 'success');
  await loadAll();
}

/* ═══════════════════════════════════════════════════════════
   APPROVALS
═══════════════════════════════════════════════════════════ */
async function approveTech(id) {
  const { error } = await sb.from('technicians').update({ status: 'active' }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Technician approved!', 'success');
  await loadAll();
}

async function rejectTech(id) {
  if (!confirm('Reject and remove this technician application?')) return;
  const { error } = await sb.from('technicians').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Application rejected.', 'success');
  await loadAll();
}

/* ═══════════════════════════════════════════════════════════
   INFRACTIONS
═══════════════════════════════════════════════════════════ */
async function resolveInfraction(id) {
  const { error } = await sb.from('infractions').update({ resolved: true }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Infraction marked resolved.', 'success');
  await loadAll();
}

/* ═══════════════════════════════════════════════════════════
   SIGN OUT
═══════════════════════════════════════════════════════════ */
async function signOut() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = 'toast-visible toast-' + type;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = ''; }, 3500);
}

/* ═══════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════ */

/* Handles both `name` and `full_name` column names */
function techName(t) {
  return t.full_name || t.name || t.email || 'Unknown';
}

function techInitials(t) {
  const n = techName(t);
  const parts = n.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function initials(str) {
  if (!str) return '?';
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badge(status) {
  const map = {
    pending    : ['badge-yellow', 'Pending'],
    assigned   : ['badge-blue',   'Assigned'],
    active     : ['badge-blue',   'Active'],
    in_progress: ['badge-blue',   'In Progress'],
    completed  : ['badge-green',  'Completed'],
    cancelled  : ['badge-red',    'Cancelled'],
  };
  const [cls, label] = map[status] || ['badge-gray', status || 'Unknown'];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function emptyState(icon, msg) {
  return `<div class="empty-state"><i data-feather="${icon}"></i><p>${msg}</p></div>`;
}

function formatDate(str) {
  if (!str) return '–';
  try {
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return str; }
}

function formatMinutes(mins) {
  if (!mins && mins !== 0) return '–';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function calcHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  try {
    const ms = new Date(checkOut) - new Date(checkIn);
    return ms > 0 ? ms / 3600000 : null;
  } catch { return null; }
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
