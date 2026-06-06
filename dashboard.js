/* ============================================================
   Plush Intentions — Admin Dashboard JS
   dashboard.js  |  Supabase v2
   ============================================================ */

// ── CONFIG ──────────────────────────────────────────────────
const SUPA_URL  = 'https://faithkncd.supabase.co';
const SUPA_ANON = 'YOUR_SUPABASE_ANON_KEY_HERE'; // ← PASTE YOUR KEY HERE
const MAPBOX_TOKEN = 'pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg';

// ── HIDE LOADER IMMEDIATELY (before anything async) ─────────
(function hideLoaderNow() {
  function doHide() {
    const el = document.getElementById('loader');
    if (el) {
      el.style.transition = 'opacity 0.5s ease';
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 520);
    }
    const auth = document.getElementById('auth-screen');
    if (auth) auth.style.display = 'none';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(doHide, 1200));
  } else {
    setTimeout(doHide, 1200);
  }
})();

// ── SUPABASE CLIENT ─────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_ANON);

// ── STATE ────────────────────────────────────────────────────
let allJobs        = [];
let allTechs       = [];
let allClients     = [];
let allInfractions = [];
let allWorkOrders  = [];
let currentPanel   = 'map';
let assigningJobId = null;
let mapInstance    = null;

// ── DOM READY ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.feather) feather.replace();
  showPanel('map');
  checkSession();
  loadAll();
  setTimeout(initMap, 400);
});

// ── SESSION CHECK ─────────────────────────────────────────────
async function checkSession() {
  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    const emailEl = document.getElementById('signed-in-email');
    if (emailEl) emailEl.textContent = session.user.email;
  } catch (e) { console.warn('Session check failed:', e); }
}

// ── SIGN OUT ──────────────────────────────────────────────────
async function signOut() {
  try { await db.auth.signOut(); } catch(e) {}
  window.location.href = 'index.html';
}

// ── LOAD ALL DATA ─────────────────────────────────────────────
async function loadAll() {
  const results = await Promise.allSettled([
    loadJobs(), loadTechs(), loadClients(),
    loadInfractions(), loadWorkOrders()
  ]);
  results.forEach((r,i) => { if(r.status==='rejected') console.warn(`loadAll[${i}]:`,r.reason); });
  updateStats();
  updateBadges();
}

async function loadJobs() {
  const { data, error } = await db.from('jobs').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  allJobs = data || [];
  renderJobs(); renderPending(); renderCompleted(); populateJobForm();
}

async function loadTechs() {
  const { data, error } = await db.from('technicians').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  allTechs = data || [];
  renderTechs(); renderApprovals(); renderUserMgmt();
}

async function loadClients() {
  const { data, error } = await db.from('clients').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  allClients = data || [];
  renderClients();
}

async function loadInfractions() {
  const { data, error } = await db.from('infractions').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  allInfractions = data || [];
  renderInfractions(); updateBadges();
}

async function loadWorkOrders() {
  const { data, error } = await db.from('work_orders').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  allWorkOrders = data || [];
  renderWorkOrders(); renderEarnings();
}

// ── STATS ─────────────────────────────────────────────────────
function updateStats() {
  const active  = allJobs.filter(j=>j.status==='active').length;
  const pending = allJobs.filter(j=>j.status==='pending').length;
  [['stat-jobs',allJobs.length],['stat-active',active],['stat-pending',pending],['stat-techs',allTechs.length]].forEach(([id,val])=>{
    s(id, val); s('m-'+id, val);
  });
}

function updateBadges() {
  setBadge('badge-pending',    allJobs.filter(j=>j.status==='pending').length);
  setBadge('badge-approvals',  allTechs.filter(t=>t.status==='pending').length);
  setBadge('badge-infractions',allInfractions.filter(x=>!x.resolved).length);
}

function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n > 0 ? n : '';
  el.style.display = n > 0 ? 'inline-flex' : 'none';
}

