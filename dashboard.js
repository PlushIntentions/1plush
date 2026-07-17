/* ═══════════════════════════════════════════════════════════════
   PLUSH INTENTIONS — Admin Dashboard JS
   ---------------------------------------------------------------
   ⚠️  Replace SUPABASE_URL and SUPABASE_ANON below with your
       values from: supabase.com → Project Settings → API
═══════════════════════════════════════════════════════════════ */

const SUPABASE_URL  = 'https://iazvpykfdckpffhakncd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA'; // ← paste your anon/public key here

const MAPBOX_TOKEN  = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── State ─────────────────────────────────────────────────── */
let map            = null;
let mapMarkers     = [];
let allJobs        = [];
let allTechs       = [];
let allClients     = [];
let allAdmins      = [];
let allInfractions = [];
let activeJobId    = null;
let currentPanel   = 'map';

/* ══════════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  const loaderTimer = setTimeout(hideLoader, 2000);
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    const email = session.user?.email || '–';
    setEl('signed-in-email', email);
    await loadAllData();
  } catch (err) {
    console.error('Boot error:', err);
    showToast('Error loading dashboard', 'error');
  } finally {
    clearTimeout(loaderTimer);
    hideLoader();
  }
  if (window.feather) feather.replace();
  initMap();
});

/* ══════════════════════════════════════════════════════════════
   LOADER
══════════════════════════════════════════════════════════════ */
function hideLoader() {
  const l = document.getElementById('loader');
  if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 400); }
}

/* ══════════════════════════════════════════════════════════════
   LOAD DATA
══════════════════════════════════════════════════════════════ */
async function loadAllData() {
  const results = await Promise.allSettled([
    loadJobs(), loadTechs(), loadClients(), loadAdmins(), loadInfractions()
  ]);
  results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`Load[${i}] failed:`, r.reason); });
  updateStats();
  updateBadges();
  refreshCurrentPanel();
  if (window.feather) feather.replace();
}

async function loadJobs() {
  const { data, error } = await sb.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  allJobs = data || [];
}
async function loadTechs() {
  const { data, error } = await sb.from('technicians').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  allTechs = data || [];
}
async function loadClients() {
  const { data, error } = await sb.from('clients').select('*').order('name', { ascending: true });
  if (error) throw error;
  allClients = data || [];
}
async function loadAdmins() {
  const { data, error } = await sb.from('admins').select('*');
  if (error) throw error;
  allAdmins = data || [];
}
async function loadInfractions() {
  const { data, error } = await sb.from('infractions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  allInfractions = data || [];
}

/* ── Stats & Badges ─────────────────────────────────────────── */
function updateStats() {
  const total   = allJobs.length;
  const active  = allJobs.filter(j => j.status === 'active').length;
  const pending = allJobs.filter(j => j.status === 'pending').length;
  const techs   = allTechs.length;
  setEl('stat-jobs', total);    setEl('m-stat-jobs', total);
  setEl('stat-active', active); setEl('m-stat-active', active);
  setEl('stat-pending', pending); setEl('m-stat-pending', pending);
  setEl('stat-techs', techs);  setEl('m-stat-techs', techs);
}
function updateBadges() {
  setBadge('badge-pending',     allJobs.filter(j => j.status === 'pending').length);
  setBadge('badge-approvals',   allTechs.filter(t => t.status === 'pending_review').length);
  setBadge('badge-infractions', allInfractions.filter(i => i.status !== 'resolved').length);
}
function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) { el.textContent = count; el.style.display = 'inline-flex'; }
  else el.style.display = 'none';
}

/* ══════════════════════════════════════════════════════════════
   PANEL NAVIGATION
══════════════════════════════════════════════════════════════ */
const panelTitles = {
  map:'Live Map', jobs:'All Jobs', pending:'Pending Jobs', techs:'Technicians',
  clients:'Clients', completed:'Completed Jobs', approvals:'Pending Approvals',
  workorders:'Work Orders', infractions:'Infractions',
  earnings:'Earnings & Hours', usermgmt:'User Management', newjob:'New Work Order'
};

function showPanel(name) {
  currentPanel = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  const bNav = document.getElementById('bnav-' + name);
  if (bNav) bNav.classList.add('active');
  setEl('topbar-title', panelTitles[name] || name);
  closeSidebar();
  renderPanel(name);
  if (window.feather) feather.replace();
}

function refreshCurrentPanel() { renderPanel(currentPanel); }

