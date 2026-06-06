const SUPABASE_URL = 'https://iazvpykfdckpffhakncd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA'; // ← PASTE YOUR KEY HERE

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAPBOX_TOKEN = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

/* ── STATE ──────────────────────────────────────── */
let allJobs = [], allTechs = [], allClients = [],
    allInfractions = [], allAdmins = [];
let mapInstance = null, mapInitialized = false;
let currentAssignJobId = null, currentResetUserId = null;
let currentPanel = 'map';

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  const safetyTimer = setTimeout(() => hideLoader(), 3000);

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const email = session.user.email;
    setEl('signed-in-email', email);
    setEl('topbar-email', email);

    await loadAllData();
  } catch (err) {
    console.error('Init error:', err);
    showToast('Error loading dashboard', 'error');
  }

  clearTimeout(safetyTimer);
  hideLoader();
  if (window.feather) feather.replace();
  initMap();
  setupBottomNav();
  populateNewJobForm();
});

function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.style.opacity = '0';
  loader.style.transition = 'opacity 0.4s ease';
  setTimeout(() => { loader.style.display = 'none'; }, 420);
}

/* ══════════════════════════════════════════════════
   DATA LOADING
══════════════════════════════════════════════════ */
async function loadAllData() {
  const results = await Promise.allSettled([
    loadJobs(), loadTechs(), loadClients(), loadInfractions(), loadAdmins()
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.warn(`Load[${i}] failed:`, r.reason);
  });
  updateStats();
  updateBadges();
  populateNewJobForm();
}

async function loadJobs() {
  const { data, error } = await sb.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  allJobs = data || [];
  renderJobs(); renderPendingJobs(); renderCompletedJobs(); renderWorkOrders(); renderEarnings();
}

async function loadTechs() {
  const { data, error } = await sb.from('technicians').select('*');
  if (error) throw error;
  allTechs = data || [];
  renderTechs(); updateMapMarkers(); renderApprovals();
}

async function loadClients() {
  const { data, error } = await sb.from('clients').select('*');
  if (error) throw error;
  allClients = data || [];
  renderClients();
}

async function loadInfractions() {
  const { data, error } = await sb.from('infractions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  allInfractions = data || [];
  renderInfractions();
}

async function loadAdmins() {
  const { data, error } = await sb.from('admins').select('*');
  if (error) throw error;
  allAdmins = data || [];
  renderUserMgmt();
}

/* ── STATS ──────────────────────────────────────── */
function updateStats() {
  const active = allJobs.filter(j => j.status === 'active' || j.status === 'in_progress').length;
  const pending = allJobs.filter(j => j.status === 'pending').length;
  setEl('stat-jobs', allJobs.length);
  setEl('stat-active', active);
  setEl('stat-pending', pending);
  setEl('stat-techs', allTechs.length);
  setEl('m-stat-jobs', allJobs.length);
  setEl('m-stat-active', active);
  setEl('m-stat-pending', pending);
  setEl('m-stat-techs', allTechs.length);
}

function updateBadges() {
  const pending = allJobs.filter(j => j.status === 'pending').length;
  const approvals = allTechs.filter(t => t.status === 'pending_approval').length;
  const infractions = allInfractions.filter(i => i.status === 'open').length;
  const bp = document.getElementById('badge-pending');
  const ba = document.getElementById('badge-approvals');
  const bi = document.getElementById('badge-infractions');
  if (bp) { bp.textContent = pending || ''; bp.style.display = pending ? 'inline-block' : 'none'; }
  if (ba) { ba.textContent = approvals || ''; ba.style.display = approvals ? 'inline-block' : 'none'; }
  if (bi) { bi.textContent = infractions || ''; bi.style.display = infractions ? 'inline-block' : 'none'; }
}

/* ══════════════════════════════════════════════════
   PANEL NAVIGATION
══════════════════════════════════════════════════ */
function showPanel(name) {
  currentPanel = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  const navEl  = document.getElementById('nav-' + name);
  if (panel) panel.classList.add('active');
  if (navEl)  navEl.classList.add('active');
  const titles = {
    map:'Live Map', jobs:'All Jobs', pending:'Pending Jobs', techs:'Technicians',
    clients:'Clients', completed:'Completed', approvals:'Approvals',
    workorders:'Work Orders', infractions:'Infractions',
    earnings:'Earnings & Hours', usermgmt:'User Management', newjob:'New Work Order'
  };
  setEl('topbar-title', titles[name] || 'Dashboard');
  if (name === 'map' && !mapInitialized) initMap();
  closeSidebar();
  syncBottomNav(name);
}

/* ══════════════════════════════════════════════════
   SIDEBAR — MOBILE
══════════════════════════════════════════════════ */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  const bd = document.getElementById('sidebar-backdrop');
  if (bd) bd.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const sb2 = document.getElementById('sidebar');
  if (sb2) sb2.classList.remove('open');
  const bd = document.getElementById('sidebar-backdrop');
  if (bd) bd.classList.remove('show');
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════════════════
   BOTTOM NAV
══════════════════════════════════════════════════ */
function setupBottomNav() {
  const map = { 'bnav-map':'map', 'bnav-jobs':'jobs', 'bnav-techs':'techs', 'bnav-newjob':'newjob' };
  Object.entries(map).forEach(([id, panel]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => showPanel(panel));
  });
  const more = document.getElementById('bnav-more');
  if (more) more.addEventListener('click', openSidebar);
}