// ── PANEL NAV ─────────────────────────────────────────────────
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-'+name);
  if (panel) panel.classList.add('active');
  const nav = document.getElementById('nav-'+name);
  if (nav) nav.classList.add('active');
  const bnav = document.getElementById('bnav-'+name);
  if (bnav) bnav.classList.add('active');
  const titles = {map:'Live Map',jobs:'All Jobs',pending:'Pending Jobs',techs:'Technicians',clients:'Clients',completed:'Completed Jobs',approvals:'Tech Approvals',workorders:'Work Orders',infractions:'Infractions',earnings:'Earnings',usermgmt:'User Management',newjob:'New Job'};
  s('topbar-title', titles[name] || 'Dashboard');
  currentPanel = name;
  closeSidebar();
  if (name==='map') setTimeout(()=>{ if(mapInstance) mapInstance.resize(); }, 200);
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
}

// ── RENDER: JOBS ──────────────────────────────────────────────
function renderJobs() {
  const grid = document.getElementById('jobs-grid');
  if (!grid) return;
  if (!allJobs.length) { grid.innerHTML = empty('No jobs found'); return; }
  grid.innerHTML = allJobs.map(j => jobCard(j)).join('');
  if (window.feather) feather.replace();
}

function renderPending() {
  const grid = document.getElementById('pending-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j=>j.status==='pending');
  if (!jobs.length) { grid.innerHTML = empty('No pending jobs'); return; }
  grid.innerHTML = jobs.map(j => jobCard(j, true)).join('');
  if (window.feather) feather.replace();
}

function renderCompleted() {
  const grid = document.getElementById('completed-grid');
  if (!grid) return;
  const jobs = allJobs.filter(j=>j.status==='completed');
  if (!jobs.length) { grid.innerHTML = empty('No completed jobs'); return; }
  grid.innerHTML = jobs.map(j => jobCard(j)).join('');
  if (window.feather) feather.replace();
}

function jobCard(j, showAssign=false) {
  const sc = {pending:'#facc15',active:'#4ade80',completed:'#60a5fa',cancelled:'#ef4444','in-progress':'#a78bfa'}[j.status]||'#9ca3af';
  const techName = j.tech_id ? (tName(allTechs.find(t=>t.id===j.tech_id))||'Unassigned') : 'Unassigned';
  return `<div class="card glass" style="padding:18px 20px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="flex:1;font-weight:700;font-size:15px;">${esc(j.title||'Untitled Job')}</div>
      <span style="background:${sc}22;color:${sc};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;">${j.status||'unknown'}</span>
    </div>
    <div style="font-size:12px;opacity:.55;margin-bottom:6px;">${esc(j.description||'')}</div>
    <div style="display:flex;gap:14px;font-size:12px;opacity:.6;flex-wrap:wrap;margin-bottom:${showAssign?'12':'0'}px;">
      <span>${esc(techName)}</span>
      ${j.priority?`<span>${esc(j.priority)}</span>`:''}
      ${j.scheduled_date?`<span>${fmtDate(j.scheduled_date)}</span>`:''}
    </div>
    ${showAssign?`<button class="btn-pink" style="width:100%;margin-top:4px;" onclick="openAssignModal('${j.id}','${esc(j.title||'')}')">Assign Technician</button>`:''}
  </div>`;
}

// ── RENDER: TECHS ─────────────────────────────────────────────
function renderTechs() {
  const grid = document.getElementById('techs-grid');
  if (!grid) return;
  const active = allTechs.filter(t=>t.status!=='pending');
  if (!active.length) { grid.innerHTML = empty('No technicians found'); return; }
  grid.innerHTML = active.map(t => {
    const completed = allJobs.filter(j=>j.tech_id===t.id&&j.status==='completed').length;
    return `<div class="card glass" style="padding:18px 20px;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#c026d3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;">${tInits(t)}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:15px;">${esc(tName(t))}</div>
          <div style="font-size:12px;opacity:.5;">${esc(t.email||'')}</div>
        </div>
        <span style="background:${t.is_active?'#4ade8022':'#9ca3af22'};color:${t.is_active?'#4ade80':'#9ca3af'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${t.is_active?'Active':'Inactive'}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#FF4F9F;">${completed}</div>
          <div style="opacity:.5;margin-top:2px;">Completed</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#60a5fa;">${esc(t.city||'–')}</div>
          <div style="opacity:.5;margin-top:2px;">City</div>
        </div>
      </div>
    </div>`;
  }).join('');
  if (window.feather) feather.replace();
}

// ── RENDER: CLIENTS ───────────────────────────────────────────
function renderClients() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  if (!allClients.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.4;padding:24px;">No clients found</td></tr>`;
    return;
  }
  tbody.innerHTML = allClients.map(c=>`<tr>
    <td>${esc(c.name||'')}</td>
    <td>${esc(c.email||'–')}</td>
    <td>${esc(c.phone||'–')}</td>
    <td>${esc(c.city||'–')}</td>
    <td><button class="btn-sm btn-danger" onclick="deleteClient('${c.id}')">Delete</button></td>
  </tr>`).join('');
}

