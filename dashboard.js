/* ═══════════════════════════════════════════════════════════════
   dashboard.js — Plush Intentions Admin Dashboard
   Boots instantly · loader hides in ≤2s · all errors caught
═══════════════════════════════════════════════════════════════ */

// ── CONFIG ─────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://iazvpykfdckpffhakncd.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_FuojaGp1LlAwV0yxEl8DFA_RbT3FLRe';
const MAPBOX_TOKEN  = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── STATE ───────────────────────────────────────────────────────
let allJobs        = [];
let allTechs       = [];
let allClients     = [];
let allInfractions = [];
let allApprovals   = [];
let map            = null;
let mapMarkers     = [];
let currentJob     = null;
let activePanel    = 'map';

// ── BOOT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const safetyTimer = setTimeout(hideLo, 2000);
  init().finally(() => {
    clearTimeout(safetyTimer);
    hideLo();
  });
});

function hideLo() {
  const lo = document.getElementById('loader');
  if (lo) {
    lo.style.opacity = '0';
    lo.style.pointerEvents = 'none';
    setTimeout(() => lo.remove(), 400);
  }
}

// ── INIT ────────────────────────────────────────────────────────
async function init() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    const userEl = document.getElementById('admin-email');
    if (userEl && session.user) userEl.textContent = session.user.email || 'Admin';
  } catch (e) { console.warn('Session check failed:', e); }

  await loadAll();
  setTimeout(initMap, 100);
  try { feather.replace(); } catch(e) {}
  showPanel('map');
}

// ── LOAD ALL DATA ───────────────────────────────────────────────
async function loadAll() {
  await Promise.allSettled([
    loadJobs(),
    loadTechs(),
    loadClients(),
    loadInfractions(),
  ]);
  updateStats();
}

async function loadJobs() {
  try {
    const { data, error } = await sb.from('jobs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    allJobs = data || [];
  } catch (e) { console.warn('jobs load failed:', e); allJobs = []; }
}

async function loadTechs() {
  try {
    const { data, error } = await sb.from('technicians').select('*').order('name');
    if (error) throw error;
    allTechs = data || [];
    allApprovals = allTechs.filter(t => t.status === 'pending_review');
  } catch (e) { console.warn('technicians load failed:', e); allTechs = []; allApprovals = []; }
}

async function loadClients() {
  try {
    const { data, error } = await sb.from('clients').select('*').order('name');
    if (error) throw error;
    allClients = data || [];
  } catch (e) { console.warn('clients load failed:', e); allClients = []; }
}

async function loadInfractions() {
  try {
    const { data, error } = await sb.from('infractions').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    allInfractions = data || [];
  } catch (e) { console.warn('infractions load failed:', e); allInfractions = []; }
}

// ── STATS ───────────────────────────────────────────────────────
function updateStats() {
  setText('stat-jobs',    allJobs.length);
  setText('stat-active',  allJobs.filter(j => j.status === 'active').length);
  setText('stat-pending', allJobs.filter(j => j.status === 'pending').length);
  setText('stat-techs',   allTechs.filter(t => t.status === 'active').length);
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

// ── PANEL ROUTING ───────────────────────────────────────────────
function showPanel(name) {
  activePanel = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  switch (name) {
    case 'map':        renderMap();         break;
    case 'jobs':       renderJobs();        break;
    case 'pending':    renderPending();     break;
    case 'completed':  renderCompleted();   break;
    case 'techs':      renderTechs();       break;
    case 'clients':    renderClients();     break;
    case 'approvals':  renderApprovals();   break;
    case 'workorders': renderWorkOrders();  break;
    case 'infractions':renderInfractions(); break;
    case 'earnings':   renderEarnings();    break;
    case 'usermgmt':   renderUserMgmt();    break;
  }

  try { feather.replace(); } catch(e) {}
  const sb2 = document.querySelector('.sidebar');
  if (sb2) sb2.classList.remove('open');
}

// ── MAP ─────────────────────────────────────────────────────────
function initMap() {
  const container = document.getElementById('map-container');
  if (!container || map) return;
  try {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: 'map-container',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-82.1824, 41.4523],
      zoom: 10
    });
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    map.on('load', plotMapMarkers);
  } catch (e) { console.warn('Map init failed:', e); }
}

