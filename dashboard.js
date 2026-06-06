/* ================================================================
   Plush Intentions — Admin Dashboard
   dashboard.js — matched to admin-dashboard.html
   !! REPLACE YOUR_ANON_KEY_HERE with your Supabase anon/public key
================================================================ */

const SUPA_URL  = 'https://faithkncd.supabase.co';
const SUPA_KEY  = 'YOUR_ANON_KEY_HERE';   // ← paste your anon key here
const MAPBOX_TK = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

/* ── Supabase ───────────────────────────────────────────────── */
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

/* ── State ──────────────────────────────────────────────────── */
let jobs=[], techs=[], clients=[], infractions=[];
let mapInst=null, assignJobId=null;

/* ================================================================
   1. HIDE LOADER — runs synchronously, before ANY async code
================================================================ */
function hideLoader() {
  const lo = document.getElementById('loader');
  if (!lo) return;
  lo.style.transition = 'opacity .4s';
  lo.style.opacity    = '0';
  setTimeout(() => { lo.style.display = 'none'; }, 450);
}

/* ── Run as soon as DOM is parsed ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

  /* Hide loader immediately — no async needed */
  hideLoader();

  /* Feather icons */
  if (window.feather) feather.replace();

  /* Check session in background — redirect only if confirmed no session */
  sb.auth.getSession().then(function (result) {
    const session = result.data && result.data.session;
    if (!session) {
      window.location.href = 'index.html';
      return;
    }
    const el = document.getElementById('signed-in-email');
    if (el) el.textContent = session.user.email;
  }).catch(function (e) {
    console.warn('Session check failed:', e.message);
  });

  /* Load data */
  loadAllData();

  /* Init map */
  setTimeout(initMap, 300);
});

/* ================================================================
   2. DATA — loadAllData matches the refresh button in HTML
================================================================ */
async function loadAllData() {
  const [jRes, tRes, cRes, iRes] = await Promise.allSettled([
    sb.from('jobs').select('*').order('created_at', { ascending: false }),
    sb.from('technicians').select('*'),
    sb.from('clients').select('*').order('name'),
    sb.from('infractions').select('*').order('created_at', { ascending: false }),
  ]);

  jobs        = (jRes.value && !jRes.value.error) ? (jRes.value.data || []) : [];
  techs       = (tRes.value && !tRes.value.error) ? (tRes.value.data || []) : [];
  clients     = (cRes.value && !cRes.value.error) ? (cRes.value.data || []) : [];
  infractions = (iRes.value && !iRes.value.error) ? (iRes.value.data || []) : [];

  if (jRes.value?.error) console.warn('jobs:', jRes.value.error.message);
  if (tRes.value?.error) console.warn('techs:', tRes.value.error.message);
  if (cRes.value?.error) console.warn('clients:', cRes.value.error.message);
  if (iRes.value?.error) console.warn('infractions:', iRes.value.error.message);

  updateStats();
  updateBadges();
  renderAll();
  if (window.feather) feather.replace();
}

function renderAll() {
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
  populateNewJobDropdowns();
}

/* ── Stats ─────────────────────────────────────────────────── */
function updateStats() {
  const active  = jobs.filter(j => j.status === 'active').length;
  const pending = jobs.filter(j => j.status === 'pending').length;
  setText('stat-jobs',    jobs.length);
  setText('stat-active',  active);
  setText('stat-pending', pending);
  setText('stat-techs',   techs.length);
  setText('m-stat-jobs',    jobs.length);
  setText('m-stat-active',  active);
  setText('m-stat-pending', pending);
  setText('m-stat-techs',   techs.length);
}

function updateBadges() {
  const pend = jobs.filter(j => j.status === 'pending').length;
  const appv = techs.filter(t => t.status === 'pending_approval' || t.status === 'pending_review').length;
  const infr = infractions.filter(i => !i.resolved && i.status !== 'resolved').length;
  badge('badge-pending',    pend);
  badge('badge-approvals',  appv);
  badge('badge-infractions',infr);
}