function syncBottomNav(name) {
  const map = { map:'bnav-map', jobs:'bnav-jobs', techs:'bnav-techs', newjob:'bnav-newjob' };
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  const id = map[name];
  if (id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
}

/* ══════════════════════════════════════════════════
   MAP
══════════════════════════════════════════════════ */
function initMap() {
  if (mapInitialized) return;
  const container = document.getElementById('map-container');
  if (!container) return;
  mapInitialized = true;
  mapboxgl.accessToken = MAPBOX_TOKEN;
  mapInstance = new mapboxgl.Map({
    container: 'map-container',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-83.0, 41.6], zoom: 9
  });
  mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
  mapInstance.on('load', updateMapMarkers);
}

function updateMapMarkers() {
  if (!mapInstance || !mapInitialized) return;
  allTechs.forEach(tech => {
    if (!tech.lat || !tech.lng) return;
    const el = document.createElement('div');
    el.style.cssText = `width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#7c3aed);border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;cursor:pointer;box-shadow:0 0 12px rgba(255,79,159,.5);`;
    el.textContent = techInitials(tech);
    new mapboxgl.Marker(el)
      .setLngLat([tech.lng, tech.lat])
      .setPopup(new mapboxgl.Popup({ offset: 22 }).setHTML(
        `<div style="background:#12121e;color:#fff;padding:12px;border-radius:10px;font-family:Inter,sans-serif;min-width:160px;">
          <div style="font-weight:700;margin-bottom:4px;">${esc(techName(tech))}</div>
          <div style="font-size:11px;opacity:.5;">${esc(tech.city || '')}</div>
          <div style="margin-top:8px;">${badge(tech.status || 'offline')}</div>
        </div>`
      ))
      .addTo(mapInstance);
  });
}

/* ══════════════════════════════════════════════════
   RENDER — JOBS
══════════════════════════════════════════════════ */
function renderJobs() {
  const grid = document.getElementById('jobs-grid');
  if (!grid) return;
  grid.innerHTML = allJobs.length ? allJobs.map(j => jobCard(j)).join('') : emptyState('No jobs found');
  if (window.feather) feather.replace();
}