function renderMap() {
  if (!map) { setTimeout(initMap, 300); return; }
  setTimeout(() => { try { map.resize(); } catch(e){} plotMapMarkers(); }, 200);
}

function plotMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => { try { m.remove(); } catch(e){} });
  mapMarkers = [];

  allTechs.filter(t => t.lat && t.lng && t.status === 'active').forEach(t => {
    try {
      const el = document.createElement('div');
      el.style.cssText = 'width:16px;height:16px;background:#3b82f6;border:2px solid #fff;border-radius:50%;cursor:pointer;';
      const m = new mapboxgl.Marker(el).setLngLat([t.lng, t.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<b>${esc(t.name)}</b><br>Technician`))
        .addTo(map);
      mapMarkers.push(m);
    } catch(e) {}
  });

  allClients.filter(c => c.lat && c.lng).forEach(c => {
    try {
      const el = document.createElement('div');
      el.style.cssText = 'width:12px;height:12px;background:#FF4F9F;border:2px solid #fff;border-radius:50%;cursor:pointer;';
      const m = new mapboxgl.Marker(el).setLngLat([c.lng, c.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<b>${esc(c.name)}</b><br>Client`))
        .addTo(map);
      mapMarkers.push(m);
    } catch(e) {}
  });
}

// ── JOBS ────────────────────────────────────────────────────────
function renderJobs() {
  const el = document.getElementById('jobs-list');
  if (!el) return;
  if (!allJobs.length) { el.innerHTML = emptyState('No jobs found'); return; }
  el.innerHTML = allJobs.map(j => jobCard(j)).join('');
}

function renderPending() {
  const el = document.getElementById('pending-list');
  if (!el) return;
  const pending = allJobs.filter(j => j.status === 'pending');
  if (!pending.length) { el.innerHTML = emptyState('No pending jobs'); return; }
  el.innerHTML = pending.map(j => jobCard(j, true)).join('');
}

function renderCompleted() {
  const el = document.getElementById('completed-list');
  if (!el) return;
  const done = allJobs.filter(j => j.status === 'completed');
  if (!done.length) { el.innerHTML = emptyState('No completed jobs'); return; }
  el.innerHTML = done.map(j => jobCard(j)).join('');
}

function jobCard(j, showAssign = false) {
  const tech   = allTechs.find(t => t.user_id === j.technician_id);
  const client = allClients.find(c => c.id === j.client_id);
  const sColor = { pending:'#f59e0b', active:'#10b981', completed:'#6366f1', cancelled:'#ef4444' }[j.status] || '#888';
  const pColor = { high:'#ef4444', medium:'#f59e0b', low:'#10b981' }[j.priority] || '#888';
  return `
    <div class="job-card glass">
      <div class="job-card-header">
        <div>
          <div class="job-title">${esc(j.title || 'Untitled Job')}</div>
          <div class="job-meta">${esc(client?.name || 'No client')} · ${fmtDate(j.scheduled_date)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${j.priority ? `<span class="pill" style="background:${pColor}20;color:${pColor};border-color:${pColor}40">${j.priority}</span>` : ''}
          <span class="pill" style="background:${sColor}20;color:${sColor};border-color:${sColor}40">${j.status}</span>
        </div>
      </div>
      ${j.description ? `<div class="job-desc">${esc(j.description)}</div>` : ''}
      <div class="job-footer">
        <span class="job-tech">${tech
          ? `<i data-feather="user" style="width:13px;height:13px"></i> ${esc(tech.name)}`
          : '<span style="opacity:.5">Unassigned</span>'}</span>
        ${j.job_rate ? `<span style="color:#10b981;font-size:12px;font-weight:600">$${parseFloat(j.job_rate).toFixed(2)}</span>` : ''}
        ${showAssign ? `<button class="btn-sm" onclick="openAssignModal('${j.id}','${esc(j.title)}')">Assign</button>` : ''}
      </div>
    </div>`;
}