// ── RENDER: APPROVALS ─────────────────────────────────────────
function renderApprovals() {
  const grid = document.getElementById('approvals-grid');
  if (!grid) return;
  const pending = allTechs.filter(t=>t.status==='pending');
  if (!pending.length) { grid.innerHTML = empty('No pending approvals'); return; }
  grid.innerHTML = pending.map(t=>`<div class="card glass" style="padding:18px 20px;display:flex;align-items:center;gap:14px;">
    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#c026d3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;">${tInits(t)}</div>
    <div style="flex:1;">
      <div style="font-weight:700;">${esc(tName(t))}</div>
      <div style="font-size:12px;opacity:.5;">${esc(t.email||'')}</div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn-sm btn-pink" onclick="approveTech('${t.id}')">Approve</button>
      <button class="btn-sm btn-danger" onclick="rejectTech('${t.id}')">Reject</button>
    </div>
  </div>`).join('');
  if (window.feather) feather.replace();
}

// ── RENDER: WORK ORDERS ───────────────────────────────────────
let woFilter = 'all';
function renderWorkOrders() {
  const grid = document.getElementById('workorders-grid');
  if (!grid) return;
  let orders = allWorkOrders;
  if (woFilter !== 'all') orders = orders.filter(o=>o.status===woFilter);
  if (!orders.length) { grid.innerHTML = empty('No work orders found'); return; }
  grid.innerHTML = orders.map(wo=>{
    const tech = allTechs.find(t=>t.id===wo.tech_id);
    const job  = allJobs.find(j=>j.id===wo.job_id);
    const hrs  = calcHrs(wo.check_in, wo.check_out);
    const earn = wo.hourly_rate&&hrs ? `$${(wo.hourly_rate*hrs).toFixed(2)}` : wo.total_amount ? `$${Number(wo.total_amount).toFixed(2)}` : '–';
    const sc   = {pending:'#facc15',active:'#4ade80',completed:'#60a5fa','in-progress':'#a78bfa'}[wo.status]||'#9ca3af';
    return `<div class="card glass" style="padding:18px 20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="flex:1;font-weight:700;font-size:15px;">${esc(wo.title||job?.title||'Work Order')}</div>
        <span style="background:${sc}22;color:${sc};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;">${wo.status||'–'}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:10px;">
        <div style="opacity:.6;"><b>Tech:</b> ${esc(tName(tech)||'Unassigned')}</div>
        <div style="opacity:.6;"><b>Hours:</b> ${hrs!==null?hrs.toFixed(2)+'h':'–'}</div>
        <div style="opacity:.6;"><b>Check In:</b> ${wo.check_in?fmtDate(wo.check_in):'–'}</div>
        <div style="opacity:.6;"><b>Check Out:</b> ${wo.check_out?fmtDate(wo.check_out):'–'}</div>
        <div style="opacity:.6;"><b>Earnings:</b> ${earn}</div>
        <div style="opacity:.6;"><b>Rate:</b> ${wo.hourly_rate?'$'+wo.hourly_rate+'/hr':'–'}</div>
      </div>
      ${wo.documents?.length?`<div style="font-size:11px;opacity:.4;">${wo.documents.length} doc(s) uploaded</div>`:''}
    </div>`;
  }).join('');
}

function filterWorkOrders(filter, btn) {
  woFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderWorkOrders();
}