function renderPanel(name) {
  switch (name) {
    case 'map':        renderMap();              break;
    case 'jobs':       renderJobs();             break;
    case 'pending':    renderPending();          break;
    case 'techs':      renderTechs();            break;
    case 'clients':    renderClients();          break;
    case 'completed':  renderCompleted();        break;
    case 'approvals':  renderApprovals();        break;
    case 'workorders': renderWorkOrders('all');  break;
    case 'infractions':renderInfractions();      break;
    case 'earnings':   renderEarnings();         break;
    case 'usermgmt':   renderUserMgmt();         break;
    case 'newjob':     populateNewJobForm();     break;
  }
}

/* ══════════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════════ */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════════════════════════════
   MAP
══════════════════════════════════════════════════════════════ */
function initMap() {
  try {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: 'map-container',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-82.5, 41.1], zoom: 7
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', () => plotMapMarkers());
  } catch (e) { console.error('Map init failed:', e); }
}
function renderMap() {
  if (map) { setTimeout(() => { map.resize(); plotMapMarkers(); }, 150); }
}
function plotMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];
  allTechs.forEach(t => {
    if (!t.lat || !t.lng) return;
    const el = document.createElement('div');
    el.className = 'map-marker tech-marker';
    const m = new mapboxgl.Marker(el).setLngLat([t.lng, t.lat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<strong>${techName(t)}</strong><br/>Last seen: ${formatTime(t.last_seen)}`
      )).addTo(map);
    mapMarkers.push(m);
  });
  allJobs.forEach(j => {
    const client = allClients.find(c => c.id === j.client_id);
    if (!client?.lat || !client?.lng) return;
    const el = document.createElement('div');
    el.className = 'map-marker job-marker';
    const m = new mapboxgl.Marker(el).setLngLat([client.lng, client.lat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<strong>${j.title}</strong><br/>Status: ${j.status}<br/>Client: ${client.name}`
      )).addTo(map);
    mapMarkers.push(m);
  });
}

