/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
const SUPABASE_URL  = "https://iazvpykfdckpffhakncd.supabase.co";
const SUPABASE_KEY  = "sb_publishable_FuojaGp1LlAwV0yxEl8DFA_RbT3FLRe";
const MAPBOX_TOKEN  = "pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg";

let sb, map, currentUser;
let allJobs = [], allTechs = [], allClients = [], allInfractions = [];
let techMarkers = {}, jobMarkers = [];
let assigningJobId = null;
let currentPanel = "map";
let selectedPrio = "normal";
let woFilterState = "all";
let userFilterState = "all";
let allAuthUsers = [];

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
window.addEventListener("load", async () => {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  feather.replace();
  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; bootDashboard(); }
  else { showAuth(); }
  sb.auth.onAuthStateChange((_event, session) => {
    if (session && !currentUser) { currentUser = session.user; bootDashboard(); }
    else if (!session && currentUser) { currentUser = null; showAuth(); }
  });
});

/* ─────────────────────────────────────────
   AUTH
───────────────────────────────────────── */
function showAuth() {
  document.getElementById("loader").style.opacity = "0";
  setTimeout(() => document.getElementById("loader").style.display = "none", 500);
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("dashboard-wrap").style.display = "none";
  feather.replace();
}

async function signIn() {
  const email    = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errEl    = document.getElementById("auth-error");
  errEl.style.display = "none";
  if (!email || !password) { errEl.textContent = "Please enter your email and password."; errEl.style.display = "block"; return; }
  const btn = document.getElementById("auth-btn");
  btn.disabled = true;
  btn.innerHTML = `<i data-feather="loader"></i> Signing in…`;
  feather.replace();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message || "Sign in failed.";
    errEl.style.display = "block";
    btn.disabled = false;
    btn.innerHTML = `<i data-feather="log-in"></i> Sign In`;
    feather.replace(); return;
  }
  currentUser = data.user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("dashboard-wrap").style.display = "block";
  bootDashboard();
}

async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  allJobs = []; allTechs = []; allClients = []; allInfractions = [];
  showAuth();
}

function bootDashboard() {
  if (currentUser) {
    const el = document.getElementById("signed-in-email");
    if (el) el.textContent = currentUser.email;
  }
  startClock();
  initMap();
  loadAll().then(() => {
    subscribeRealtime();
    setTimeout(() => {
      const l = document.getElementById("loader");
      if (l) { l.style.opacity = "0"; setTimeout(() => l.style.display = "none", 500); }
    }, 1200);
  });
}

/* ─────────────────────────────────────────
   CLOCK
───────────────────────────────────────── */
function startClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const tick = () => { el.textContent = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
  tick(); setInterval(tick, 1000);
}

/* ─────────────────────────────────────────
   MAP
───────────────────────────────────────── */
function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({ container: "map", style: "mapbox://styles/mapbox/dark-v11", center: [-84.56, 39.1], zoom: 11 });
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
  map.on("load", () => map.resize());
}

/* ─────────────────────────────────────────
   LOAD ALL
───────────────────────────────────────── */
async function loadAll() {
  const [jobsRes, techsRes, clientsRes, infractionsRes] = await Promise.all([
    sb.from("jobs").select(`id, title, description, status, priority, technician_id, scheduled_date, scheduled_time, start_time, completed_time, check_in_time, check_out_time, job_rate, notes, created_at, clients ( id, name, address, phone, city, lat, lng )`).order("created_at", { ascending: false }),
    sb.from("technicians").select("*").order("name"),
    sb.from("clients").select("*").order("name"),
    sb.from("infractions").select("*, technicians(name)").order("created_at", { ascending: false })
  ]);
  allJobs        = jobsRes.data        || [];
  allTechs       = techsRes.data       || [];
  allClients     = clientsRes.data     || [];
  allInfractions = infractionsRes.data || [];
  updateStats(); renderAllJobs(); renderPendingJobs(); renderTechs();
  renderClients(); renderCompleted(); renderApprovals();
  renderWorkOrders(); renderInfractions(); renderEarnings();
  plotMap(); updateNavBadges();
}