// ── RENDER: INFRACTIONS ───────────────────────────────────────
function renderInfractions() {
  const grid = document.getElementById('infractions-grid');
  if (!grid) return;
  if (!allInfractions.length) { grid.innerHTML = empty('No infractions recorded'); return; }
  grid.innerHTML = allInfractions.map(x=>{
    const tech = allTechs.find(t=>t.id===x.tech_id);
    return `<div class="card glass" style="padding:18px 20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="flex:1;font-weight:700;">${esc(x.type||'Infraction')}</div>
        <span style="background:${x.resolved?'#4ade8022':'#ef444422'};color:${x.resolved?'#4ade80':'#ef4444'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${x.resolved?'Resolved':'Open'}</span>
      </div>
      <div style="font-size:12px;opacity:.55;margin-bottom:10px;">${esc(x.description||'')}</div>
      <div style="font-size:12px;opacity:.5;margin-bottom:10px;">Tech: ${esc(tName(tech)||'Unknown')} · ${fmtDate(x.created_at)}</div>
      ${!x.resolved?`<button class="btn-sm btn-pink" onclick="resolveInfraction('${x.id}')">Mark Resolved</button>`:''}
    </div>`;
  }).join('');
  if (window.feather) feather.replace();
}

// ── RENDER: EARNINGS ──────────────────────────────────────────
function renderEarnings() {
  const completed = allWorkOrders.filter(wo=>wo.status==='completed');
  let totalEarn=0, totalHrs=0;
  completed.forEach(wo=>{
    const hrs=calcHrs(wo.check_in,wo.check_out);
    if(hrs) totalHrs+=hrs;
    if(wo.total_amount) totalEarn+=Number(wo.total_amount);
    else if(wo.hourly_rate&&hrs) totalEarn+=wo.hourly_rate*hrs;
  });
  s('earn-total','$'+totalEarn.toFixed(2));
  s('earn-hours',totalHrs.toFixed(1)+'h');
  s('earn-count',completed.length);

  const grid = document.getElementById('earnings-breakdown');
  if (!grid) return;
  if (!allTechs.length) { grid.innerHTML = empty('No data'); return; }
  grid.innerHTML = allTechs.map(t=>{
    const wos=completed.filter(wo=>wo.tech_id===t.id);
    let earn=0,hrs=0;
    wos.forEach(wo=>{
      const h=calcHrs(wo.check_in,wo.check_out);
      if(h) hrs+=h;
      if(wo.total_amount) earn+=Number(wo.total_amount);
      else if(wo.hourly_rate&&h) earn+=wo.hourly_rate*h;
    });
    return `<div class="card glass" style="padding:16px 18px;display:flex;align-items:center;gap:14px;">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#c026d3);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">${tInits(t)}</div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:14px;">${esc(tName(t))}</div>
        <div style="font-size:12px;opacity:.5;">${wos.length} completed orders</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800;font-size:16px;color:#FF4F9F;">$${earn.toFixed(2)}</div>
        <div style="font-size:12px;opacity:.5;">${hrs.toFixed(1)}h</div>
      </div>
    </div>`;
  }).join('');
}

// ── RENDER: USER MGMT ─────────────────────────────────────────
function renderUserMgmt() {
  const admGrid = document.getElementById('admins-grid');
  if (admGrid) admGrid.innerHTML = `<div style="opacity:.4;font-size:13px;padding:16px;">Admin accounts are managed via Supabase Auth.</div>`;
  const grid = document.getElementById('usermgmt-techs-grid');
  if (!grid) return;
  if (!allTechs.length) { grid.innerHTML = empty('No technicians'); return; }
  grid.innerHTML = allTechs.map(t=>`<div class="card glass" style="padding:14px 18px;display:flex;align-items:center;gap:12px;">
    <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#FF4F9F,#c026d3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;">${tInits(t)}</div>
    <div style="flex:1;">
      <div style="font-weight:700;font-size:13px;">${esc(tName(t))}</div>
      <div style="font-size:11px;opacity:.45;">${esc(t.email||'')}</div>
    </div>
    <button class="btn-sm" style="background:rgba(255,255,255,0.08);" onclick="openResetPwModal('${t.id}','${esc(tName(t))}')">Reset PW</button>
  </div>`).join('');
}

// ── POPULATE JOB FORM ─────────────────────────────────────────
function populateJobForm() {
  const clientSel = document.getElementById('nj-client');
  const techSel   = document.getElementById('nj-tech');
  if (clientSel) clientSel.innerHTML = '<option value="">Select client…</option>'+allClients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (techSel)   techSel.innerHTML   = '<option value="">Select technician…</option>'+allTechs.filter(t=>t.status!=='pending').map(t=>`<option value="${t.id}">${esc(tName(t))}</option>`).join('');
}