/* ══════════════════════════════════════════════════════════════
   RENDER FUNCTIONS
══════════════════════════════════════════════════════════════ */
function renderJobs() {
  const grid = document.getElementById('jobs-grid');
  if (!grid) return;
  grid.innerHTML = allJobs.length ? allJobs.map(jobCard).join('') : emptyState('briefcase','No jobs found');
}
function renderPending() {
  const grid = document.getElementById('pending-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j => j.status === 'pending');
  grid.innerHTML = jobs.length ? jobs.map(j => jobCard(j, true)).join('') : emptyState('clock','No pending jobs');
}
function renderCompleted() {
  const grid = document.getElementById('completed-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j => j.status === 'completed');
  grid.innerHTML = jobs.length ? jobs.map(jobCard).join('') : emptyState('check-circle','No completed jobs');
}
function renderWorkOrders(filter) {
  const grid = document.getElementById('workorders-grid');
  if (!grid) return;
  const jobs = filter === 'all' ? allJobs : allJobs.filter(j => j.status === filter);
  grid.innerHTML = jobs.length ? jobs.map(j => jobCard(j, j.status === 'pending')).join('') : emptyState('file-text','No work orders');
}
function filterWorkOrders(filter, btn) {
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderWorkOrders(filter);
  if (window.feather) feather.replace();
}

function jobCard(j, showAssign = false) {
  const tech   = allTechs.find(t => t.user_id === j.technician_id);
  const client = allClients.find(c => c.id === j.client_id);
  const rate   = j.job_rate ? `$${parseFloat(j.job_rate).toFixed(2)}` : '–';
  const pclass = j.priority || 'normal';
  return `
  <div class="job-card glass">
    <div class="job-card-header">
      <span class="job-title">${esc(j.title)}</span>
      <span class="status-pill ${j.status || 'pending'}">${j.status || 'pending'}</span>
    </div>
    <div class="job-meta">
      <span><i data-feather="user"></i> ${client ? esc(client.name) : 'No client'}</span>
      <span><i data-feather="tool"></i> ${tech ? techName(tech) : 'Unassigned'}</span>
      <span><i data-feather="dollar-sign"></i> ${rate}</span>
      ${j.scheduled_date ? `<span><i data-feather="calendar"></i> ${j.scheduled_date}</span>` : ''}
    </div>
    ${j.description ? `<p class="job-desc">${esc(j.description)}</p>` : ''}
    <div class="job-actions">
      ${showAssign ? `<button class="btn-sm btn-primary" onclick="openAssignModal('${j.id}','${esc(j.title)}')"><i data-feather="user-plus"></i> Assign</button>` : ''}
      <span class="priority-pill ${pclass}">${pclass}</span>
    </div>
  </div>`;
}

function renderTechs() {
  const grid = document.getElementById('techs-grid');
  if (!grid) return;
  grid.innerHTML = allTechs.length ? allTechs.map(techCard).join('') : emptyState('users','No technicians found');
}
function techCard(t) {
  const online = t.last_seen && (Date.now() - new Date(t.last_seen).getTime()) < 5 * 60 * 1000;
  const skills = Array.isArray(t.skills) ? t.skills : (t.skills ? [t.skills] : []);
  return `
  <div class="tech-card glass">
    <div class="tech-card-header">
      <div class="tech-avatar">${techInitials(t)}</div>
      <div style="flex:1">
        <div class="tech-name">${techName(t)}</div>
        <div class="tech-email">${esc(t.email || '–')}</div>
      </div>
      <span class="gps-dot ${online ? 'online' : 'offline'}"></span>
    </div>
    <div class="tech-meta">
      <span><i data-feather="phone"></i> ${esc(t.phone || '–')}</span>
      <span><i data-feather="map-pin"></i> ${esc(t.city || '–')}</span>
      <span><i data-feather="activity"></i> ${esc(t.status || '–')}</span>
    </div>
    ${skills.length ? `<div class="tech-skills">${skills.map(s => `<span class="skill-tag">${esc(String(s).trim())}</span>`).join('')}</div>` : ''}
    <div class="tech-actions">
      <button class="btn-sm btn-ghost" onclick="openResetPwModal('${t.user_id}','${esc(techName(t))}')"><i data-feather="lock"></i> Reset PW</button>
    </div>
  </div>`;
}

function renderClients() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  if (!allClients.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No clients found</td></tr>'; return; }
  tbody.innerHTML = allClients.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.email || '–')}</td>
      <td>${esc(c.phone || '–')}</td>
      <td>${esc(c.city || '–')}</td>
      <td><button class="btn-sm btn-ghost" onclick="deleteClient('${c.id}')"><i data-feather="trash-2"></i></button></td>
    </tr>`).join('');
}

function renderApprovals() {
  const grid = document.getElementById('approvals-grid');
  if (!grid) return;
  const pending = allTechs.filter(t => t.status === 'pending_review');
  if (!pending.length) { grid.innerHTML = emptyState('user-check','No pending approvals'); return; }
  grid.innerHTML = pending.map(t => `
    <div class="tech-card glass">
      <div class="tech-card-header">
        <div class="tech-avatar">${techInitials(t)}</div>
        <div style="flex:1"><div class="tech-name">${techName(t)}</div><div class="tech-email">${esc(t.email || '–')}</div></div>
        <span class="status-pill yellow">Pending</span>
      </div>
      <div class="tech-actions" style="margin-top:12px">
        <button class="btn-success" onclick="approveTech('${t.user_id}')"><i data-feather="check"></i> Approve</button>
        <button class="btn-danger"  onclick="rejectTech('${t.user_id}')"><i data-feather="x"></i> Reject</button>
      </div>
    </div>`).join('');
}

function renderInfractions() {
  const grid = document.getElementById('infractions-grid');
  if (!grid) return;
  if (!allInfractions.length) { grid.innerHTML = emptyState('alert-triangle','No infractions recorded'); return; }
  grid.innerHTML = allInfractions.map(inf => {
    const tech = allTechs.find(t => t.user_id === inf.technician_id);
    return `
    <div class="infraction-card glass">
      <div class="infraction-header">
        <span class="infraction-tech">${tech ? techName(tech) : 'Unknown'}</span>
        <span class="severity-pill ${inf.severity || 'low'}">${inf.severity || 'low'}</span>
        ${inf.status === 'resolved' ? '<span class="status-pill green">Resolved</span>' : ''}
      </div>
      <p class="infraction-desc">${esc(inf.description || '–')}</p>
      <div class="infraction-footer">
        <span class="infraction-date">${formatDate(inf.created_at)}</span>
        ${inf.status !== 'resolved' ? `<button class="btn-sm btn-primary" onclick="resolveInfraction('${inf.id}')"><i data-feather="check"></i> Mark Resolved</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderEarnings() {
  const completedJobs = allJobs.filter(j => j.status === 'completed');
  let totalEarnings = 0, totalMinutes = 0;
  completedJobs.forEach(j => {
    totalEarnings += parseFloat(j.job_rate || 0);
    if (j.check_in_time && j.check_out_time)
      totalMinutes += (new Date(j.check_out_time) - new Date(j.check_in_time)) / 60000;
  });
  setEl('earn-total', '$' + totalEarnings.toFixed(2));
  setEl('earn-hours', formatMinutes(totalMinutes));
  setEl('earn-count', completedJobs.length);

  const grid = document.getElementById('earnings-breakdown');
  if (!grid) return;
  if (!allTechs.length) { grid.innerHTML = emptyState('dollar-sign','No data yet'); return; }
  grid.innerHTML = allTechs.map(tech => {
    const techJobs = completedJobs.filter(j => j.technician_id === tech.user_id);
    const earnings = techJobs.reduce((sum, j) => sum + parseFloat(j.job_rate || 0), 0);
    let mins = 0;
    techJobs.forEach(j => {
      if (j.check_in_time && j.check_out_time)
        mins += (new Date(j.check_out_time) - new Date(j.check_in_time)) / 60000;
    });
    return `
    <div class="earn-breakdown-card glass">
      <div class="earn-bd-header">
        <div class="tech-avatar sm">${techInitials(tech)}</div>
        <div class="earn-bd-name">${techName(tech)}</div>
      </div>
      <div class="earn-bd-stats">
        <div class="ebs"><div class="ebs-val">$${earnings.toFixed(2)}</div><div class="ebs-lbl">Earnings</div></div>
        <div class="ebs"><div class="ebs-val">${formatMinutes(mins)}</div><div class="ebs-lbl">Hours</div></div>
        <div class="ebs"><div class="ebs-val">${techJobs.length}</div><div class="ebs-lbl">Jobs</div></div>
      </div>
    </div>`;
  }).join('');
}

function renderUserMgmt() {
  const ag = document.getElementById('admins-grid');
  if (ag) ag.innerHTML = allAdmins.length
    ? allAdmins.map(a => `
      <div class="user-card glass">
        <div class="user-card-inner">
          <div class="tech-avatar">${initials(a.name || a.email)}</div>
          <div style="flex:1"><div class="tech-name">${esc(a.name || '–')}</div><div class="tech-email">${esc(a.email || '–')}</div></div>
          <span class="status-pill pink">Admin</span>
        </div>
        <div class="tech-actions">
          <button class="btn-sm btn-ghost" onclick="openResetPwModal('${a.user_id}','${esc(a.name || a.email)}')"><i data-feather="lock"></i> Reset PW</button>
        </div>
      </div>`).join('')
    : emptyState('shield','No admins found');

  const tg = document.getElementById('usermgmt-techs-grid');
  if (tg) tg.innerHTML = allTechs.length
    ? allTechs.map(t => `
      <div class="user-card glass">
        <div class="user-card-inner">
          <div class="tech-avatar">${techInitials(t)}</div>
          <div style="flex:1"><div class="tech-name">${techName(t)}</div><div class="tech-email">${esc(t.email || '–')}</div></div>
          <span class="status-pill blue">Tech</span>
        </div>
        <div class="tech-actions">
          <button class="btn-sm btn-ghost" onclick="openResetPwModal('${t.user_id}','${esc(techName(t))}')"><i data-feather="lock"></i> Reset PW</button>
        </div>
      </div>`).join('')
    : emptyState('users','No technicians found');
}

/* ══════════════════════════════════════════════════════════════
   NEW WORK ORDER
══════════════════════════════════════════════════════════════ */
function populateNewJobForm() {
  const cs = document.getElementById('nj-client');
  if (cs) cs.innerHTML = '<option value="">Select client…</option>' +
    allClients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const ts = document.getElementById('nj-tech');
  if (ts) ts.innerHTML = '<option value="">Unassigned</option>' +
    allTechs.map(t => `<option value="${t.user_id}">${techName(t)}</option>`).join('');
}

async function createWorkOrder() {
  const title  = val('nj-title');
  const desc   = val('nj-description');
  const client = val('nj-client');
  const tech   = val('nj-tech');
  const prio   = val('nj-priority');
  const rate   = val('nj-rate');
  const date   = val('nj-date');
  const time   = val('nj-time');
  const notes  = val('nj-notes');
  if (!title) { showToast('Job title is required', '