function renderPendingJobs() {
  const grid = document.getElementById('pending-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j => j.status === 'pending');
  grid.innerHTML = jobs.length ? jobs.map(j => jobCard(j, true)).join('') : emptyState('No pending jobs');
  if (window.feather) feather.replace();
}

function renderCompletedJobs() {
  const grid = document.getElementById('completed-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j => j.status === 'completed');
  grid.innerHTML = jobs.length ? jobs.map(j => jobCard(j)).join('') : emptyState('No completed jobs');
  if (window.feather) feather.replace();
}

function jobCard(j, showAssign = false) {
  const tech   = allTechs.find(t => t.user_id === j.technician_id);
  const client = allClients.find(c => c.id === j.client_id);
  return `
    <div class="job-card">
      <div class="job-card-title">${esc(j.title || 'Untitled Job')}</div>
      <div class="job-card-meta">
        ${client ? `<i data-feather="user" style="width:11px;display:inline"></i> ${esc(client.name)}<br>` : ''}
        ${tech ? `<i data-feather="tool" style="width:11px;display:inline"></i> ${esc(techName(tech))}<br>` : '<span style="opacity:.4">Unassigned</span><br>'}
        ${j.scheduled_date ? `<i data-feather="calendar" style="width:11px;display:inline"></i> ${formatDate(j.scheduled_date)}` : ''}
        ${j.job_rate ? ` · $${parseFloat(j.job_rate).toFixed(2)}` : ''}
      </div>
      <div class="job-card-footer">
        ${badge(j.status || 'pending')}
        ${badge(j.priority || 'low')}
        ${showAssign ? `<button class="btn btn-sm btn-primary" onclick="openAssignModal('${j.id}','${esc(j.title || '')}')"><i data-feather="user-plus"></i> Assign</button>` : ''}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════
   RENDER — TECHNICIANS
══════════════════════════════════════════════════ */
function renderTechs() {
  const grid = document.getElementById('techs-grid');
  if (!grid) return;
  if (!allTechs.length) { grid.innerHTML = emptyState('No technicians found'); return; }
  grid.innerHTML = allTechs.map(tech => `
    <div class="tech-card">
      <div class="tech-card-header">
        <div class="tech-avatar">${techInitials(tech)}</div>
        <div>
          <div class="tech-name">${esc(techName(tech))}</div>
          <div class="tech-meta">${esc(tech.email || '')}${tech.city ? ' · ' + esc(tech.city) : ''}</div>
        </div>
        <div style="margin-left:auto">${badge(tech.status || 'offline')}</div>
      </div>
      ${tech.skills && tech.skills.length ? `<div class="tech-skills">${(Array.isArray(tech.skills) ? tech.skills : [tech.skills]).map(s => `<span class="tech-skill">${esc(s)}</span>`).join('')}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" onclick="openResetPwModal('${tech.user_id}','${esc(techName(tech))}')"><i data-feather="key"></i> Reset PW</button>
      </div>
    </div>`).join('');
  if (window.feather) feather.replace();
}

/* ══════════════════════════════════════════════════
   RENDER — CLIENTS
══════════════════════════════════════════════════ */
function renderClients() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  if (!allClients.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.35;padding:36px">No clients yet</td></tr>`;
    return;
  }
  tbody.innerHTML = allClients.map(c => `
    <tr>
      <td><strong>${esc(c.name || '')}</strong></td>
      <td>${esc(c.email || '')}</td>
      <td>${esc(c.phone || '')}</td>
      <td>${esc(c.city || '')}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteClient('${c.id}')"><i data-feather="trash-2"></i> Delete</button></td>
    </tr>`).join('');
  if (window.feather) feather.replace();
}

/* ══════════════════════════════════════════════════
   RENDER — APPROVALS
══════════════════════════════════════════════════ */
function renderApprovals() {
  const grid = document.getElementById('approvals-grid');
  if (!grid) return;
  const pending = allTechs.filter(t => t.status === 'pending_approval');
  if (!pending.length) { grid.innerHTML = emptyState('No pending approvals'); return; }
  grid.innerHTML = pending.map(tech => `
    <div class="tech-card">
      <div class="tech-card-header">
        <div class="tech-avatar">${techInitials(tech)}</div>
        <div>
          <div class="tech-name">${esc(techName(tech))}</div>
          <div class="tech-meta">${esc(tech.email || '')}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <button class="btn btn-sm btn-primary" onclick="approveTech('${tech.user_id}')"><i data-feather="check"></i> Approve</button>
        <button class="btn btn-sm btn-danger"  onclick="rejectTech('${tech.user_id}')"><i data-feather="x"></i> Reject</button>
      </div>
    </div>`).join('');
  if (window.feather) feather.replace();
}

/* ══════════════════════════════════════════════════
   RENDER — WORK ORDERS
══════════════════════════════════════════════════ */
function renderWorkOrders() {
  const grid = document.getElementById('workorders-grid');
  if (!grid) return;
  if (!allJobs.length) { grid.innerHTML = emptyState('No work orders'); return; }
  grid.innerHTML = allJobs.map(j => {
    const tech   = allTechs.find(t => t.user_id === j.technician_id);
    const client = allClients.find(c => c.id === j.client_id);
    return `
      <div class="job-card">
        <div class="job-card-title">${esc(j.title || 'Untitled')}</div>
        <div class="job-card-meta">
          ${client ? `Client: ${esc(client.name)}<br>` : ''}
          ${tech ? `Tech: ${esc(techName(tech))}<br>` : 'Unassigned<br>'}
          ${j.scheduled_date ? `Date: ${formatDate(j.scheduled_date)}` : ''}
          ${j.scheduled_time ? ` @ ${j.scheduled_time}` : ''}
          ${j.job_rate ? `<br>Rate: $${parseFloat(j.job_rate).toFixed(2)}` : ''}
        </div>
        <div class="job-card-footer">${badge(j.status || 'pending')} ${badge(j.priority || 'low')}</div>
      </div>`;
  }).join('');
}

function filterWorkOrders() {
  const status = val('wo-filter-status');
  const techId = val('wo-filter-tech');
  let jobs = [...allJobs];
  if (status) jobs = jobs.filter(j => j.status === status);
  if (techId) jobs = jobs.filter(j => j.technician_id === techId);
  const grid = document.getElementById('workorders-grid');
  if (!grid) return;
  if (!jobs.length) { grid.innerHTML = emptyState('No matching work orders'); return; }
  grid.innerHTML = jobs.map(j => {
    const tech   = allTechs.find(t => t.user_id === j.technician_id);
    const client = allClients.find(c => c.id === j.client_id);
    return `<div class="job-card">
      <div class="job-card-title">${esc(j.title || 'Untitled')}</div>
      <div class="job-card-meta">
        ${client ? `Client: ${esc(client.name)}<br>` : ''}
        ${tech ? `Tech: ${esc(techName(tech))}<br>` : 'Unassigned<br>'}
        ${j.scheduled_date ? `Date: ${formatDate(j.scheduled_date)}` : ''}
      </div>
      <div class="job-card-footer">${badge(j.status || 'pending')}</div>
    </div>`;
  }).join('');
}

function populateNewJobForm() {
  const clientSel = document.getElementById('nj-client');
  const techSel   = document.getElementById('nj-tech');
  const woTech    = document.getElementById('wo-filter-tech');
  if (clientSel) clientSel.innerHTML = '<option value="">Select client…</option>' + allClients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (techSel)   techSel.innerHTML   = '<option value="">Select technician…</option>' + allTechs.map(t => `<option value="${t.user_id}">${esc(techName(t))}</option>`).join('');
  if (woTech)    woTech.innerHTML    = '<option value="">All Technicians</option>' + allTechs.map(t => `<option value="${t.user_id}">${esc(techName(t))}</option>`).join('');
}

async function createWorkOrder() {
  const title    = val('nj-title');
  const desc     = val('nj-description');
  const clientId = val('nj-client');
  const techId   = val('nj-tech');
  const priority = val('nj-priority');
  const rate     = val('nj-rate');
  const date     = val('nj-date');
  const time     = val('nj-time');
  const notes    = val('nj-notes');
  if (!title) { showToast('Please enter a job title', 'error'); return; }
  const btn = document.getElementById('nj-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  const { error } = await sb.from('jobs').insert([{
    title, description: desc,
    client_id: clientId || null,
    technician_id: techId || null,
    priority: priority || 'medium',
    job_rate: rate ? parseFloat(rate) : null,
    scheduled_date: date || null,
    scheduled_time: time || null,
    notes,
    status: 'pending',
    created_at: new Date().toISOString()
  }]);
  if (btn) { btn.disabled = false; btn.textContent = 'Create Work Order'; }
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Work order created!', 'success');
  ['nj-title','nj-description','nj-client','nj-tech','nj-rate','nj-date','nj-time','nj-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  await loadJobs();
  showPanel('workorders');
}