async function createWorkOrder() {
  const title=v('nj-title'),desc=v('nj-description'),cid=v('nj-client'),tid=v('nj-tech'),pri=v('nj-priority'),rate=v('nj-rate'),date=v('nj-date'),time=v('nj-time'),notes=v('nj-notes');
  if (!title) { showToast('Job title is required','error'); return; }
  const { error } = await db.from('jobs').insert([{title,description:desc,client_id:cid||null,tech_id:tid||null,priority:pri||'normal',hourly_rate:rate?Number(rate):null,scheduled_date:date||null,scheduled_time:time||null,notes,status:tid?'active':'pending'}]);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Job created!');
  loadAll();
  showPanel('jobs');
  ['nj-title','nj-description','nj-rate','nj-date','nj-time','nj-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}

// ── ASSIGN MODAL ──────────────────────────────────────────────
function openAssignModal(jobId, jobTitle) {
  assigningJobId = jobId;
  s('modal-job-title','Assign a technician to: <b>'+esc(jobTitle)+'</b>');
  const sel = document.getElementById('modal-tech-select');
  if (sel) sel.innerHTML = '<option value="">Choose technician…</option>'+allTechs.filter(t=>t.status!=='pending').map(t=>`<option value="${t.id}">${esc(tName(t))}</option>`).join('');
  openModal('assign-modal');
}
async function confirmAssign() {
  const techId=v('modal-tech-select');
  if (!techId) { showToast('Select a technician','error'); return; }
  const { error } = await db.from('jobs').update({tech_id:techId,status:'active'}).eq('id',assigningJobId);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Technician assigned!');
  closeModal('assign-modal');
  loadAll();
}

// ── CREATE USER MODAL ─────────────────────────────────────────
function openCreateUserModal() { openModal('create-user-modal'); }
function toggleTechFields() {
  const role=v('cu-role');
  const fields=document.getElementById('cu-tech-fields');
  if (fields) fields.style.display = role==='technician'?'block':'none';
}
async function createUser() {
  const name=v('cu-name'),email=v('cu-email'),pass=v('cu-password'),role=v('cu-role'),phone=v('cu-phone'),city=v('cu-city');
  const errEl=document.getElementById('cu-error'),btn=document.getElementById('cu-submit-btn');
  if (errEl) errEl.textContent='';
  if (!name||!email||!pass) { if(errEl) errEl.textContent='Name, email and password are required.'; return; }
  if (pass.length<6) { if(errEl) errEl.textContent='Password must be at least 6 characters.'; return; }
  if (btn) btn.disabled=true;
  try {
    const { data, error } = await db.auth.signUp({email,password:pass});
    if (error) throw error;
    const uid = data?.user?.id;
    if (!uid) throw new Error('Could not get user ID');
    if (role==='technician') {
      const { error:e2 } = await db.from('technicians').insert([{id:uid,full_name:name,email,phone:phone||null,city:city||null,status:'active',is_active:true}]);
      if (e2) throw e2;
    }
    showToast((role==='admin'?'Admin':'Technician')+' created!');
    closeModal('create-user-modal');
    loadAll();
    ['cu-name','cu-email','cu-password','cu-phone','cu-city'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  } catch(e) {
    if (errEl) errEl.textContent = e.message||'Error creating user';
  } finally {
    if (btn) btn.disabled=false;
  }
}

// ── RESET PW MODAL ────────────────────────────────────────────
function openResetPwModal(uid, name) {
  s('reset-pw-label','Reset password for <b>'+esc(name)+'</b>');
  const uidEl=document.getElementById('reset-pw-uid'); if(uidEl) uidEl.value=uid;
  const inp=document.getElementById('reset-pw-input'); if(inp) inp.value='';
  const conf=document.getElementById('reset-pw-confirm'); if(conf) conf.value='';
  openModal('reset-pw-modal');
}
async function confirmResetPw() {
  const pw=v('reset-pw-input'),conf=v('reset-pw-confirm');
  const errEl=document.getElementById('reset-pw-error');
  if (errEl) errEl.textContent='';
  if (!pw||pw.length<6) { if(errEl) errEl.textContent='Password must be 6+ characters'; return; }
  if (pw!==conf) { if(errEl) errEl.textContent='Passwords do not match'; return; }
  const { error } = await db.auth.updateUser({password:pw});
  if (error) { if(errEl) errEl.textContent=error.message; return; }
  showToast('Password updated!');
  closeModal('reset-pw-modal');
}

// ── CREATE CLIENT MODAL ───────────────────────────────────────
function openCreateClientModal() { openModal('create-client-modal'); }
async function createClient() {
  const name=v('cc-name'),email=v('cc-email'),phone=v('cc-phone'),city=v('cc-city'),addr=v('cc-address');
  const errEl=document.getElementById('cc-error');
  if (errEl) errEl.textContent='';
  if (!name) { if(errEl) errEl.textContent='Client name is required.'; return; }
  const { error } = await db.from('clients').insert([{name,email:email||null,phone:phone||null,city:city||null,address:addr||null}]);
  if (error) { if(errEl) errEl.textContent=error.message; return; }
  showToast('Client created!');
  closeModal('create-client-modal');
  loadClients();
  ['cc-name','cc-email','cc-phone','cc-city','cc-address'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}
async function deleteClient(id) {
  if (!confirm('Delete this client?')) return;
  const { error } = await db.from('clients').delete().eq('id',id);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Client deleted');
  loadClients();
}

// ── TECH ACTIONS ──────────────────────────────────────────────
async function approveTech(id) {
  const { error } = await db.from('technicians').update({status:'active',is_active:true}).eq('id',id);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Technician approved!'); loadAll();
}
async function rejectTech(id) {
  if (!confirm('Reject and remove this technician?')) return;
  const { error } = await db.from('technicians').delete().eq('id',id);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Technician rejected'); loadAll();
}
async function resolveInfraction(id) {
  const { error } = await db.from('infractions').update({resolved:true}).eq('id',id);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Infraction resolved'); loadInfractions();
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) {
  if (id) document.getElementById(id)?.classList.remove('open');
  else document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('open'));
}

// ── MAP ───────────────────────────────────────────────────────
function initMap() {
  const container = document.getElementById('panel-map');
  if (!container) return;
  const mapDiv = container.querySelector('#mapbox-map') || container.querySelector('.map-container');
  if (!mapDiv) return;
  mapboxgl.accessToken = MAPBOX_TOKEN;
  try {
    mapInstance = new mapboxgl.Map({container:mapDiv,style:'mapbox://styles/mapbox/dark-v11',center:[-98.5795,39.8283],zoom:4});
    mapInstance.addControl(new mapboxgl.NavigationControl(),'top-right');
    mapInstance.on('load', plotMap);
  } catch(e) { console.warn('Map init failed:',e); }
}
function plotMap() {
  if (!mapInstance) return;
  allTechs.forEach(t=>{
    if (!t.lat||!t.lng) return;
    new mapboxgl.Marker({color:'#FF4F9F'}).setLngLat([t.lng,t.lat]).setPopup(new mapboxgl.Popup().setText(tName(t))).addTo(mapInstance);
  });
}

// ── HELPERS ───────────────────────────────────────────────────
function tName(t) { if(!t) return ''; return t.full_name||t.name||t.email||''; }
function tInits(t) { const n=tName(t); if(!n) return '?'; return n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function calcHrs(ci,co) { if(!ci||!co) return null; const ms=new Date(co)-new Date(ci); if(isNaN(ms)||ms<0) return null; return ms/3600000; }
function fmtDate(d) { if(!d) return '–'; const dt=new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function esc(str) { if(str==null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function empty(msg) { return `<div style="text-align:center;opacity:.35;padding:40px 20px;font-size:13px;">${msg}</div>`; }
function s(id,html) { const el=document.getElementById(id); if(el) el.innerHTML=html; }
function v(id) { const el=document.getElementById(id); return el?el.value.trim():''; }
function showToast(msg,type) {
  const el=document.getElementById('toast'); if(!el) return;
  el.textContent=msg;
  el.className='toast-show'+(type==='error'?' toast-error':'');
  clearTimeout(el._t); el._t=setTimeout(()=>{ el.className=''; },3200);
}