function badge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n > 0 ? String(n) : '';
  el.style.display = n > 0 ? 'inline-flex' : 'none';
}

/* ================================================================
   3. PANEL NAVIGATION
================================================================ */
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  const nav   = document.getElementById('nav-' + name);
  if (nav)   nav.classList.add('active');
  const bnav  = document.getElementById('bnav-' + name);
  if (bnav)  bnav.classList.add('active');

  const titles = {
    map:'Live Map', jobs:'All Jobs', pending:'Pending Jobs',
    techs:'Technicians', clients:'Clients', completed:'Completed Jobs',
    approvals:'Pending Approvals', workorders:'Work Orders',
    infractions:'Infractions', earnings:'Earnings & Hours',
    usermgmt:'User Management', newjob:'New Work Order'
  };
  setText('topbar-title', titles[name] || 'Dashboard');
  closeSidebar();
  if (name === 'map' && mapInst) setTimeout(() => mapInst.resize(), 150);
}

/* ── Sidebar ─────────────────────────────────────────────────── */
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
}

/* ── Sign out ────────────────────────────────────────────────── */
async function signOut() {
  try { await sb.auth.signOut(); } catch(e){}
  window.location.href = 'index.html';
}

/* ================================================================
   4. MAP
================================================================ */
function initMap() {
  const container = document.getElementById('map-container');
  if (!container || mapInst) return;
  try {
    mapboxgl.accessToken = MAPBOX_TK;
    mapInst = new mapboxgl.Map({
      container: 'map-container',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-83.0, 41.5],
      zoom: 9
    });
    mapInst.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    mapInst.on('load', plotMapMarkers);
  } catch(e) { console.warn('Map error:', e.message); }
}

function plotMapMarkers() {
  if (!mapInst) return;
  techs.forEach(t => {
    const lat = t.lat || t.latitude;
    const lng = t.lng || t.longitude;
    if (!lat || !lng) return;
    const el = document.createElement('div');
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#FF4F9F;border:2px solid #fff;';
    new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({offset:18}).setHTML('<b>'+esc(techName(t))+'</b><br>Technician'))
      .addTo(mapInst);
  });
}

/* ================================================================
   5. RENDER PANELS
================================================================ */

/* ── All Jobs ───────────────────────────────────────────────── */
function renderJobs() {
  const el = document.getElementById('jobs-grid');
  if (!el) return;
  el.innerHTML = jobs.length ? jobs.map(j => jobCard(j)).join('') : emptyHTML('briefcase','No jobs found');
  if (window.feather) feather.replace();
}

/* ── Pending ────────────────────────────────────────────────── */
function renderPending() {
  const el = document.getElementById('pending-grid');
  if (!el) return;
  const list = jobs.filter(j => j.status === 'pending');
  el.innerHTML = list.length ? list.map(j => jobCard(j, true)).join('') : emptyHTML('clock','No pending jobs');
  if (window.feather) feather.replace();
}

/* ── Completed ──────────────────────────────────────────────── */
function renderCompleted() {
  const el = document.getElementById('completed-grid');
  if (!el) return;
  const list = jobs.filter(j => j.status === 'completed');
  el.innerHTML = list.length ? list.map(j => jobCard(j)).join('') : emptyHTML('check-circle','No completed jobs');
  if (window.feather) feather.replace();
}