/* ─────────────────────────────────────────
   STATS
───────────────────────────────────────── */
function updateStats() {
  document.getElementById("stat-jobs").textContent    = allJobs.length;
  document.getElementById("stat-active").textContent  = allJobs.filter(j => j.status === "active").length;
  document.getElementById("stat-pending").textContent = allJobs.filter(j => j.status === "pending").length;
  document.getElementById("stat-techs").textContent   = allTechs.filter(t => t.status === "active").length;
  ["ms-jobs","ms-active","ms-pending","ms-techs"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = [allJobs.length, allJobs.filter(j=>j.status==="active").length, allJobs.filter(j=>j.status==="pending").length, allTechs.filter(t=>t.status==="active").length][i];
  });
}

function updateNavBadges() {
  const pendingReview = allTechs.filter(t => t.status === "pending_review").length;
  const openInfr      = allInfractions.filter(i => i.status === "open").length;
  const ab = document.getElementById("badge-approvals");
  if (ab) { ab.textContent = pendingReview; ab.style.display = pendingReview > 0 ? "inline-flex" : "none"; }
  const ib = document.getElementById("badge-infractions");
  if (ib) { ib.textContent = openInfr; ib.style.display = openInfr > 0 ? "inline-flex" : "none"; }
}

/* ─────────────────────────────────────────
   RENDER JOBS
───────────────────────────────────────── */
function renderAllJobs() {
  const el = document.getElementById("list-jobs");
  const badge = document.getElementById("badge-jobs");
  if (badge) badge.textContent = allJobs.length;
  el.innerHTML = "";
  if (!allJobs.length) { el.innerHTML = emptyState("briefcase","No jobs yet"); return; }
  allJobs.forEach(job => el.appendChild(buildJobCard(job)));
  feather.replace();
}

function renderPendingJobs() {
  const pending = allJobs.filter(j => j.status === "pending");
  const el = document.getElementById("list-pending");
  const badge = document.getElementById("badge-pending");
  if (badge) badge.textContent = pending.length;
  el.innerHTML = "";
  if (!pending.length) { el.innerHTML = emptyState("clock","No pending jobs"); return; }
  pending.forEach(job => el.appendChild(buildJobCard(job, true)));
  feather.replace();
}

function renderCompleted() {
  const done = allJobs.filter(j => j.status === "completed");
  const el = document.getElementById("list-completed");
  const badge = document.getElementById("badge-completed");
  if (badge) badge.textContent = done.length;
  el.innerHTML = "";
  if (!done.length) { el.innerHTML = emptyState("check-circle","No completed jobs"); return; }
  done.forEach(job => el.appendChild(buildJobCard(job)));
  feather.replace();
}

