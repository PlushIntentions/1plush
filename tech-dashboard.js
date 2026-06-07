/* ============================================================
   tech-dashboard.js — Plush Intentions Technician Dashboard
   ============================================================ */

let sb;                 // Supabase client
let map;                // Mapbox map instance
let jobMarkers = [];    // Map markers
let currentUser = null; // Supabase auth user
let techRecord = null;  // Technician record
let currentJobForSignout = null;
let currentJobForFiles = null;

/* ─────────────────────────────────────────
   SUPABASE INIT
───────────────────────────────────────── */
function initSupabase() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ─────────────────────────────────────────
   LOGIN
───────────────────────────────────────── */
async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();

  if (!email || !password) {
    showToast("Please enter email and password.");
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    showToast("Login failed. Check your credentials.");
    return;
  }

  currentUser = data.user;
  await bootApp();
}

/* ─────────────────────────────────────────
   BOOT APP (GATING LOGIC)
───────────────────────────────────────── */
async function bootApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-panel").classList.remove("hidden");

  const { data, error } = await sb
    .from("technicians")
    .select("*")
    .eq("user_id", currentUser.id)
    .single();

  if (error || !data) {
    showToast("Technician record not found.");
    return;
  }

  techRecord = data;

  if (techRecord.status === "pending_documents") {
    showOnboardingPanel();
    return;
  }

  if (techRecord.status === "pending_approval") {
    showApprovalPanel();
    return;
  }

  await initMap();
  await loadJobs();
  renderProfile();
  showPanel("map-panel");
}

/* ─────────────────────────────────────────
   ONBOARDING PANEL
───────────────────────────────────────── */
function showOnboardingPanel() {
  hideAllPanels();
  document.getElementById("onboarding-panel").classList.remove("hidden");
}

async function uploadAllDocuments() {
  const msa = document.getElementById("doc-msa").files[0];
  const nda = document.getElementById("doc-nda").files[0];
  const w9 = document.getElementById("doc-w9").files[0];
  const idFile = document.getElementById("doc-id").files[0];

  if (!msa || !nda || !w9 || !idFile) {
    showToast("Please upload all required documents.");
    return;
  }

  const folder = `tech_docs/${currentUser.id}`;

  const uploads = [
    sb.storage.from("tech_docs").upload(`${folder}/msa_${msa.name}`, msa, { upsert: true }),
    sb.storage.from("tech_docs").upload(`${folder}/nda_${nda.name}`, nda, { upsert: true }),
    sb.storage.from("tech_docs").upload(`${folder}/w9_${w9.name}`, w9, { upsert: true }),
    sb.storage.from("tech_docs").upload(`${folder}/id_${idFile.name}`, idFile, { upsert: true })
  ];

  const results = await Promise.all(uploads);
  if (results.some(r => r.error)) {
    showToast("Failed to upload one or more documents.");
    return;
  }

  await sb.from("technicians")
    .update({ status: "pending_approval" })
    .eq("id", techRecord.id);

  techRecord.status = "pending_approval";
  showApprovalPanel();
}

/* ─────────────────────────────────────────
   APPROVAL PANEL
───────────────────────────────────────── */
function showApprovalPanel() {
  hideAllPanels();
  document.getElementById("approval-panel").classList.remove("hidden");
}

/* ─────────────────────────────────────────
   MAP INIT
───────────────────────────────────────── */
async function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v11",
    center: [-81.6326, 38.3498],
    zoom: 11
  });

  map.addControl(new mapboxgl.NavigationControl(), "top-right");
}

/* ─────────────────────────────────────────
   LOAD JOBS
───────────────────────────────────────── */
async function loadJobs() {
  const { data: jobs, error } = await sb
    .from("jobs")
    .select(`
      *,
      clients (name, address, lat, lng)
    `)
    .eq("tech_id", techRecord.id)
    .order("start_time", { ascending: true });

  if (error) {
    showToast("Failed to load jobs.");
    return;
  }

  const active = jobs.filter(j => j.status !== "completed");
  const completed = jobs.filter(j => j.status === "completed");

  renderActiveJobs(active);
  renderCompletedJobs(completed);
  plotJobsOnMap(jobs);
}

/* ─────────────────────────────────────────
   RENDER ACTIVE JOBS
───────────────────────────────────────── */
function renderActiveJobs(jobs) {
  const el = document.getElementById("active-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = `<div class="empty-state"><p>No active jobs yet</p></div>`;
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    const checkedInBadge = job.check_in_time
      ? `<span class="status-pill status-checkedin">● Checked In — ${formatDate(job.check_in_time)}</span>`
      : "";

    const filesWarningBadge = shouldShowFilesWarning(job)
      ? `<span class="status-pill status-files-warning">● Files Not Downloaded</span>`
      : "";

    card.innerHTML = `
      <span class="status-pill status-active">Active</span>
      ${checkedInBadge}
      ${filesWarningBadge}
      <h3>${job.title || "Untitled Job"}</h3>

      <div class="job-meta">
        <div><strong>Client:</strong> ${job.clients?.name || "N/A"}</div>
        <div><strong>Address:</strong> ${job.clients?.address || "N/A"}</div>
        <div><strong>Start:</strong> ${formatDate(job.start_time)}</div>
        <div><strong>End:</strong> ${formatDate(job.end_time)}</div>
      </div>

      <div class="job-actions">
        <button class="btn-action btn-start" onclick="checkIn('${job.id}')">⏱ Check In</button>
        <button class="btn-action btn-complete" onclick="markComplete('${job.id}')">✓ Mark Complete</button>
        <button class="btn-action btn-files" onclick="openFilesPanel('${job.id}')">📄 Download Files</button>
        <button class="btn-action btn-map" onclick="openDirections('${encodeURIComponent(job.clients.address)}')">🗺 Directions</button>
      </div>
    `;

    el.appendChild(card);

    checkFileReminder(job);
  });
}

/* ─────────────────────────────────────────
   RENDER COMPLETED JOBS
───────────────────────────────────────── */
function renderCompletedJobs(jobs) {
  const el = document.getElementById("completed-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = `<div class="empty-state"><p>No completed jobs yet</p></div>`;
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    const checkedInBadge = job.check_in_time
      ? `<span class="status-pill status-checkedin">● Checked In — ${formatDate(job.check_in_time)}</span>`
      : "";

    card.innerHTML = `
      <span class="status-pill status-completed">✓ Completed</span>
      ${checkedInBadge}
      <h3>${job.title}</h3>

      <div class="job-meta">
        <div><strong>Client:</strong> ${job.clients?.name}</div>
        <div><strong>Address:</strong> ${job.clients?.address}</div>
        <div><strong>Completed:</strong> ${formatDate(job.completed_time)}</div>
      </div>
    `;

    el.appendChild(card);
  });
}

/* ─────────────────────────────────────────
   MAP MARKERS
───────────────────────────────────────── */
function plotJobsOnMap(jobs) {
  jobMarkers.forEach(m => m.remove());
  jobMarkers = [];

  jobs.forEach(job => {
    if (!job.clients?.lat || !job.clients?.lng) return;

    const el = document.createElement("div");
    el.className = "job-marker";

    const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(`
      <strong>${job.title}</strong><br/>
      ${job.clients.name}<br/>
      ${job.clients.address}
    `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([job.clients.lng, job.clients.lat])
      .setPopup(popup)
      .addTo(map);

    jobMarkers.push(marker);
  });
}

/* ─────────────────────────────────────────
   LOCATION CHECK
───────────────────────────────────────── */
function isWithinOneMile(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = x => x * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math
