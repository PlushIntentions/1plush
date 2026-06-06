/* ═══════════════════════════════════════════════════════════
   PLUSH INTENTIONS — Admin Dashboard JS
   Supabase: https://faithkncd.supabase.co
   ═══════════════════════════════════════════════════════════ */

// ── HIDE LOADER IMMEDIATELY ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.style.display = 'none', 450);
  }
  feather.replace();
});

// ── SUPABASE INIT ────────────────────────────────────────
const SUPABASE_URL  = 'https://iazvpykfdckpffhakncd.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_FuojaGp1LlAwV0yxEl8DFA_RbT3FLRe'; // ← paste your anon key here

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── MAPBOX ───────────────────────────────────────────────
const MAPBOX_TOKEN = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

// ── STATE ────────────────────────────────────────────────
let allJobs     = [];
let allTechs    = [];
let allClients  = [];
let allInfract  = [];
let mapInstance = null;
let assignJobId = null;

// ── HELPER: tech display name ────────────────────────────
function techName(t) {
  return t.full_name || t.name || t.email || 'Unknown';
}

// ── TOAST ────────────────────────────────────────────────
function toast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ── PANEL NAV ────────────────────────────────────────────
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const panel = document.getElementById(`panel-${name}`);
  const nav   = document.getElementById(`nav-${name}`);
  if (panel) panel.classList.add('active');
  if (nav)   nav.classList.add('active');

  const titles = {
    map:'Live Map', jobs:'All Jobs', pending:'Pending Jobs',
    techs:'Technicians', clients:'Clients', completed:'Completed',
    approvals:'Pending Approvals', workorders:'Work Orders',
    infractions:'Infractions', earnings:'Earnings & Hours',
    usermgmt:'User Management', newjob:'New Work Order'
  };
  const tt = document.getElementById('topbar-title');
  if (tt) tt.textContent = titles[name] || name;

  closeSidebar();

  if (name === 'map' && !mapInstance) initMap();
}

// ── SIDEBAR ──────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
}

// ── MAP ──────────────────────────────────────────────────
function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  mapInstance = new mapboxgl.Map({
    container: 'map-container',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-82.0, 41.3],
    zoom: 9
  });
  mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
  addTechMarkers();
}

function addTechMarkers() {
  if (!mapInstance) return;
  allTechs.forEach(t => {
    const lat = parseFloat(t.lat || t.latitude || 0);
    const lng = parseFloat(t.lng || t.longitude || 0);
    if (!lat || !lng) return;
    const el = document.createElement('div');
    el.style.cssText = `
      width:32px;height:32px;border-radius:50%;
      background:#FF4F9F;border:2px solid #fff;
      box-shadow:0 0 12px rgba(255,79,159,.7);
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;color:#fff;
    `;
    el.textContent = techName(t).charAt(0).toUpperCase();
    new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(techName(t)))
      .addTo(mapInstance);
  });
}

// ── LOAD ALL DATA ────────────────────────────────────────
async function loadAllData() {
  try {
    const [techRes, jobRes, clientRes, infractRes] = await Promise.all([
      sb.from('technicians').select('*').order('created_at', { ascending: false }),
      sb.from('jobs').select('*').order('created_at', { ascending: false }),
      sb.from('clients').select('*').order('name'),
      sb.from('infractions').select('*').order('created_at', { ascending: false })
    ]);

    if (techRes.error)    console.error('Techs error:', techRes.error.message);
    if (jobRes.error)     console.error('Jobs error:', jobRes.error.message);
    if (clientRes.error)  console.error('Clients error:', clientRes.error.message);
    if (infractRes.error) console.error('Infractions error:', infractRes.error.message);

    allTechs   = techRes.data    || [];
    allJobs    = jobRes.data     || [];
    allClients = clientRes.data  || [];
    allInfract = infractRes.data || [];

    renderAll();
  } catch (err) {
    console.error('loadAllData failed:', err);
    toast('Failed to load data. Check console.');
  }
}

function renderAll() {
  updateStats();
  renderJobs();
  renderPending();
  renderCompleted();
  renderTechs();
  renderClients();
  renderApprovals();
  renderWorkOrders();
  renderInfractions();
  renderEarnings();
  renderUserMgmt();
  populateSelects();
  if (mapInstance) addTechMarkers();
  feather.replace();
}

