const SUPABASE_URL  = "https://fytxyfaxewkxbqozcyie.supabase.co";
const SUPABASE_KEY  = "sb_publishable_GoM0st4BrDFmInlOJQZy4A_bny1Nzrw";
const MAPBOX_TOKEN  = "pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg";

let sb, map;
let allJobs = [], allTechs = [], allClients = [];
let techMarkers = {}, jobMarkers = [];
let assigningJobId = null;
let currentPanel = "map";

window.addEventListener("load", async () => {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  feather.replace();
  startClock();
  initMap();
  await loadAll();
  subscribeRealtime();
  setTimeout(() => {
    const l = document.getElementById("loader");
    l.style.opacity = "0";
    setTimeout(() => l.style.display = "none", 500);
  }, 1600);
});

function startClock() {
  const el = document.getElementById("clock");
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  };
  tick();
  setInterval(tick, 1000);
}

function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({ container:"map", style:"mapbox://styles/mapbox/dark-v11", center:[-84.56,39.1], zoom:11 });
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
  map.on("load", () => map.resize());
}

async function loadAll() {
  const [jobsRes, techsRes, clientsRes] = await Promise.all([
    sb.from("jobs").select(`id,title,description,status,priority,technician_id,scheduled_date,scheduled_time,start_time,completed_time,notes,created_at,clients(id,name,address,phone,city,lat,lng)`).order("created_at",{ascending:false}),
    sb.from("technicians").select("*").order("name"),
    sb.from("clients").select("*").order("name")
  ]);
  allJobs    = jobsRes.data    || [];
  allTechs   = techsRes.data   || [];
  allClients = clientsRes.data || [];
  updateStats(); renderAllJobs(); renderPendingJobs();
  renderTechs(); renderClients(); renderCompleted(); plotMap();
}

function updateStats() {
  document.getElementById("stat-jobs").textContent    = allJobs.length;
  document.getElementById("stat-active").textContent  = allJobs.filter(j=>j.status==="active").length;
  document.getElementById("stat-pending").textContent = allJobs.filter(j=>j.status==="pending").length;
  document.getElementById("stat-techs").textContent   = allTechs.filter(t=>t.status==="active").length;
}

function renderAllJobs() {
  const el = document.getElementById("list-jobs");
  document.getElementById("badge-jobs").textContent = allJobs.length;
  el.innerHTML = "";
  if (!allJobs.length) { el.innerHTML = emptyState("briefcase","No jobs yet"); return; }
  allJobs.forEach(job => el.appendChild(buildJobCard(job)));
  feather.replace();
}

function renderPendingJobs() {
  const pending = allJobs.filter(j=>j.status==="pending");
  const el = document.getElementById("list-pending");
  document.getElementById("badge-pending").textContent = pending.length;
  el.innerHTML = "";
  if (!pending.length) { el.innerHTML = emptyState("clock","No pending jobs"); return; }
  pending.forEach(job => el.appendChild(buildJobCard(job,true)));
  feather.replace();
}

function renderCompleted() {
  const done = allJobs.filter(j=>j.status==="completed");
  const el = document.getElementById("list-completed");
  document.getElementById("badge-completed").textContent = done.length;
  el.innerHTML = "";
  if (!done.length) { el.innerHTML = emptyState("check-circle","No completed jobs"); return; }
  done.forEach(job => el.appendChild(buildJobCard(job)));
  feather.replace();
}