/* ─────────────────────────────────────────
   BUILD JOB CARD
───────────────────────────────────────── */
function buildJobCard(job) {
  const div = document.createElement("div");
  div.className = "data-card";
  const tech = allTechs.find(t => t.user_id === job.technician_id);
  const techName = tech ? tech.name : "Unassigned";
  const prioClass = { urgent:"prio-urgent", high:"prio-high", normal:"prio-normal", low:"prio-low" }[job.priority] || "prio-normal";
  const statusPill = { pending:`<span class="pill pill-pending">● Pending</span>`, active:`<span class="pill pill-active">● Active</span>`, completed:`<span class="pill pill-completed">✓ Completed</span>`, cancelled:`<span class="pill pill-cancelled">✕ Cancelled</span>` }[job.status] || "";
  const assignBtn = (job.status === "pending" || !job.technician_id)
    ? `<button class="btn-sm btn-assign" onclick="openAssign('${job.id}','${(job.title||"").replace(/'/g,"\\'")}')"><i data-feather="user-plus"></i> Assign</button>` : "";
  let checkInfo = "";
  if (job.check_in_time) {
    const hours = job.check_out_time ? calcHours(job.check_in_time, job.check_out_time).toFixed(2) + "h" : "In progress";
    checkInfo = `<div class="meta-item"><div class="mlabel">Check-In</div><div class="mval">${fmtDateTime(job.check_in_time)}</div></div><div class="meta-item"><div class="mlabel">Duration</div><div class="mval">${hours}</div></div>`;
  }
  div.innerHTML = `
    ${statusPill}
    <h3>${job.title || "Untitled Job"}</h3>
    <div class="meta-grid">
      <div class="meta-item"><div class="mlabel">Client</div><div class="mval">${job.clients?.name || "—"}</div></div>
      <div class="meta-item"><div class="mlabel">Technician</div><div class="mval">${techName}</div></div>
      <div class="meta-item"><div class="mlabel">Priority</div><div class="mval prio"><span class="prio-dot ${prioClass}"></span>${cap(job.priority)}</div></div>
      <div class="meta-item"><div class="mlabel">Scheduled</div><div class="mval">${job.scheduled_date ? fmtDate(job.scheduled_date) : "—"}</div></div>
      <div class="meta-item"><div class="mlabel">Address</div><div class="mval" style="font-size:11px">${job.clients?.address || "—"}</div></div>
      <div class="meta-item"><div class="mlabel">${job.status === "completed" ? "Completed" : "Started"}</div><div class="mval">${job.completed_time ? fmtDateTime(job.completed_time) : job.start_time ? fmtDateTime(job.start_time) : "—"}</div></div>
      ${checkInfo}
      ${job.job_rate ? `<div class="meta-item"><div class="mlabel">Job Rate</div><div class="mval" style="color:#4ade80">$${parseFloat(job.job_rate).toFixed(2)}</div></div>` : ""}
    </div>
    <div class="card-actions">
      ${assignBtn}
      ${job.clients?.address ? `<button class="btn-sm btn-neutral" onclick="window.open('https://maps.google.com/?q=${encodeURIComponent(job.clients.address)}','_blank')"><i data-feather="map-pin"></i> Map</button>` : ""}
    </div>`;
  return div;
}

/* ─────────────────────────────────────────
   RENDER TECHNICIANS
───────────────────────────────────────── */
function renderTechs() {
  const el = document.getElementById("list-techs");
  const badge = document.getElementById("badge-techs");
  if (badge) badge.textContent = allTechs.length;
  el.innerHTML = "";
  if (!allTechs.length) { el.innerHTML = emptyState("users","No technicians yet"); return; }
  allTechs.forEach(tech => {
    const jobCount = allJobs.filter(j => j.technician_id === tech.user_id && j.status === "active").length;
    const isLive   = tech.last_seen && (Date.now() - new Date(tech.last_seen).getTime()) < 300000;
    const statusPill = { active:`<span class="pill pill-aactive">● Active</span>`, pending_review:`<span class="pill pill-pr">⏳ Pending Review</span>`, inactive:`<span class="pill pill-inactive">○ Inactive</span>`, suspended:`<span class="pill pill-cancelled">✕ Suspended</span>` }[tech.status] || "";
    const skills = (tech.skills || []).slice(0, 3).map(s => `<span class="skill-tag">${s}</span>`).join("");
    const card = document.createElement("div");
    card.className = "tech-card";
    card.innerHTML = `
      <div class="tech-avatar">${(tech.name || "?").charAt(0).toUpperCase()}</div>
      <div class="tech-info">
        <h3>${tech.name}</h3>
        <div style="margin-bottom:5px">${statusPill}</div>
        <div class="tech-meta">${tech.email || ""} ${tech.phone ? "· " + tech.phone : ""}</div>
        <div class="tech-meta">${tech.city || ""} ${tech.availability ? "· " + cap(tech.availability) : ""}</div>
        <div class="tech-skills">${skills}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">${jobCount} active job${jobCount!==1?"s":""}</div>
        <div class="tech-gps"><div class="tech-gps-dot ${isLive?"live":""}"></div>${isLive?"GPS Live":tech.last_seen?"Last seen "+timeAgo(tech.last_seen):"No GPS data"}</div>
        ${tech.status==="pending_review"?`<button class="btn-sm btn-approve" style="margin-top:8px" onclick="approveTech('${tech.user_id}')"><i data-feather="check"></i> Approve</button>`:""}
        <button class="btn-sm btn-neutral" style="margin-top:6px" onclick="openResetPwModal('${tech.user_id}','${(tech.name||"").replace(/'/g,"\\'")}')"><i data-feather="key"></i> Reset PW</button>
      </div>`;
    el.appendChild(card);
  });
  feather.replace();
}