// ── STATS ────────────────────────────────────────────────
function updateStats() {
  const pending   = allJobs.filter(j => j.status === 'pending').length;
  const active    = allJobs.filter(j => ['active','in_progress','assigned'].includes(j.status)).length;
  const approvals = allTechs.filter(t => t.status === 'pending_approval').length;
  const infracts  = allInfract.filter(i => i.status === 'open' || !i.resolved).length;

  setText('stat-jobs',    allJobs.length);
  setText('stat-active',  active);
  setText('stat-pending', pending);
  setText('stat-techs',   allTechs.filter(t => t.status === 'active' || t.is_active).length);

  setText('m-stat-jobs',    allJobs.length);
  setText('m-stat-active',  active);
  setText('m-stat-pending', pending);
  setText('m-stat-techs',   allTechs.filter(t => t.status === 'active' || t.is_active).length);

  setBadge('badge-pending',     pending);
  setBadge('badge-approvals',   approvals);
  setBadge('badge-infractions', infracts);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setBadge(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val;
  el.classList.toggle('show', val > 0);
}

// ── CLIENT NAME HELPER ───────────────────────────────────
function clientName(clientId) {
  const c = allClients.find(c => c.id === clientId);
  return c ? c.name : '—';
}

// ── TECH NAME FROM ID ────────────────────────────────────
function techNameById(techId) {
  const t = allTechs.find(t => t.id === techId);
  return t ? techName(t) : '—';
}

// ── STATUS / PRIORITY BADGE HTML ─────────────────────────
function statusBadge(s) {
  return `<span class="badge badge-${(s||'pending').replace(/ /g,'_')}">${s||'pending'}</span>`;
}
function priorityBadge(p) {
  return `<span class="badge badge-${p||'normal'}">${p||'normal'}</span>`;
}

// ── FORMAT DATE ──────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ── ESCAPE HTML ──────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── JOB CARD ─────────────────────────────────────────────
function jobCard(j) {
  return `
  <div class="card">
    <div class="card-top">
      <div>
        <div class="card-title">${esc(j.title || 'Untitled Job')}</div>
        <div class="card-sub">${clientName(j.client_id)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
        ${statusBadge(j.status)}
        ${priorityBadge(j.priority)}
      </div>
    </div>
    <div class="card-body">
      <span><i data-feather="user"></i> ${techNameById(j.technician_id)}</span>
      <span><i data-feather="calendar"></i> ${fmtDate(j.scheduled_date)}</span>
      <span><i data-feather="dollar-sign"></i> $${(j.job_rate||0).toFixed(2)}</span>
      ${j.description ? `<span style="opacity:.7;margin-top:4px">${esc(j.description).substring(0,80)}${j.description.length>80?'…':''}</span>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn-sm btn-outline" onclick="openAssignModal('${j.id}','${esc(j.title||'')}')">Assign</button>
      <button class="btn-sm btn-success" onclick="updateJobStatus('${j.id}','completed')">Complete</button>
      <button class="btn-sm btn-danger"  onclick="updateJobStatus('${j.id}','cancelled')">Cancel</button>
    </div>
  </div>`;
}

// ── RENDER: ALL JOBS ─────────────────────────────────────
function renderJobs() {
  const grid = document.getElementById('jobs-grid');
  if (!grid) return;
  if (!allJobs.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="briefcase"></i><p>No jobs found</p></div>`;
    return;
  }
  grid.innerHTML = allJobs.map(j => jobCard(j)).join('');
}

