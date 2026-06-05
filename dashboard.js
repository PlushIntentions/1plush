/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
const SUPABASE_URL  = "https://hytfyfaxewkxbqozcyie.supabase.co";
const SUPABASE_KEY  = "sb_publishable_GoM0st4BrDFmInlOJQt5g3_bny1Nzrw";
const MAPBOX_TOKEN  = "pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg";

let sb, map;
let allJobs = [], allTechs = [], allClients = [];
let techMarkers = {}, jobMarkers = [];
let assigningJobId = null;
let currentPanel = "map";

/* ─── INIT ─────────────────────────────── */
window.addEventListener("load", async () => {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  feather.replace();
  startClock();
  initMap();
  initSidebar();
  await loadAll();
  subscribeRealtime();
  setTimeout(() => {
    const l = document.getElementById("loader");
    l.style.opacity = "0";
    setTimeout(() => l.style.display = "none", 500);
  }, 1600);
});

/* ─── SIDEBAR (mobile) ─────────────────── */
function initSidebar() {
  const sidebar   = document.getElementById("sidebar");
  const overlay   = document.getElementById("sidebar-overlay");
  const hamburger = document.getElementById("btn-hamburger");
  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("open");
  });
  overlay.addEventListener("click", closeSidebar);
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}

/* ─── CLOCK ────────────────────────────── */
function startClock() {
  const el = document.getElementById("clock");
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  };
  tick(); setInterval(tick, 1000);
}

/* ─── MAP ──────────────────────────────── */
function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({ container:"map", style:"mapbox://styles/mapbox/dark-v11", center:[-84.56,39.1], zoom:11 });
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
  map.on("load", () => map.resize());
}

/* ─── LOAD DATA ────────────────────────── */
async function loadAll() {
  const [jobsRes, techsRes, clientsRes] = await Promise.all([
    sb.from("jobs").select(`
      id, title, description, status, priority,
      technician_id, scheduled_date, scheduled_time,
      start_time, completed_time, notes, created_at,
      clients ( id, name, address, phone, city, lat, lng )
    `).order("created_at", { ascending: false }),
    sb.from("technicians").select("*").order("name"),
    sb.from("clients").select("*").order("name")
  ]);
  allJobs    = jobsRes.data    || [];
  allTechs   = techsRes.data   || [];
  allClients = clientsRes.data || [];
  updateStats(); renderAllJobs(); renderPendingJobs();
  renderTechs(); renderClients(); renderCompleted(); plotMap();
}

/* ─── STATS ────────────────────────────── */
function updateStats() {
  document.getElementById("stat-jobs").textContent    = allJobs.length;
  document.getElementById("stat-active").textContent  = allJobs.filter(j => j.status === "active").length;
  document.getElementById("stat-pending").textContent = allJobs.filter(j => j.status === "pending").length;
  document.getElementById("stat-techs").textContent   = allTechs.filter(t => t.status === "active").length;
}

/* ─── RENDER JOBS ──────────────────────── */
function renderAllJobs() {
  const el = document.getElementById("list-jobs");
  document.getElementById("badge-jobs").textContent = allJobs.length;
  el.innerHTML = "";
  if (!allJobs.length) { el.innerHTML = emptyState("briefcase","No jobs yet"); return; }
  allJobs.forEach(job => el.appendChild(buildJobCard(job)));
  feather.replace();
}
function renderPendingJobs() {
  const pending = allJobs.filter(j => j.status === "pending");
  const el = document.getElementById("list-pending");
  document.getElementById("badge-pending").textContent = pending.length;
  el.innerHTML = "";
  if (!pending.length) { el.innerHTML = emptyState("clock","No pending jobs"); return; }
  pending.forEach(job => el.appendChild(buildJobCard(job, true)));
  feather.replace();
}
function renderCompleted() {
  const done = allJobs.filter(j => j.status === "completed");
  const el = document.getElementById("list-completed");
  document.getElementById("badge-completed").textContent = done.length;
  el.innerHTML = "";
  if (!done.length) { el.innerHTML = emptyState("check-circle","No completed jobs"); return; }
  done.forEach(job => el.appendChild(buildJobCard(job)));
  feather.replace();
}