function buildJobCard(job, showAssign=false) {
  const div = document.createElement("div");
  div.className = "data-card";
  const tech = allTechs.find(t=>t.user_id===job.technician_id);
  const techName = tech ? tech.name : "Unassigned";
  const prioClass = {urgent:"prio-urgent",high:"prio-high",normal:"prio-normal",low:"prio-low"}[job.priority]||"prio-normal";
  const statusPill = {
    pending:   `<span class="pill pill-pending">● Pending</span>`,
    active:    `<span class="pill pill-active">● Active</span>`,
    completed: `<span class="pill pill-completed">✓ Completed</span>`,
    cancelled: `<span class="pill pill-cancelled">✕ Cancelled</span>`
  }[job.status]||"";
  const assignBtn = (job.status==="pending"||!job.technician_id)
    ? `<button class="btn-sm btn-assign" onclick="openAssign('${job.id}','${(job.title||"").replace(/'/g,"\\'")}')"><i data-feather="user-plus"></i> Assign</button>` : "";
  div.innerHTML = `
    ${statusPill}
    <h3>${job.title||"Untitled Job"}</h3>
    <div class="meta-grid">
      <div class="meta-item"><div class="mlabel">Client</div><div class="mval">${job.clients?.name||"—"}</div></div>
      <div class="meta-item"><div class="mlabel">Technician</div><div class="mval">${techName}</div></div>
      <div class="meta-item"><div class="mlabel">Priority</div><div class="mval prio"><span class="prio-dot ${prioClass}"></span>${cap(job.priority)}</div></div>
      <div class="meta-item"><div class="mlabel">Scheduled</div><div class="mval">${job.scheduled_date?fmtDate(job.scheduled_date):"—"}</div></div>
      <div class="meta-item"><div class="mlabel">Address</div><div class="mval" style="font-size:11px">${job.clients?.address||"—"}</div></div>
      <div class="meta-item"><div class="mlabel">${job.status==="completed"?"Completed":"Started"}</div><div class="mval">${job.completed_time?fmtDateTime(job.completed_time):job.start_time?fmtDateTime(job.start_time):"—"}</div></div>
    </div>
    <div class="card-actions">
      ${assignBtn}
      ${job.clients?.address?`<button class="btn-sm btn-neutral" onclick="window.open('https://maps.google.com/?q=${encodeURIComponent(job.clients.address)}','_blank')"><i data-feather="map-pin"></i> Map</button>`:""}
    </div>`;
  return div;
}