/* ══════════════════════════════════════════════════
   RENDER — INFRACTIONS
══════════════════════════════════════════════════ */
function renderInfractions() {
  const grid = document.getElementById('infractions-grid');
  if (!grid) return;
  if (!allInfractions.length) { grid.innerHTML = emptyState('No infractions reported'); return; }
  grid.innerHTML = allInfractions.map(inf => {
    const tech = allTechs.find(t => t.user_id === inf.technician_id);
    return `
      <div class="infraction-card">
        <div class="infraction-header">
          <div>
            <strong>${tech ? esc(techName(tech)) : 'Unknown Tech'}</strong>
            <span style="font-size:11px;opacity:.42;margin-left:8px">${formatDate(inf.created_at)}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${badge(inf.severity || 'low')} ${badge(inf.status || 'open')}
          </div>
        </div>
        <div class="infraction-desc">${esc(inf.description || '')}</div>
        ${inf.status !== 'resolved' ? `<button class="btn btn-sm btn-outline" onclick="resolveInfraction('${inf.id}')"><i data-feather="check-circle"></i> Resolve</button>` : ''}
      </div>`;
  }).join('');
  if (window.feather) feather.replace();
}

/* ══════════════════════════════════════════════════
   RENDER — EARNINGS
══════════════════════════════════════════════════ */
function renderEarnings() {
  const completed = allJobs.filter(j => j.status === 'completed');
  let total = 0, totalMinutes = 0;
  completed.forEach(j => {
    if (j.job_rate) total += parseFloat(j.job_rate);
    if (j.check_in_time && j.check_out_time) {
      const diff = new Date(j.check_out_time) - new Date(j.check_in_time);
      if (diff > 0) totalMinutes += Math.round(diff / 60000);
    }
  });
  setEl('earn-total', '$' + total.toFixed(2));
  setEl('earn-hours', formatMinutes(totalMinutes));
  setEl('earn-count', completed.length);
  const breakdown = document.getElementById('earnings-breakdown');
  if (!breakdown) return;
  if (!allTechs.length) { breakdown.innerHTML = emptyState('No data'); return; }
  breakdown.innerHTML = allTechs.map(tech => {
    const techJobs = completed.filter(j => j.technician_id === tech.user_id);
    let tEarn = 0, tMins = 0;
    techJobs.forEach(j => {
      if (j.job_rate) tEarn += parseFloat(j.job_rate);
      if (j.check_in_time && j.check_out_time) {
        const diff = new Date(j.check_out_time) - new Date(j.check_in_time);
        if (diff > 0) tMins += Math.round(diff / 60000);
      }
    });
    return `
      <div class="tech-card" style="flex-direction:row;align-items:center;gap:14px;flex-wrap:wrap;">
        <div class="tech-avatar">${techInitials(tech)}</div>
        <div style="flex:1;min-width:120px">
          <div class="tech-name">${esc(techName(tech))}</div>
          <div class="tech-meta">${techJobs.length} completed job${techJobs.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;text-align:center">
          <div><div style="font-size:18px;font-weight:800;color:#4ade80">$${tEarn.toFixed(2)}</div><div style="font-size:10px;opacity:.4">Earnings</div></div>
          <div><div style="font-size:18px;font-weight:800;color:#60a5fa">${formatMinutes(tMins)}</div><div style="font-size:10px;opacity:.4">Hours</div></div>
        </div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════
   RENDER — USER MANAGEMENT
══════════════════════════════════════════════════ */
function renderUserMgmt() {
  const adminsGrid = document.getElementById('admins-grid');
  const techsGrid  = document.getElementById('usermgmt-techs-grid');
  if (adminsGrid) {
    adminsGrid.innerHTML = allAdmins.length ? allAdmins.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,.04);border-radius:12px;margin-bottom:8px;">
        <div class="tech-avatar" style="width:36px;height:36px;font-size:12px">${initials(a.name || a.email || '')}</div>
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:700">${esc(a.name || 'Admin')}</div>
          <div style="font-size:11.5px;opacity:.4">${esc(a.email || '')}</div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="openResetPwModal('${a.user_id}','${esc(a.name || a.email)}')"><i data-feather="key"></i> Reset PW</button>
      </div>`).join('') : emptyState('No admins');
  }
  if (techsGrid) {
    techsGrid.innerHTML = allTechs.length ? allTechs.map(t => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,.04);border-radius:12px;margin-bottom:8px;">
        <div class="tech-avatar" style="width:36px;height:36px;font-size:12px">${techInitials(t)}</div>
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:700">${esc(techName(t))}</div>
          <div style="font-size:11.5px;opacity:.4">${esc(t.email || '')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${badge(t.status || 'offline')}
          <button class="btn btn-sm btn-outline" onclick="openResetPwModal('${t.user_id}','${esc(techName(t))}')"><i data-feather="key"></i> Reset PW</button>
        </div>
      </div>`).join('') : emptyState('No technicians');
  }
  if (window.feather) feather.replace();
}

/* ══════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════ */
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) {
  if (id) { const el = document.getElementById(