/* ─── BUILD JOB CARD ───────────────────── */
function buildJobCard(job) {
  const div = document.createElement("div");
  div.className = "data-card";
  const tech = allTechs.find(t => t.user_id === job.technician_id);
  const techName = tech ? tech.name : "Unassigned";
  const prioClass = { urgent:"prio-urgent", high:"prio-high", normal:"prio-normal", low:"prio-low" }[job.priority] || "prio-normal";
  const statusPill = {
    pending:   `<span class="pill pill-pending">● Pending</span>`,
    active:    `<span class="pill pill-active">● Active</span>`,
    completed: `<span class="pill pill-completed">✓ Completed</span>`,
    cancelled: `<span class="pill pill-cancelled">✕ Cancelled</span>`
  }[job.status] || "";
  const assignBtn = (job.status === "pending" || !job.technician_id)
    ? `<button class="btn-sm btn-assign" onclick="openAssign('${job.id}','${(job.title||"").replace(/'/g,"\\'")}')"><i data-feather="user-plus"></i> Assign</button>` : "";
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
    </div>
    <div class="card-actions">
      ${assignBtn}
      ${job.clients?.address ? `<button class="btn-sm btn-neutral" onclick="window.open('https://maps.google.com/?q=${encodeURIComponent(job.clients.address)}','_blank')"><i data-feather="map-pin"></i> Map</button>` : ""}
    </div>`;
  return div;
}

/* ─── RENDER TECHS ─────────────────────── */
function renderTechs() {
  const el = document.getElementById("list-techs");
  document.getElementById("badge-techs").textContent = allTechs.length;
  el.innerHTML = "";
  if (!allTechs.length) { el.innerHTML = emptyState("users","No technicians yet"); return; }
  allTechs.forEach(tech => {
    const jobCount = allJobs.filter(j => j.technician_id === tech.user_id && j.status === "active").length;
    const isLive   = tech.last_seen && (Date.now() - new Date(tech.last_seen).getTime()) < 300000;
    const statusPill = { active:`<span class="pill pill-aactive">● Active</span>`, pending_review:`<span class="pill pill-pr">⏳ Pending Review</span>`, inactive:`<span class="pill pill-inactive">○ Inactive</span>`, suspended:`<span class="pill pill-cancelled">✕ Suspended</span>` }[tech.status] || "";
    const skills = (tech.skills || []).slice(0,3).map(s => `<span class="skill-tag">${s}</span>`).join("");
    const card = document.createElement("div");
    card.className = "tech-card";
    card.innerHTML = `
      <div class="tech-avatar">${(tech.name||"?").charAt(0).toUpperCase()}</div>
      <div class="tech-info">
        <h3>${tech.name}</h3>
        <div style="margin-bottom:5px">${statusPill}</div>
        <div class="tech-meta">${tech.email||""} ${tech.phone ? "· "+tech.phone : ""}</div>
        <div class="tech-meta">${tech.city||""} ${tech.availability ? "· "+cap(tech.availability) : ""}</div>
        <div class="tech-skills">${skills}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">${jobCount} active job${jobCount!==1?"s":""}</div>
        <div class="tech-gps"><div class="tech-gps-dot ${isLive?"live":""}"></div>${isLive?"GPS Live":tech.last_seen?"Last seen "+timeAgo(tech.last_seen):"No GPS data"}</div>
        ${tech.status==="pending_review"?`<button class="btn-sm btn-approve" style="margin-top:8px" onclick="approveTech('${tech.user_id}')"><i data-feather="check"></i> Approve</button>`:""}
      </div>`;
    el.appendChild(card);
  });
  feather.replace();
}

/* ─── RENDER CLIENTS ───────────────────── */
function renderClients() {
  const tbody = document.getElementById("clients-tbody");
  document.getElementById("badge-clients").textContent = allClients.length;
  tbody.innerHTML = "";
  if (!allClients.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;opacity:.4">No clients yet</td></tr>`; return; }
  allClients.forEach(c => {
    const jobCount = allJobs.filter(j => j.client_id === c.id).length;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${c.name}</strong></td><td style="opacity:.7">${c.email||"—"}</td><td style="opacity:.7">${c.phone||"—"}</td><td style="opacity:.7">${c.city||"—"}</td><td><span class="count-badge">${jobCount}</span></td>`;
    tbody.appendChild(tr);
  });
}

/* ─── PLOT MAP ─────────────────────────── */
function plotMap() {
  if (!map) return;
  Object.values(techMarkers).forEach(m => m.remove());
  jobMarkers.forEach(m => m.remove());
  techMarkers = {}; jobMarkers = [];
  allTechs.filter(t => t.lat && t.lng).forEach(tech => {
    const el = document.createElement("div"); el.className = "m-tech"; el.title = tech.name;
    const popup = new mapboxgl.Popup({offset:14}).setHTML(`<div style="color:#111;font-family:Inter,sans-serif"><strong>${tech.name}</strong><br/><span style="color:#666;font-size:12px">${tech.city||""}</span><br/><span style="color:#888;font-size:11px">${tech.status}</span></div>`);
    techMarkers[tech.user_id] = new mapboxgl.Marker(el).setLngLat([tech.lng,tech.lat]).setPopup(popup).addTo(map);
  });
  allJobs.filter(j => j.clients?.lat && j.clients?.lng && j.status !== "completed").forEach(job => {
    const el = document.createElement("div"); el.className = `m-job ${job.status==="active"?"active":""}`; el.title = job.title;
    const popup = new mapboxgl.Popup({offset:12}).setHTML(`<div style="color:#111;font-family:Inter,sans-serif"><strong>${job.title}</strong><br/>