/* ── Job card ───────────────────────────────────────────────── */
function jobCard(j, showAssign) {
  const tech   = techs.find(t => t.user_id === j.technician_id || t.id === j.technician_id);
  const client = clients.find(c => c.id === j.client_id);
  const sc = { pending:'#facc15', active:'#4ade80', completed:'#60a5fa', cancelled:'#f87171' }[j.status] || '#9ca3af';
  return `
  <div class="card-item glass">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px">
      <span style="font-weight:700;font-size:14.5px;flex:1;line-height:1.3">${esc(j.title||'Untitled')}</span>
      <span style="background:${sc}22;color:${sc};padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;text-transform:uppercase">${j.status||'unknown'}</span>
    </div>
    <div style="font-size:12px;opacity:.55;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px">
      ${client ? `<span>👤 ${esc(client.name)}</span>` : ''}
      ${tech   ? `<span>🔧 ${esc(techName(tech))}</span>` : '<span style="opacity:.4">Unassigned</span>'}
      ${j.scheduled_date ? `<span>📅 ${fmtDate(j.scheduled_date)}</span>` : ''}
      ${j.job_rate ? `<span>💵 $${parseFloat(j.job_rate).toFixed(2)}</span>` : ''}
    </div>
    ${j.description ? `<p style="font-size:12px;opacity:.55;margin-bottom:10px;line-height:1.5">${esc(j.description)}</p>` : ''}
    ${showAssign ? `<button onclick="openAssignModal('${j.id}','${esc(j.title||'Job')}')" style="padding:8px 16px;border-radius:9px;background:#FF4F9F;color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;width:100%">Assign Technician</button>` : ''}
  </div>`;
}