// ── TECHNICIANS ─────────────────────────────────────────────────
function renderTechs() {
  const el = document.getElementById('techs-list');
  if (!el) return;
  const list = allTechs.filter(t => t.status !== 'pending_review');
  if (!list.length) { el.innerHTML = emptyState('No technicians found'); return; }
  el.innerHTML = list.map(t => techCard(t)).join('');
}

function techCard(t) {
  const sColor = { active:'#10b981', inactive:'#6b7280', suspended:'#ef4444', rejected:'#ef4444' }[t.status] || '#888';
  const hasGps = t.lat && t.lng;
  const skills = Array.isArray(t.skills) ? t.skills : (t.skills ? [t.skills] : []);
  return `
    <div class="tech-card glass">
      <div class="tech-card-header">
        <div class="tech-avatar">${(t.name||'?')[0].toUpperCase()}</div>
        <div>
          <div class="tech-name">${esc(t.name||'—')}</div>
          <div class="tech-email">${esc(t.email||'—')}</div>
          ${t.city ? `<div style="font-size:11px;opacity:.5">${esc(t.city)}</div>` : ''}
        </div>
        <span class="pill" style="margin-left:auto;background:${sColor}20;color:${sColor};border-color:${sColor}40">${t.status||'unknown'}</span>
      </div>
      ${skills.length ? `<div class="tech-skills">${skills.map(s=>`<span class="skill-tag">${esc(s)}</span>`).join('')}</div>` : ''}
      <div class="tech-footer">
        <span style="font-size:11px;opacity:.5">${hasGps ? '🟢 GPS Active' : 'No GPS'}</span>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="openResetPw('${t.user_id}','${esc(t.name||'')}')">Reset PW</button>
          ${t.status !== 'active' ? `<button class="btn-sm btn-green" onclick="approveTech('${t.user_id}')">Approve</button>` : ''}
        </div>
      </div>
    </div>`;
}