function renderTechs() {
  const el = document.getElementById("list-techs");
  document.getElementById("badge-techs").textContent = allTechs.length;
  el.innerHTML = "";
  if (!allTechs.length) { el.innerHTML = emptyState("users","No technicians yet"); return; }
  allTechs.forEach(tech => {
    const jobCount = allJobs.filter(j=>j.technician_id===tech.user_id&&j.status==="active").length;
    const isLive   = tech.last_seen&&(Date.now()-new Date(tech.last_seen).getTime())<300000;
    const statusPill = {
      active:`<span class="pill pill-aactive">● Active</span>`,
      pending_review:`<span class="pill pill-pr">⏳ Pending Review</span>`,
      inactive:`<span class="pill pill-inactive">○ Inactive</span>`,
      suspended:`<span class="pill pill-cancelled">✕ Suspended</span>`
    }[tech.status]||"";
    const skills = (tech.skills||[]).slice(0,3).map(s=>`<span class="skill-tag">${s}</span>`).join("");
    const card = document.createElement("div");
    card.className = "tech-card";
    card.innerHTML = `
      <div class="tech-avatar">${(tech.name||"?").charAt(0).toUpperCase()}</div>
      <div class="tech-info">
        <h3>${tech.name}</h3>
        <div style="margin-bottom:5px">${statusPill}</div>
        <div class="tech-meta">${tech.email||""} ${tech.phone?"· "+tech.phone:""}</div>
        <div class="tech-meta">${tech.city||""} ${tech.availability?"· "+cap(tech.availability):""}</div>
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

function renderClients() {
  const tbody = document.getElementById("clients-tbody");
  document.getElementById("badge-clients").textContent = allClients.length;
  tbody.innerHTML = "";
  if (!allClients.length) { tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:32px;opacity:.4">No clients yet</td></tr>`; return; }
  allClients.forEach(c => {
    const jobCount = allJobs.filter(j=>j.client_id===c.id).length;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${c.name}</strong></td><td style="opacity:.7">${c.email||"—"}</td><td style="opacity:.7">${c.phone||"—"}</td><td style="opacity:.7">${c.city||"—"}</td><td><span class="count-badge" style="font-size:11px">${jobCount}</span></td>`;
    tbody.appendChild(tr);
  });
}

function plotMap() {
  if (!map) return;
  Object.values(techMarkers).forEach(m=>m.remove());
  jobMarkers.forEach(m=>m.remove());
  techMarkers={}; jobMarkers=[];
  allTechs.filter(t=>t.lat&&t.lng).forEach(tech=>{
    const el=document.createElement("div"); el.className="m-tech"; el.title=tech.name;
    const popup=new mapboxgl.Popup({offset:14}).setHTML(`<div style="color:#111;font-family:Inter,sans-serif"><strong>${tech.name}</strong><br/><span style="color:#666;font-size:12px">${tech.city||""}</span><br/><span style="color:#888;font-size:11px">${tech.status}</span></div>`);
    techMarkers[tech.user_id]=new mapboxgl.Marker(el).setLngLat([tech.lng,tech.lat]).setPopup(popup).addTo(map);
  });
  allJobs.filter(j=>j.clients?.lat&&j.clients?.lng&&j.status!=="completed").forEach(job=>{
    const el=document.createElement("div"); el.className=`m-job ${job.status==="active"?"active":""}`; el.title=job.title;
    const popup=new mapboxgl.Popup({offset:12}).setHTML(`<div style="color:#111;font-family:Inter,sans-serif"><strong>${job.title}</strong><br/><span style="color:#555;font-size:12px">${job.clients?.name}</span><br/><span style="color:#888;font-size:11px">${job.clients?.address||""}</span></div>`);
    const m=new mapboxgl.Marker(el).setLngLat([job.clients.lng,job.clients.lat]).setPopup(popup).addTo(map);
    jobMarkers.push(m);
  });
}

function subscribeRealtime() {
  sb.channel("admin-dash")
    .on("postgres_changes",{event:"*",schema:"public",table:"jobs"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"technicians"},()=>loadAll())
    .subscribe();
}

function openAssign(jobId,jobTitle) {
  assigningJobId=jobId;
  document.getElementById("modal-job-title").textContent=`Assigning: ${jobTitle}`;
  const sel=document.getElementById("modal-tech-select");
  sel.innerHTML=`<option value="">Choose technician…</option>`;
  allTechs.filter(t=>t.status==="active").forEach(t=>{
    const opt=document.createElement("option"); opt.value=t.user_id; opt.textContent=t.name; sel.appendChild(opt);
  });
  document.getElementById("assign-modal").classList.add("open");
}
function closeModal() { document.getElementById("assign-modal").classList.remove("open"); assigningJobId=null; }
async function confirmAssign() {
  const techId=document.getElementById("modal-tech-select").value;
  if (!techId) { showToast("⚠️ Please select a technician."); return; }
  const {error}=await sb.from("jobs").update({technician_id:techId,status:"active",start_time:new Date().toISOString()}).eq("id",assigningJobId);
  if (error) { showToast("❌ Failed to assign. Please try again."); return; }
  closeModal(); showToast("✅ Job assigned successfully!"); await loadAll();
}

async function approveTech(userId) {
  const {error}=await sb.from("technicians").update({status:"active"}).eq("user_id",userId);
  if (error) { showToast("❌ Failed to approve technician."); return; }
  showToast("✅ Technician approved!"); await loadAll();
}

const panelTitles = {
  map:["Live Map","Real-time technician locations and job pins"],
  jobs:["All Jobs","Full job history across all statuses"],
  pending:["Pending Jobs","Unassigned jobs waiting for a technician"],
  techs:["Technicians","All registered technician accounts"],
  clients:["Clients","Client contact and job history"],
  completed:["Completed Jobs","Successfully finished jobs"],
  newjob:["New Work Order","Create a job — posts instantly to the technician dashboard"]
};
function showPanel(id) {
  currentPanel=id;
  document.querySelectorAll(".panel,.panel-map").forEach(p=>p.classList.remove("active"));
  const target=document.getElementById(`panel-${id}`); if (target) target.classList.add("active");
  document.querySelectorAll(".nav-link").forEach(l=>{
    l.classList.remove("active");
    if (l.id==="nav-newjob") { l.style.background="rgba(255,79,159,0.14)"; l.style.border="1px solid rgba(255,79,159,0.3)"; }
  });
  const navEl=document.getElementById(`nav-${id}`);
  if (navEl) { navEl.classList.add("active"); if (id==="newjob") { navEl.style.background="rgba(255,79,159,0.28)"; navEl.style.border="1px solid rgba(255,79,159,0.55)"; } }
  const [title,sub]=panelTitles[id]||["Dashboard",""];
  document.getElementById("panel-title").textContent=title;
  document.getElementById("panel-subtitle").textContent=sub;
  if (id==="newjob") populateWorkOrderDropdowns();
  if (id==="map"&&map) setTimeout(()=>map.resize(),200);
}

function fmtDate(d) { return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
function fmtDateTime(d) { return new Date(d).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}); }
function cap(s) { return s?s.charAt(0).toUpperCase()+s.slice(1):"—"; }
function timeAgo(iso) {
  const diff=Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if (diff<1) return "just now"; if (diff<60) return `${diff}m ago`; return `${Math.floor(diff/60)}h ago`;
}
function emptyState(icon,msg) { return `<div class="empty"><i data-feather="${icon}"></i><p>${msg}</p></div>`; }
function showToast(msg) { const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),3200); }

let selectedPrio="normal";
function populateWorkOrderDropdowns() {
  const cSel=document.getElementById("wo-client-id");
  cSel.innerHTML=`<option value="">Choose client…</option>`;
  allClients.forEach(c=>{ const o=document.createElement("option"); o.value=c.id; o.textContent=`${c.name}${c.city?" – "+c.city:""}`; cSel.appendChild(o); });
  const tSel=document.getElementById("wo-tech-id");
  tSel.innerHTML=`<option value="">Leave unassigned (pending)</option>`;
  allTechs.filter(t=>t.status==="active").forEach(t=>{ const o=document.createElement("option"); o.value=t.user_id; o.textContent=t.name; tSel.appendChild(o); });
}
function selectPrio(prio) {
  selectedPrio=prio;
  document.querySelectorAll(".prio-btn").forEach(b=>{ const p=b.dataset.prio; b.className=`prio-btn${prio===p?" sel-"+p:""}`; });
}
function toggleNewClient(checked) {
  document.getElementById("existing-client-wrap").style.display=checked?"none":"block";
  document.getElementById("new-client-wrap").style.display=checked?"block":"none";
}
function fmtPhone(input) {
  let v=input.value.replace(/\D/g,"").substring(0,10);
  if (v.length>=7)      v=`(${v.slice(0,3)}) ${v.slice(3,6)}-${v.slice(6)}`;
  else if (v.length>=4) v=`(${v.slice(0,3)}) ${v.slice(3)}`;
  else if (v.length>0)  v=`(${v}`;
  input.value=v;
}
async function submitWorkOrder() {
  const btn=document.getElementById("wo-submit-btn");
  const errEl=document.getElementById("wo-error"); errEl.style.display="none";
  const title=document.getElementById("wo-title").value.trim();
  const date=document.getElementById("wo-date").value;
  const time=document.getElementById("wo-time").value;
  const desc=document.getElementById("wo-desc").value.trim();
  const notes=document.getElementById("wo-notes").value.trim();
  const techId=document.getElementById("wo-tech-id").value||null;
  const isNew=document.getElementById("new-client-toggle").checked;
  if (!title) { showWoError("Job title is required."); return; }
  btn.disabled=true; btn.innerHTML=`<i data-feather="loader"></i> Posting…`; feather.replace();
  let clientId=null;
  if (isNew) {
    const ncName=document.getElementById("nc-name").value.trim();
    if (!ncName) { showWoError("Client name is required."); resetBtn(); return; }
    const {data:newClient,error:ncErr}=await sb.from("clients").insert([{
      name:ncName, phone:document.getElementById("nc-phone").value.trim()||null,
      email:document.getElementById("nc-email").value.trim()||null,
      city:document.getElementById("nc-city").value.trim()||null,
      address:document.getElementById("nc-address").value.trim()||null
    }]).select().single();
    if (ncErr) { showWoError("Failed to create client. Please try again."); resetBtn(); return; }
    clientId=newClient.id;
  } else { clientId=document.getElementById("wo-client-id").value||null; }
  const jobRecord={title,description:desc||null,priority:selectedPrio,status:techId?"active":"pending",technician_id:techId,client_id:clientId,scheduled_date:date||null,scheduled_time:time||null,notes:notes||null,start_time:techId?new Date().toISOString():null};
  const {error:jobErr}=await sb.from("jobs").insert([jobRecord]).select().single();
  if (jobErr) { showWoError("Failed to create work order. Please try again."); resetBtn(); return; }
  await loadAll();
  document.getElementById("wo-form").style.display="none";
  const successEl=document.getElementById("wo-success"); successEl.style.display="flex";
  document.getElementById("wo-success-msg").textContent=`"${title}" has been posted as ${techId?"active":"pending"} and is now visible on the technician dashboard.`;
  feather.replace();
}
function showWoError(msg) { const el=document.getElementById("wo-error"); el.textContent=msg; el.style.display="inline"; resetBtn(); }
function resetBtn() { const btn=document.getElementById("wo-submit-btn"); btn.disabled=false; btn.innerHTML=`<i data-feather="send"></i> Post Work Order`; feather.replace(); }
function resetWorkOrderForm() {
  document.getElementById("wo-success").style.display="none";
  document.getElementById("wo-form").style.display="block";
  ["wo-title","wo-date","wo-time","wo-desc","wo-notes","nc-name","nc-phone","nc-email","nc-city","nc-address"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("new-client-toggle").checked=false;
  toggleNewClient(false); selectPrio("normal");
  document.getElementById("wo-error").style.display="none";
  resetBtn(); populateWorkOrderDropdowns();
}