/* ── Technicians ────────────────────────────────────────────── */
function renderTechs() {
  const el = document.getElementById('techs-grid');
  if (!el) return;
  const list = techs.filter(t => t.status !== 'pending_approval' && t.status !== 'pending_review');
  if (!list.length) { el.innerHTML = emptyHTML('users','No technicians found'); return; }
  el.innerHTML = list.map(t => {
    const assigned = jobs.filter(j => (j.technician_id === t.user_id || j.technician_id === t.id) && j.status !== 'completed').length;
    return `
    <div class="card-item glass">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0">${techInits(t)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14.5px">${esc(techName(t))}</div>
          <div style="font-size:11.5px;opacity:.45">${esc(t.email||'')}</div>
          ${t.phone ? `<div style="font-size:11px;opacity:.35">${esc(t.phone)}</div>` : ''}
        </div>
        <span style="font-size:10px;padding:3px 9px;border-radius:20px;font-weight:700;background:${t.status==='active'?'#4ade8022':'#9ca3af22'};color:${t.status==='active'?'#4ade80':'#9ca3af'};white-space:nowrap">${t.status||'unknown'}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:18px;font-weight:800;color:#FF4F9F">${assigned}</div>
          <div style="opacity:.4;margin-top:2px">Active Jobs</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:14px;font-weight:700;color:#60a5fa">${esc(t.city||'–')}</div>
          <div style="opacity:.4;margin-top:2px">City</div>
        </div>
      </div>
      ${t.skills ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px">${(Array.isArray(t.skills)?t.skills:t.skills.split(',')).map(s=>`<span style="padding:3px 9px;border-radius:20px;font-size:10px;background:rgba(255,79,159,.12);border:1px solid rgba(255,79,159,.22);color:#FF4F9F">${esc(s.toString().trim())}</span>`).join('')}</div>` : ''}
      <div style="margin-top:10px">
        <button onclick="openResetPwModal('${t.user_id||t.id}','${esc(techName(t))}')" style="padding:7px 14px;border-radius:9px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);color:#fff;font-size:12px;cursor:pointer">Reset PW</button>
      </div>
    </div>`;
  }).join('');
  if (window.feather) feather.replace();
}

/* ── Clients ────────────────────────────────────────────────── */
function renderClients() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  if (!clients.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No clients found</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(c => `
  <tr>
    <td>${esc(c.name||'')}</td>
    <td>${esc(c.email||'–')}</td>
    <td>${esc(c.phone||'–')}</td>
    <td>${esc(c.city||'–')}</td>
    <td><button onclick="deleteClient('${c.id}')" style="padding:5px 10px;border-radius:7px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.28);color:#f87171;font-size:11px;cursor:pointer">Delete</button></td>
  </tr>`).join('');
}

/* ── Approvals ──────────────────────────────────────────────── */
function renderApprovals() {
  const el = document.getElementById('approvals-grid');
  if (!el) return;
  const list = techs.filter(t => t.status === 'pending_approval' || t.status === 'pending_review');
  if (!list.length) { el.innerHTML = emptyHTML('user-check','No pending approvals'); return; }
  el.innerHTML = list.map(t => `
  <div class="card-item glass">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0">${techInits(t)}</div>
      <div>
        <div style="font-weight:700;font-size:14.5px">${esc(techName(t))}</div>
        <div style="font-size:11.5px;opacity:.45">${esc(t.email||'')}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="approveTech('${t.user_id||t.id}')" style="flex:1;padding:9px;border-radius:9px;background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.3);color:#4ade80;font-size:13px;font-weight:700;cursor:pointer">✓ Approve</button>
      <button onclick="rejectTech('${t.user_id||t.id}')" style="flex:1;padding:9px;border-radius:9px;background:rgba(239,68,68,.13);border:1px solid rgba(239,68,68,.28);color:#f87171;font-size:13px;font-weight:700;cursor:pointer">✕ Reject</button>
    </div>
  </div>`).join('');
}

/* ── Work Orders ────────────────────────────────────────────── */
let woStatusFilter = 'all';
function renderWorkOrders() {
  const el = document.getElementById('workorders-grid');
  if (!el) return;
  const list = woStatusFilter === 'all' ? jobs : jobs.filter(j => j.status === woStatusFilter);
  if (!list.length) { el.innerHTML = emptyHTML('file-text','No work orders found'); return; }
  el.innerHTML = list.map(j => jobCard(j, j.status === 'pending')).join('');
  if (window.feather) feather.replace();
}
function filterWorkOrders(filter, btn) {
  woStatusFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderWorkOrders();
}

/* ── Infractions ────────────────────────────────────────────── */
function renderInfractions() {
  const el = document.getElementById('infractions-grid');
  if (!el) return;
  if (!infractions.length) { el.innerHTML = emptyHTML('alert-triangle','No infractions recorded'); return; }
  el.innerHTML = infractions.map(i => {
    const tech = techs.find(t => t.user_id === i.technician_id || t.id === i.technician_id);
    const resolved = i.resolved || i.status === 'resolved';
    return `
    <div class="card-item glass">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:6px">
        <div>
          <div style="font-weight:700">${esc(tech ? techName(tech) : 'Unknown Tech')}</div>
          <div style="font-size:11px;opacity:.4">${fmtDate(i.created_at)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(239,68,68,.14);color:#f87171;border:1px solid rgba(239,68,68,.25)">${i.severity||'low'}</span>
          <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;${resolved?'background:rgba(74,222,128,.12);color:#4ade80;border:1px solid rgba(74,222,128,.25)':'background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.25)'}">${resolved?'Resolved':'Open'}</span>
        </div>
      </div>
      <p style="font-size:13px;opacity:.65;margin-bottom:10px;line-height:1.5">${esc(i.description||i.reason||'')}</p>
      ${!resolved ? `<button onclick="resolveInfraction('${i.id}')" style="padding:7px 14px;border-radius:9px;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.25);color:#4ade80;font-size:12px;cursor:pointer">Mark Resolved</button>` : ''}
    </div>`;
  }).join('');
}

/* ── Earnings ───────────────────────────────────────────────── */
function renderEarnings() {
  const done = jobs.filter(j => j.status === 'completed');
  let totalEarn = 0, totalMins = 0;
  const byTech = {};
  done.forEach(j => {
    const hrs  = calcHrs(j.check_in_time, j.check_out_time) || 0;
    const earn = hrs && j.job_rate ? hrs * parseFloat(j.job_rate) : 0;
    totalEarn += earn;
    totalMins += hrs * 60;
    const tid = j.technician_id || '_none';
    if (!byTech[tid]) byTech[tid] = { jobs:0, mins:0, earn:0 };
    byTech[tid].jobs++;
    byTech[tid].mins += hrs * 60;
    byTech[tid].earn += earn;
  });
  setText('earn-total', '$' + totalEarn.toFixed(2));
  setText('earn-hours', (totalMins/60).toFixed(1) + 'h');
  setText('earn-count', done.length);

  const breakdown = document.getElementById('earnings-breakdown');
  if (!breakdown) return;
  if (!Object.keys(byTech).length) { breakdown.innerHTML = emptyHTML('dollar-sign','No completed jobs with earnings yet'); return; }
  breakdown.innerHTML = Object.entries(byTech).map(([tid, d]) => {
    const tech = techs.find(t => t.user_id === tid || t.id === tid);
    return `
    <div class="card-item glass" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0">${tech ? techInits(tech) : '?'}</div>
      <div style="flex:1;min-width:100px">
        <div style="font-weight:700">${tech ? esc(techName(tech)) : 'Unknown'}</div>
        <div style="font-size:11.5px;opacity:.45">${d.jobs} job${d.jobs!==1?'s':''}</div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;text-align:right">
        <div><div style="font-size:18px;font-weight:800;color:#4ade80">$${d.earn.toFixed(2)}</div><div style="font-size:10px;opacity:.4">Earnings</div></div>
        <div><div style="font-size:18px;font-weight:800;color:#60a5fa">${(d.mins/60).toFixed(1)}h</div><div style="font-size:10px;opacity:.4">Hours</div></div>
      </div>
    </div>`;
  }).join('');
}

/* ── User Management ────────────────────────────────────────── */
function renderUserMgmt() {
  const ag = document.getElementById('admins-grid');
  if (ag) ag.innerHTML = '<div style="opacity:.4;font-size:13px;padding:16px">Manage admin accounts via Supabase Dashboard → Authentication → Users.</div>';

  const tg = document.getElementById('usermgmt-techs-grid');
  if (!tg) return;
  if (!techs.length) { tg.innerHTML = emptyHTML('users','No technicians'); return; }
  tg.innerHTML = techs.map(t => `
  <div class="card-item glass" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0">${techInits(t)}</div>
    <div style="flex:1;min-width:120px">
      <div style="font-weight:700;font-size:13.5px">${esc(techName(t))}</div>
      <div style="font-size:11.5px;opacity:.4">${esc(t.email||'')}</div>
    </div>
    <button onclick="openResetPwModal('${t.user_id||t.id}','${esc(techName(t))}')" style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);color:#fff;font-size:11px;cursor:pointer">Reset PW</button>
  </div>`).join('');
}

/* ── New Work Order dropdowns ───────────────────────────────── */
function populateNewJobDropdowns() {
  const cs = document.getElementById('nj-client');
  const ts = document.getElementById('nj-tech');
  if (cs) cs.innerHTML = '<option value="">Select client…</option>' + clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (ts) ts.innerHTML = '<option value="">Unassigned</option>' + techs.filter(t=>t.status!=='pending_approval').map(t=>`<option value="${t.user_id||t.id}">${esc(techName(t))}</option>`).join('');
}

async function createWorkOrder() {
  const title = getVal('nj-title');
  if (!title) { showToast('Job title is required','error'); return; }
  const btn = document.querySelector('#panel-newjob .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  const { error } = await sb.from('jobs').insert([{
    title,
    description:    getVal('nj-description') || null,
    client_id:      getVal('nj-client') || null,
    technician_id:  getVal('nj-tech') || null,
    priority:       getVal('nj-priority') || 'normal',
    job_rate:       getVal('nj-rate') ? parseFloat(getVal('nj-rate')) : null,
    scheduled_date: getVal('nj-date') || null,
    scheduled_time: getVal('nj-time') || null,
    notes:          getVal('nj-notes') || null,
    status:         getVal('nj-tech') ? 'active' : 'pending',
  }]);
  if (btn) { btn.disabled = false; btn.innerHTML = '<i data-feather="plus-circle"></i> Create Work Order'; if(window.feather)feather.replace(); }
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Work order created!','success');
  ['nj-title','nj-description','nj-rate','nj-date','nj-time','nj-notes'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  await loadAllData();
  showPanel('workorders');
}

/* ================================================================
   6. MODALS
================================================================ */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) {
  if (id) document.getElementById(id)?.classList.remove('open');
  else document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('open'));
}
document.addEventListener('click', e => { if (e.target.classList.contains('modal-overlay')) closeModal(); });

/* ── Assign Modal ───────────────────────────────────────────── */
function openAssignModal(jobId, jobTitle) {
  assignJobId = jobId;
  setText('modal-job-title', 'Assign a technician to: '+jobTitle);
  const sel = document.getElementById('modal-tech-select');
  if (sel) sel.innerHTML = '<option value="">Choose technician…</option>' +
    techs.filter(t=>t.status!=='pending_approval').map(t=>`<option value="${t.user_id||t.id}">${esc(techName(t))}</option>`).join('');
  openModal('assign-modal');
}
async function confirmAssign() {
  const tid = getVal('modal-tech-select');
  if (!tid) { showToast('Please choose a technician','error'); return; }
  const { error } = await sb.from('jobs').update({ technician_id:tid, status:'active' }).eq('id', assignJobId);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Technician assigned!','success');
  closeModal('assign-modal');
  await loadAllData();
}

/* ── Create User Modal ──────────────────────────────────────── */
function openCreateUserModal() {
  ['cu-name','cu-email','cu-password','cu-phone','cu-city'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const r = document.getElementById('cu-role'); if(r) r.value='technician';
  const err = document.getElementById('cu-error'); if(err){err.textContent='';err.style.display='none';}
  toggleTechFields();
  openModal('create-user-modal');
}
function toggleTechFields() {
  const role = getVal('cu-role');
  const tf = document.getElementById('cu-tech-fields');
  if (tf) tf.style.display = role==='technician' ? 'block' : 'none';
}
async function createUser() {
  const name=getVal('cu-name'), email=getVal('cu-email'), pass=getVal('cu-password'), role=getVal('cu-role');
  const phone=getVal('cu-phone'), city=getVal('cu-city');
  const errEl = document.getElementById('cu-error');
  const setErr = msg => { if(errEl){errEl.textContent=msg;errEl.style.display='block';} };
  if(errEl){errEl.textContent='';errEl.style.display='none';}
  if (!name||!email||!pass) { setErr('Name, email and password are required'); return; }
  if (pass.length<6) { setErr('Password must be at least 6 characters'); return; }
  const btn = document.getElementById('cu-submit-btn');
  if(btn) { btn.disabled=true; btn.textContent='Creating…'; }
  try {
    const { data, error } = await sb.auth.signUp({ email, password:pass });
    if (error) throw error;
    const uid = data?.user?.id;
    if (!uid) throw new Error('No user ID returned — check Supabase email confirmation settings');
    const profile = { email, status:'active', full_name:name };
    if (phone) profile.phone = phone;
    if (city)  profile.city  = city;
    if (role === 'technician') {
      const { error:e2 } = await sb.from('technicians').upsert([{ user_id:uid, ...profile }]);
      if (e2) console.warn('Profile insert:', e2.message);
    }
    showToast((role==='admin'?'Admin':'Technician')+' "'+name+'" created!','success');
    closeModal('create-user-modal');
    await loadAllData();
  } catch(e) { setErr(e.message||'Error creating user'); }
  finally { if(btn){btn.disabled=false;btn.textContent='Create User';} }
}

/* ── Reset PW Modal ─────────────────────────────────────────── */
let resetUid = null;
function openResetPwModal(uid, name) {
  resetUid = uid;
  setText('reset-pw-label','Reset password for '+name);
  const inp=document.getElementById('reset-pw-input'); if(inp)inp.value='';
  const conf=document.getElementById('reset-pw-confirm'); if(conf)conf.value='';
  const err=document.getElementById('reset-pw-error'); if(err){err.textContent='';err.style.display='none';}
  openModal('reset-pw-modal');
}
async function confirmResetPw() {
  const pw=getVal('reset-pw-input'), conf=getVal('reset-pw-confirm');
  const errEl=document.getElementById('reset-pw-error');
  const setErr=msg=>{if(errEl){errEl.textContent=msg;errEl.style.display='block';}};
  if(errEl){errEl.textContent='';errEl.style.display='none';}
  if (!pw||pw.length<6) { setErr('Password must be at least 6 characters'); return; }
  if (pw!==conf) { setErr('Passwords do not match'); return; }
  showToast('To reset a password, go to Supabase Dashboard → Authentication → Users → Reset Password','info');
  closeModal('reset-pw-modal');
}

/* ── Create Client Modal ────────────────────────────────────── */
function openCreateClientModal() {
  ['cc-name','cc-email','cc-phone','cc-city','cc-address'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const err=document.getElementById('cc-error'); if(err){err.textContent='';err.style.display='none';}
  openModal('create-client-modal');
}
async function createClient() {
  const name=getVal('cc-name');
  const errEl=document.getElementById('cc-error');
  if (!name) { if(errEl){errEl.textContent='Client name is required';errEl.style.display='block';} return; }
  const { error } = await sb.from('clients').insert([{
    name,
    email:   getVal('cc-email')   || null,
    phone:   getVal('cc-phone')   || null,
    city:    getVal('cc-city')    || null,
    address: getVal('cc-address') || null
  }]);
  if (error) { if(errEl){errEl.textContent=error.message;errEl.style.display='block';} return; }
  showToast('Client added!','success');
  closeModal('create-client-modal');
  await loadAllData();
}
async function deleteClient(id) {
  if (!confirm('Delete this client?')) return;
  const { error } = await sb.from('clients').delete().eq('id', id);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Client deleted','success');
  await loadAllData();
}

/* ── Tech actions ───────────────────────────────────────────── */
async function approveTech(id) {
  const { error } = await sb.from('technicians').update({ status:'active' }).or(`user_id.eq.${id},id.eq.${id}`);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Technician approved!','success');
  await loadAllData();
}
async function rejectTech(id) {
  if (!confirm('Reject this technician application?')) return;
  const { error } = await sb.from('technicians').delete().or(`user_id.eq.${id},id.eq.${id}`);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Application rejected','success');
  await loadAllData();
}
async function resolveInfraction(id) {
  const { error } = await sb.from('infractions').update({ resolved:true, status:'resolved' }).eq('id', id);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Infraction resolved','success');
  await loadAllData();
}

/* ================================================================
   7. TOAST
================================================================ */
function showToast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast-show' + (type==='error'?' toast-error':type==='info'?' toast-info':'');
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.className=''; }, 3500);
}

/* ================================================================
   8. UTILITIES
================================================================ */
function techName(t) {
  if (!t) return '';
  return t.full_name || t.name || t.email || '';
}
function techInits(t) {
  const n = techName(t);
  if (!n) return '?';
  const parts = n.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
    : n.slice(0,2).toUpperCase();
}
function calcHrs(ci, co) {
  if (!ci || !co) return null;
  const ms = new Date(co) - new Date(ci);
  return isNaN(ms) || ms < 0 ? null : ms / 3600000;
}
function fmtDate(d) {
  if (!d) return '–';
  try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  catch(e) { return d; }
}
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function emptyHTML(icon, msg) {
  return `<div class="empty-state"><i data-feather="${icon}"></i><p>${msg}</p></div>`;
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/* ── Extra runtime styles ───────────────────────────────────── */
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .card-item { border-radius:16px; padding:18px 20px; margin-bottom:0; }
    .card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:14px; }
    .toast-show { opacity:1 !important; transform:translateX(-50%) translateY(0) !important; }
    .toast-error { border-color:rgba(239,68,68,.4) !important; color:#f87171 !important; }
    .toast-info  { border-color:rgba(96,165,250,.4) !important; color:#60a5fa !important; }
    .filter-tab.active { background:rgba(255,79,159,.15); border-color:rgba(255,79,159,.35); color:#FF4F9F; }
    .modal-overlay.open { display:flex !important; }
    .modal-error { display:block; }
  `;
  document.head.appendChild(style);
})();