/* ─────────────────────────────────────────
   RENDER CLIENTS
───────────────────────────────────────── */
function renderClients() {
  const tbody = document.getElementById("clients-tbody");
  const badge = document.getElementById("badge-clients");
  if (badge) badge.textContent = allClients.length;
  tbody.innerHTML = "";
  if (!allClients.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;opacity:.4">No clients yet</td></tr>`; return; }
  allClients.forEach(c => {
    const jobCount = allJobs.filter(j => j.client_id === c.id).length;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${c.name}</strong></td><td style="opacity:.7">${c.email||"—"}</td><td style="opacity:.7">${c.phone||"—"}</td><td style="opacity:.7">${c.city||"—"}</td><td><span class="count-badge" style="font-size:11px">${jobCount}</span></td>`;
    tbody.appendChild(tr);
  });
}

/* ─────────────────────────────────────────
   RENDER APPROVALS
───────────────────────────────────────── */
function renderApprovals() {
  const el = document.getElementById("list-approvals");
  if (!el) return;
  el.innerHTML = "";
  const pending = allTechs.filter(t => t.status === "pending_review");
  if (!pending.length) { el.innerHTML = emptyState("check-circle","No pending approvals"); feather.replace(); return; }
  pending.forEach(tech => {
    const card = document.createElement("div");
    card.className = "tech-card";
    card.innerHTML = `
      <div class="tech-avatar">${(tech.name||"?").charAt(0).toUpperCase()}</div>
      <div class="tech-info">
        <h3>${tech.name}</h3>
        <div class="tech-meta">${tech.email||""}</div>
        <div class="tech-meta">${tech.city||""} ${tech.phone?"· "+tech.phone:""}</div>
        <div class="tech-skills">${(tech.skills||[]).map(s=>`<span class="skill-tag">${s}</span>`).join("")}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
        <button class="btn-sm btn-approve" onclick="approveTech('${tech.user_id}')"><i data-feather="check"></i> Approve</button>
        <button class="btn-sm btn-danger"  onclick="rejectTech('${tech.user_id}')"><i data-feather="x"></i> Reject</button>
      </div>`;
    el.appendChild(card);
  });
  feather.replace();
}

/* ─────────────────────────────────────────
   RENDER WORK ORDERS
───────────────────────────────────────── */
function renderWorkOrders(filter) {
  if (filter !== undefined) woFilterState = filter;
  const el = document.getElementById("list-workorders");
  if (!el) return;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === woFilterState));
  el.innerHTML = "";
  let jobs = woFilterState !== "all" ? allJobs.filter(j => j.status === woFilterState) : allJobs;
  if (!jobs.length) { el.innerHTML = emptyState("file-text","No work orders found"); feather.replace(); return; }
  jobs.forEach(job => el.appendChild(buildJobCard(job)));
  feather.replace();
}

/* ─────────────────────────────────────────
   RENDER INFRACTIONS
───────────────────────────────────────── */
function renderInfractions() {
  const el = document.getElementById("list-infractions");
  if (!el) return;
  el.innerHTML = "";
  if (!allInfractions.length) { el.innerHTML = emptyState("alert-triangle","No infraction reports found"); feather.replace(); return; }
  allInfractions.forEach(inf => {
    const sevClass = { high:"pill-cancelled", medium:"pill-pending", low:"pill-completed" }[inf.severity] || "pill-inactive";
    const card = document.createElement("div");
    card.className = "data-card";
    card.innerHTML = `
      <span class="pill ${sevClass}">${cap(inf.severity)} Severity</span>
      <h3>${inf.technicians?.name || "Unknown Tech"}</h3>
      <div class="meta-grid">
        <div class="meta-item"><div class="mlabel">Reported By</div><div class="mval">${inf.reported_by||"—"}</div></div>
        <div class="meta-item"><div class="mlabel">Status</div><div class="mval">${cap(inf.status)}</div></div>
        <div class="meta-item" style="grid-column:1/-1"><div class="mlabel">Description</div><div class="mval">${inf.description||"—"}</div></div>
        <div class="meta-item"><div class="mlabel">Date</div><div class="mval">${fmtDate(inf.created_at)}</div></div>
      </div>
      <div class="card-actions">
        ${inf.status==="open"?`<button class="btn-sm btn-approve" onclick="resolveInfraction('${inf.id}')"><i data-feather="check"></i> Mark Resolved</button>`:`<span style="font-size:12px;opacity:.5">✓ Resolved</span>`}
      </div>`;
    el.appendChild(card);
  });
  feather.replace();
}

/* ─────────────────────────────────────────
   RENDER EARNINGS
───────────────────────────────────────── */
function renderEarnings() {
  const el = document.getElementById("list-earnings");
  if (!el) return;
  el.innerHTML = "";
  const completed = allJobs.filter(j => j.status === "completed");
  let totalEarnings = 0, totalHours = 0;
  const techMap = {};
  completed.forEach(job => {
    const rate  = parseFloat(job.job_rate) || 0;
    const hours = (job.check_in_time && job.check_out_time) ? calcHours(job.check_in_time, job.check_out_time) : 0;
    totalEarnings += rate; totalHours += hours;
    if (job.technician_id) {
      if (!techMap[job.technician_id]) techMap[job.technician_id] = { earnings:0, hours:0, jobs:0 };
      techMap[job.technician_id].earnings += rate;
      techMap[job.technician_id].hours    += hours;
      techMap[job.technician_id].jobs++;
    }
  });
  const earnEl  = document.getElementById("earn-total");
  const hoursEl = document.getElementById("earn-hours");
  const jobsEl  = document.getElementById("earn-jobs");
  if (earnEl)  earnEl.textContent  = "$" + totalEarnings.toFixed(2);
  if (hoursEl) hoursEl.textContent = totalHours.toFixed(1) + "h";
  if (jobsEl)  jobsEl.textContent  = completed.length;
  if (!completed.length) { el.innerHTML = emptyState("dollar-sign","No earnings from completed jobs yet"); feather.replace(); return; }
  const header = document.createElement("div"); header.className = "sec-header"; header.innerHTML = `<h2>By Technician</h2>`; el.appendChild(header);
  Object.entries(techMap).forEach(([tid, data]) => {
    const tech = allTechs.find(t => t.user_id === tid);
    const name = tech ? tech.name : "Unknown";
    const card = document.createElement("div"); card.className = "data-card";
    card.innerHTML = `<div style="display:flex;align-items:center;gap:14px"><div class="tech-avatar" style="width:38px;height:38px;font-size:15px">${name.charAt(0).toUpperCase()}</div><div style="flex:1"><div style="font-size:15px;font-weight:700">${name}</div><div style="font-size:12px;opacity:.5">${data.jobs} completed job${data.jobs!==1?"s":""}</div></div><div style="text-align:right"><div style="font-size:20px;font-weight:800;color:#4ade80">$${data.earnings.toFixed(2)}</div><div style="font-size:12px;opacity:.55">${data.hours.toFixed(1)}h worked</div></div></div>`;
    el.appendChild(card);
  });
  const jh = document.createElement("div"); jh.className = "sec-header"; jh.style.marginTop = "24px"; jh.innerHTML = `<h2>Completed Work Orders</h2>`; el.appendChild(jh);
  const grid = document.createElement("div"); grid.className = "card-grid";
  completed.forEach(job => {
    const tech  = allTechs.find(t => t.user_id ===