// ── RENDER: PENDING ──────────────────────────────────────
function renderPending() {
  const grid = document.getElementById('pending-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j => j.status === 'pending');
  if (!jobs.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="clock"></i><p>No pending jobs</p></div>`;
    return;
  }
  grid.innerHTML = jobs.map(j => jobCard(j)).join('');
}

// ── RENDER: COMPLETED ────────────────────────────────────
function renderCompleted() {
  const grid = document.getElementById('completed-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j => j.status === 'completed');
  if (!jobs.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="check-circle"></i><p>No completed jobs</p></div>`;
    return;
  }
  grid.innerHTML = jobs.map(j => jobCard(j)).join('');
}

// ── RENDER: TECHNICIANS ──────────────────────────────────
function renderTechs() {
  const grid = document.getElementById('techs-grid');
  if (!grid) return;
  if (!allTechs.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="users"></i><p>No technicians found</p></div>`;
    return;
  }
  grid.innerHTML = allTechs.map(t => `
  <div class="card">
    <div class="card-top">
      <div>
        <div class="card-title">${esc(techName(t))}</div>
        <div class="card-sub">${esc(t.city || '—')}</div>
      </div>
      ${statusBadge(t.status)}
    </div>
    <div class="card-body">
      <span><i data-feather="mail"></i> ${esc(t.email||'—')}</span>
      <span><i data-feather="phone"></i> ${esc(t.phone||'—')}</span>
      ${t.skills ? `<span><i data-feather="tool"></i> ${esc(t.skills)}</span>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn-sm btn-success" onclick="setTechStatus('${t.id}','active')">Activate</button>
      <button class="btn-sm btn-danger"  onclick="setTechStatus('${t.id}','inactive')">Deactivate</button>
      <button class="btn-sm btn-outline" onclick="openResetPw('${t.id}','${esc(techName(t))}')">Reset PW</button>
    </div>
  </div>`).join('');
}

// ── RENDER: CLIENTS ──────────────────────────────────────
function renderClients() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  if (!allClients.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No clients found</td></tr>`;
    return;
  }
  tbody.innerHTML = allClients.map(c => `
  <tr>
    <td><strong>${esc(c.name||'—')}</strong></td>
    <td>${esc(c.email||'—')}</td>
    <td>${esc(c.phone||'—')}</td>
    <td>${esc(c.city||'—')}</td>
    <td><button class="btn-sm btn-danger" onclick="deleteClient('${c.id}')">Delete</button></td>
  </tr>`).join('');
}

// ── RENDER: APPROVALS ────────────────────────────────────
function renderApprovals() {
  const grid = document.getElementById('approvals-grid');
  if (!grid) return;
  const pending = allTechs.filter(t => t.status === 'pending_approval');
  if (!pending.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="user-check"></i><p>No pending approvals</p></div>`;
    return;
  }
  grid.innerHTML = pending.map(t => `
  <div class="card">
    <div class="card-top">
      <div>
        <div class="card-title">${esc(techName(t))}</div>
        <div class="card-sub">${esc(t.email||'—')} · ${esc(t.city||'—')}</div>
      </div>
      ${statusBadge(t.status)}
    </div>
    <div class="card-body">
      <span><i data-feather="phone"></i> ${esc(t.phone||'—')}</span>
      <span><i data-feather="calendar"></i> Joined ${fmtDate(t.created_at)}</span>
    </div>
    <div class="card-actions">
      <button class="btn-sm btn-success" onclick="approveTech('${t.id}')">Approve</button>
      <button class="btn-sm btn-danger"  onclick="rejectTech('${t.id}')">Reject</button>
    </div>
  </div>`).join('');
}

// ── RENDER: WORK ORDERS ──────────────────────────────────
let currentWOFilter = 'all';
function renderWorkOrders(filter) {
  if (filter) currentWOFilter = filter;
  const grid = document.getElementById('workorders-grid');
  if (!grid) return;
  let jobs = allJobs;
  if (currentWOFilter !== 'all') jobs = allJobs.filter(j => j.status === currentWOFilter);
  if (!jobs.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="file-text"></i><p>No work orders</p></div>`;
    return;
  }
  grid.innerHTML = jobs.map(j => jobCard(j)).join('');
}
function filterWorkOrders(f, btn) {
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderWorkOrders(f);
  feather.replace();
}

// ── RENDER: INFRACTIONS ──────────────────────────────────
function renderInfractions() {
  const grid = document.getElementById('infractions-grid');
  if (!grid) return;
  if (!allInfract.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="alert-triangle"></i><p>No infractions recorded</p></div>`;
    return;
  }
  grid.innerHTML = allInfract.map(inf => `
  <div class="card">
    <div class="card-top">
      <div>
        <div class="card-title">${esc(techNameById(inf.technician_id))}</div>
        <div class="card-sub">${fmtDate(inf.created_at)}</div>
      </div>
      <span class="badge badge-${inf.severity||'low'}">${inf.severity||'low'}</span>
    </div>
    <div class="card-body">
      <span>${esc(inf.description || inf.reason || 'No description')}</span>
      <span><i data-feather="info"></i> Status: ${inf.status||'open'}</span>
    </div>
    <div class="card-actions">
      ${!inf.resolved ? `<button class="btn-sm btn-success" onclick="resolveInfraction('${inf.id}')">Resolve</button>` : ''}
      <button class="btn-sm btn-danger" onclick="deleteInfraction('${inf.id}')">Delete</button>
    </div>
  </div>`).join('');
}

// ── RENDER: EARNINGS ─────────────────────────────────────
function renderEarnings() {
  const completed = allJobs.filter(j => j.status === 'completed');
  let total = 0, totalMs = 0;
  completed.forEach(j => {
    total += parseFloat(j.job_rate || 0);
    if (j.check_in_time && j.check_out_time)
      totalMs += new Date(j.check_out_time) - new Date(j.check_in_time);
  });
  const hours = Math.floor(totalMs / 3600000);
  const mins  = Math.floor((totalMs % 3600000) / 60000);
  setText('earn-total', `$${total.toFixed(2)}`);
  setText('earn-hours', `${hours}h ${mins}m`);
  setText('earn-count', completed.length);

  const grid = document.getElementById('earnings-breakdown');
  if (!grid) return;
  const byTech = {};
  completed.forEach(j => {
    const tid = j.technician_id || 'unassigned';
    if (!byTech[tid]) byTech[tid] = { earnings: 0, count: 0, ms: 0 };
    byTech[tid].earnings += parseFloat(j.job_rate || 0);
    byTech[tid].count++;
    if (j.check_in_time && j.check_out_time)
      byTech[tid].ms += new Date(j.check_out_time) - new Date(j.check_in_time);
  });
  if (!Object.keys(byTech).length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="dollar-sign"></i><p>No data yet</p></div>`;
    return;
  }
  grid.innerHTML = Object.entries(byTech).map(([tid, data]) => {
    const name = tid === 'unassigned' ? 'Unassigned' : techNameById(tid);
    const h = Math.floor(data.ms / 3600000);
    const m = Math.floor((data.ms % 3600000) / 60000);
    return `
    <div class="card">
      <div class="card-top">
        <div class="card-title">${esc(name)}</div>
        <span style="color:var(--pink);font-weight:800;font-size:18px">$${data.earnings.toFixed(2)}</span>
      </div>
      <div class="card-body">
        <span><i data-feather="check-circle"></i> ${data.count} jobs completed</span>
        <span><i data-feather="clock"></i> ${h}h ${m}m worked</span>
      </div>
    </div>`;
  }).join('');
}

// ── RENDER: USER MANAGEMENT ──────────────────────────────
function renderUserMgmt() {
  const adminsGrid = document.getElementById('admins-grid');
  const techsGrid  = document.getElementById('usermgmt-techs-grid');
  const admins = allTechs.filter(t => t.role === 'admin');
  const techs  = allTechs.filter(t => t.role !== 'admin');

  if (adminsGrid) {
    adminsGrid.innerHTML = admins.length
      ? admins.map(a => `
        <div class="card">
          <div class="card-top">
            <div>
              <div class="card-title">${esc(techName(a))}</div>
              <div class="card-sub">${esc(a.email||'—')}</div>
            </div>
            <span class="badge badge-active">Admin</span>
          </div>
          <div class="card-actions">
            <button class="btn-sm btn-outline" onclick="openResetPw('${a.id}','${esc(techName(a))}')">Reset PW</button>
          </div>
        </div>`).join('')
      : `<div class="empty-state"><i data-feather="shield"></i><p>No admins found</p></div>`;
  }

  if (techsGrid) {
    techsGrid.innerHTML = techs.length
      ? techs.map(t => `
        <div class="card">
          <div class="card-top">
            <div>
              <div class="card-title">${esc(techName(t))}</div>
              <div class="card-sub">${esc(t.email||'—')}</div>
            </div>
            ${statusBadge(t.status)}
          </div>
          <div class="card-actions">
            <button class="btn-sm btn-outline" onclick="openResetPw('${t.id}','${esc(techName(t))}')">Reset PW</button>
            <button class="btn-sm btn-danger"  onclick="deleteTech('${t.id}')">Delete</button>
          </div>
        </div>`).join('')
      : `<div class="empty-state"><i data-feather="users"></i><p>No technicians found</p></div>`;
  }
}

// ── POPULATE SELECTS ─────────────────────────────────────
function populateSelects() {
  const njClient = document.getElementById('nj-client');
  if (njClient) {
    const cur = njClient.value;
    njClient.innerHTML = `<option value="">Select client…</option>` +
      allClients.map(c => `<option value="${c.id}" ${c.id===cur?'selected':''}>${esc(c.name)}</option>`).join