// ── CLIENTS ─────────────────────────────────────────────────────
function renderClients() {
  const el = document.getElementById('clients-list');
  if (!el) return;
  if (!allClients.length) { el.innerHTML = emptyState('No clients found'); return; }
  el.innerHTML = `
    <div class="table-wrap glass">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th></tr></thead>
        <tbody>${allClients.map(c=>`
          <tr>
            <td>${esc(c.name||'—')}</td>
            <td>${esc(c.email||'—')}</td>
            <td>${esc(c.phone||'—')}</td>
            <td>${esc(c.city||'—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── APPROVALS ───────────────────────────────────────────────────
function renderApprovals() {
  const el = document.getElementById('approvals-list');
  if (!el) return;
  if (!allApprovals.length) { el.innerHTML = emptyState('No pending approvals'); return; }
  el.innerHTML = allApprovals.map(t => `
    <div class="tech-card glass">
      <div class="tech-card-header">
        <div class="tech-avatar">${(t.name||'?')[0].toUpperCase()}</div>
        <div>
          <div class="tech-name">${esc(t.name||'—')}</div>
          <div class="tech-email">${esc(t.email||'—')}</div>
          ${t.phone ? `<div style="font-size:11px;opacity:.5">${esc(t.phone)}</div>` : ''}
        </div>
        <span class="pill" style="margin-left:auto;background:#f59e0b20;color:#f59e0b;border-color:#f59e0b40">pending</span>
      </div>
      <div class="tech-footer">
        <span style="font-size:11px;opacity:.4">Applied ${fmtDate(t.created_at)}</span>
        <div style="display:flex;gap:6px">
          <button class="btn-sm btn-red" onclick="rejectTech('${t.user_id}')">Reject</button>
          <button class="btn-sm btn-green" onclick="approveTech('${t.user_id}')">Approve</button>
        </div>
      </div>
    </div>`).join('');
}

// ── WORK ORDERS ─────────────────────────────────────────────────
let woFilter = 'all';

function renderWorkOrders() {
  const el = document.getElementById('workorders-list');
  if (!el) return;
  const filtered = woFilter === 'all' ? allJobs : allJobs.filter(j => j.status === woFilter);
  if (!filtered.length) { el.innerHTML = emptyState('No work orders found'); return; }
  el.innerHTML = filtered.map(j => jobCard(j, j.status === 'pending')).join('');
}

function setWoFilter(f) {
  woFilter = f;
  document.querySelectorAll('.wo-filter-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('wo-filter-' + f);
  if (btn) btn.classList.add('active');
  renderWorkOrders();
}

// ── INFRACTIONS ─────────────────────────────────────────────────
function renderInfractions() {
  const el = document.getElementById('infractions-list');
  if (!el) return;
  if (!allInfractions.length) { el.innerHTML = emptyState('No infraction reports found'); return; }
  el.innerHTML = allInfractions.map(inf => {
    const tech = allTechs.find(t => t.user_id === inf.technician_id);
    const sColor = { high:'#ef4444', medium:'#f59e0b', low:'#10b981' }[inf.severity] || '#888';
    const resolved = inf.status === 'resolved';
    return `
      <div class="glass" style="padding:16px 20px;border-radius:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
          <div>
            <div style="font-weight:600;margin-bottom:4px">${esc(tech?.name||'Unknown Tech')}</div>
            <div style="font-size:13px;opacity:.6;margin-bottom:8px">${esc(inf.description||'')}</div>
            <div style="font-size:11px;opacity:.4">${fmtDate(inf.created_at)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <span class="pill" style="background:${sColor}20;color:${sColor};border-color:${sColor}40">${inf.severity||'—'}</span>
            <span class="pill" style="${resolved
              ? 'background:#10b98120;color:#10b981;border-color:#10b98140'
              : 'background:#ef444420;color:#ef4444;border-color:#ef444440'}">${inf.status||'open'}</span>
          </div>
        </div>
        ${!resolved ? `<button class="btn-sm btn-green" style="margin-top:10px" onclick="resolveInfraction('${inf.id}')">Mark Resolved</button>` : ''}
      </div>`;
  }).join('');
}

async function resolveInfraction(id) {
  try {
    const { error } = await sb.from('infractions').update({ status: 'resolved' }).eq('id', id);
    if (error) throw error;
    toast('Infraction marked resolved');
    await loadInfractions();
    renderInfractions();
  } catch(e) { toast('Error: ' + e.message, true); }
}

// ── EARNINGS & HOURS ────────────────────────────────────────────
function renderEarnings() {
  const el = document.getElementById('earnings-content');
  if (!el) return;

  const completed     = allJobs.filter(j => j.status === 'completed');
  const totalEarnings = completed.reduce((s, j) => s + (parseFloat(j.job_rate)||0), 0);
  const totalHours    = completed.reduce((s, j) => {
    if (j.check_in_time && j.check_out_time)
      return s + (new Date(j.check_out_time) - new Date(j.check_in_time)) / 3600000;
    return s;
  }, 0);

  const techMap = {};
  completed.forEach(j => {
    const tid = j.technician_id;
    if (!tid) return;
    if (!techMap[tid]) techMap[tid] = { jobs:0, earnings:0, hours:0 };
    techMap[tid].jobs++;
    techMap[tid].earnings += parseFloat(j.job_rate)||0;
    if (j.check_in_time && j.check_out_time)
      techMap[tid].hours += (new Date(j.check_out_time) - new Date(j.check_in_time)) / 3600000;
  });

  el.innerHTML = `
    <div class="earnings-summary">
      <div class="earn-card glass">
        <div class="earn-val">$${totalEarnings.toFixed(2)}</div>
        <div class="earn-lbl">Total Earnings</div>
      </div>
      <div class="earn-card glass">
        <div class="earn-val">${totalHours.toFixed(1)}h</div>
        <div class="earn-lbl">Total Hours</div>
      </div>
      <div class="earn-card glass">
        <div class="earn-val">${completed.length}</div>
        <div class="earn-lbl">Completed Jobs</div>
      </div>
    </div>
    <div style="margin-top:24px">
      <div style="font-size:13px;font-weight:600;opacity:.6;margin-bottom:14px;text-transform:uppercase;letter-spacing:.06em">Per Technician</div>
      ${!Object.keys(techMap).length ? emptyState('No completed jobs with earnings yet') :
        Object.entries(techMap).map(([tid, d]) => {
          const tech = allTechs.find(t => t.user_id === tid);
          return `
            <div class="glass" style="padding:16px 20px;border-radius:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:12px">
                <div class="tech-avatar" style="width:36px;height:36px;font-size:14px">${(tech?.name||'?')[0].toUpperCase()}</div>
                <div>
                  <div style="font-weight:600">${esc(tech?.name||'Unknown')}</div>
                  <div style="font-size:12px;opacity:.5">${d.jobs} job${d.jobs!==1?'s':''}</div>
                </div>
              </div>
              <div style="display:flex;gap:16px;flex-wrap:wrap">
                <div style="text-align:right">
                  <div style="font-size:18px;font-weight:700;color:#10b981">$${d.earnings.toFixed(2)}</div>
                  <div style="font-size:11px;opacity:.4">Earnings</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:18px;font-weight:700;color:#6366f1">${d.hours.toFixed(1)}h</div>
                  <div style="font-size:11px;opacity:.4">Hours</div>
                </div>
              </div>
            </div>`;
        }).join('')}
    </div>`;
}

// ── USER MANAGEMENT ─────────────────────────────────────────────
function renderUserMgmt() {
  const el = document.getElementById('usermgmt-content');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">
      <button class="btn-primary" onclick="openCreateUser()">
        <i data-feather="user-plus"></i> Create New User
      </button>
    </div>
    <div style="margin-bottom:16px;font-size:13px;font-weight:600;opacity:.6;text-transform:uppercase;letter-spacing:.06em">All Technicians</div>
    ${allTechs.length ? allTechs.map(t => `
      <div class="glass" style="padding:14px 18px;border-radius:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600">${esc(t.name||'—')}</div>
          <div style="font-size:12px;opacity:.5">${esc(t.email||'—')} · Technician</div>
        </div>
        <button class="btn-sm" onclick="openResetPw('${t.user_id}','${esc(t.name||'')}')">Reset Password</button>
      </div>`).join('') : emptyState('No technicians yet')}`;
  try { feather.replace(); } catch(e) {}
}

// ── ASSIGN MODAL ─────────────────────────────────────────────────
function openAssignModal(jobId, jobTitle) {
  currentJob = jobId;
  const title = document.getElementById('modal-job-title');
  const sel   = document.getElementById('modal-tech-select');
  if (title) title.textContent = jobTitle || 'Select a technician for this job.';
  if (sel) {
    sel.innerHTML = '<option value="">Choose technician…</option>' +
      allTechs.filter(t => t.status === 'active')
        .map(t => `<option value="${t.user_id}">${esc(t.name)}</option>`).join('');
  }
  document.getElementById('assign-modal').style.display = 'flex';
}

function closeModal() {
  ['assign-modal','create-user-modal','reset-pw-modal','new-wo-modal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
  });
}

async function confirmAssign() {
  const techId = document.getElementById('modal-tech-select')?.value;
  if (!techId) { toast('Please select a technician', true); return; }
  try {
    const { error } = await sb.from('jobs').update({ technician_id: techId, status: 'active' }).eq('id', currentJob);
    if (error) throw error;
    toast('Technician assigned!');
    closeModal();
    await loadJobs();
    showPanel(activePanel);
    updateStats();
  } catch(e) { toast('Error: ' + e.message, true); }
}

// ── CREATE USER MODAL ────────────────────────────────────────────
function openCreateUser() {
  ['cu-name','cu-email','cu-password','cu-phone','cu-city'].forEach(clearField);
  const modal = document.getElementById('create-user-modal');
  if (modal) modal.style.display = 'flex';
}

function toggleTechFields() {
  const role   = document.getElementById('cu-role')?.value;
  const fields = document.getElementById('cu-tech-fields');
  if (fields) fields.style.display = role === 'admin' ? 'none' : 'block';
}

async function createUser() {
  const name     = val('cu-name').trim();
  const email    = val('cu-email').trim();
  const password = val('cu-password').trim();
  const role     = val('cu-role');
  const phone    = val('cu-phone').trim();
  const city     = val('cu-city').trim();

  if (!name || !email || !password) { toast('Name, email, and password are required', true); return; }
  if (password.length < 6)          { toast('Password must be at least 6 characters', true); return; }

  setDisabled('cu-submit', true, 'Creating…');
  try {
    // Try admin API first; fall back to signUp
    let uid = null;
    const { data: ad, error: ae } = await sb.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name, role }
    });
    if (ae) {
      const { data: sd, error: se } = await sb.auth.signUp({
        email, password, options: { data: { name, role } }
      });
      if (se) throw se;
      uid = sd?.user?.id;
    } else {
      uid = ad?.user?.id;
    }
    if (uid) await insertProfile(uid, name, email, phone, city, role);
    toast(`${role === 'admin' ? 'Admin' : 'Technician'} account created!`);
    closeModal();
    await loadTechs();
    renderUserMgmt();
  } catch(e) {
    toast('Error: ' + e.message, true);
  } finally {
    setDisabled('cu-submit', false, 'Create Account');
  }
}

async function insertProfile(uid, name, email, phone, city, role) {
  if (role === 'admin') {
    await sb.from('admins').insert({ user_id: uid, name, email }).catch(()=>{});
  } else {
    await sb.from('technicians').insert({
      user_id: uid, name, email,
      phone:  phone || null,
      city:   city  || null,
      status: 'active',
      skills: []
    }).catch(()=>{});
  }
}

// ── RESET PASSWORD MODAL ─────────────────────────────────────────
let resetUserId = null;

function openResetPw(userId, userName) {
  resetUserId = userId;
  const label = document.getElementById('reset-pw-label');
  if (label) label.textContent = `New password for ${userName || 'user'}`;
  clearField('reset-pw-input');
  const modal = document.getElementById('reset-pw-modal');
  if (modal) modal.style.display = 'flex';
}

async function confirmResetPw() {
  const newPw = val('reset-pw-input').trim();
  if (!newPw || newPw.length < 6) { toast('Password must be at least 6 characters', true); return; }
  if (!resetUserId)                { toast('No user selected', true); return; }
  try {
    const { error } = await sb.auth.admin.updateUserById(resetUserId, { password: newPw });
    if (error) throw error;
    toast('Password updated!');
    closeModal();
  } catch(e) { toast('Error: ' + e.message, true); }
}

// ── APPROVE / REJECT ─────────────────────────────────────────────
async function approveTech(userId) {
  try {
    const { error } = await sb.from('technicians').update({ status: 'active' }).eq('user_id', userId);
    if (error) throw error;
    toast('Technician approved!');
    await loadTechs();
    renderApprovals();
    renderTechs();
    updateStats();
  } catch(e) { toast('Error: ' + e.message, true); }
}

async function rejectTech(userId) {
  try {
    const { error } = await sb.from('technicians').update({ status: 'rejected' }).eq('user_id', userId);
    if (error) throw error;
    toast('Technician rejected');
    await loadTechs();
    renderApprovals();
    renderTechs();
  } catch(e) { toast('Error: ' + e.message, true); }
}

// ── NEW WORK ORDER ────────────────────────────────────────────────
let newClientMode = false;

function openNewWO() {
  ['wo-title','wo-desc','wo-rate','wo-date','wo-time','wo-notes'].forEach(clearField);
  newClientMode = false;

  const csel = document.getElementById('wo-client');
  if (csel) {
    csel.innerHTML = '<option value="">Select client…</option>' +
      allClients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
  const tsel = document.getElementById('wo-tech');
  if (tsel) {
    tsel.innerHTML = '<option value="">Assign later…</option>' +
      allTechs.filter(t => t.status === 'active')
        .map(t => `<option value="${t.user_id}">${esc(t.name)}</option>`).join('');
  }
  showNewClient(false);
  const modal = document.getElementById('new-wo-modal');
  if (modal) modal.style.display = 'flex';
}

function showNewClient(show) {
  newClientMode = show;
  const fields = document.getElementById('wo-new-client-fields');
  const btn    = document.getElementById('wo-new-client-btn');
  const csel   = document.getElementById('wo-client');
  if (fields) fields.style.display = show ? 'block' : 'none';
  if (btn)    btn.textContent       = show ? '← Use existing client' : '+ New client';
  if (csel)   csel.style.display    = show ? 'none' : 'block';
}

function toggleNewClient() { showNewClient(!newClientMode); }

async function submitWorkOrder() {
  const title = val('wo-title').trim();
  if (!title) { toast('Job title is required', true); return; }

  setDisabled('wo-submit', true, 'Creating…');
  try {
    let clientId = val('wo-client');

    if (newClientMode) {
      const cName = val('wo-client-name').trim();
      if (!cName) { toast('Client name is required', true); setDisabled('wo-submit', false, 'Create Work Order'); return; }
      const { data: nc, error: ce } = await sb.from('clients').insert({
        name:  cName,
        email: val('wo-client-email') || null,
        phone: val('wo-client-phone') || null,
        city:  val('wo-client-city')  || null
      }).select().single();
      if (ce) throw ce;
      clientId = nc.id;
      await loadClients();
    }

    const { error } = await sb.from('jobs').insert({
      title,
      description:    val('wo-desc')     || null,
      status:         'pending',
      priority:       val('wo-priority') || 'medium',
      client_id:      clientId           || null,
      technician_id:  val('wo-tech')     || null,
      scheduled_date: val('wo-date')     || null,
      scheduled_time: val('wo-time')     || null,
      job_rate:       val('wo-rate') ? parseFloat(val('wo-rate')) : null,
      notes:          val('wo-notes')    || null
    });
    if (error) throw error;

    toast('Work order created!');
    closeModal();
    await loadJobs();
    showPanel('workorders');
    updateStats();
  } catch(e) {
    toast('Error: ' + e.message, true);
  } finally {
    setDisabled('wo-submit', false, 'Create Work Order');
  }
}

// ── SIGN OUT ──────────────────────────────────────────────────────
async function signOut() {
  try { await sb.auth.signOut(); } catch(e) {}
  window.location.href = 'index.html';
}

// ── TOAST ─────────────────────────────────────────────────────────
function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'toast-show' + (isErr ? ' toast-err' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = '', 3200);
}

// ── SIDEBAR MOBILE TOGGLE ─────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// ── HELPERS ──────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  catch(e) { return d; }
}

function emptyState(msg) {
  return `<div class="empty-state"><i data-feather="inbox"></i><p>${msg}</p></div>`;
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function clearField(id) {
  const el = document.getElementById(id);
  if (el) el.value = '';
}

function setDisabled(id, disabled, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = disabled;
  if (text !== undefined) el.textContent = text;
}
