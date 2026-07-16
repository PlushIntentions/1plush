// jobs.js
import supabase from './supabase.js';

/* ---------------------------------------------------------
   ASSIGN JOB
   Admins + Dispatchers only
   Only works if job is currently unassigned
--------------------------------------------------------- */
export async function assignJob(jobId, technicianId) {
  const { data, error } = await supabase
    .from('jobs')
    .update({
      technician_id: technicianId,
      status: 'active',
      updated_at: new Date()
    })
    .eq('id', jobId)
    .is('technician_id', null); // prevents double-assigning

  if (error) {
    console.error('Assign Job Error:', error);
    return { error };
  }

  return { data };
}

/* ---------------------------------------------------------
   UNASSIGN JOB
   Admins + Dispatchers only
   Only works if job is currently assigned
--------------------------------------------------------- */
export async function unassignJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .update({
      technician_id: null,
      status: 'pending',
      updated_at: new Date()
    })
    .eq('id', jobId)
    .not('technician_id', 'is', null); // prevents unassigning unassigned jobs

  if (error) {
    console.error('Unassign Job Error:', error);
    return { error };
  }

  return { data };
}

/* ---------------------------------------------------------
   GET ALL JOBS (Admin + Dispatcher)
--------------------------------------------------------- */
export async function getAllJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get All Jobs Error:', error);
    return { error };
  }

  return { data };
}

/* ---------------------------------------------------------
   GET UNASSIGNED JOBS (Tech + Admin + Dispatcher)
--------------------------------------------------------- */
export async function getUnassignedJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .is('technician_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get Unassigned Jobs Error:', error);
    return { error };
  }

  return { data };
}

/* ---------------------------------------------------------
   GET TECHNICIAN'S ACTIVE JOBS (Tech Dashboard)
--------------------------------------------------------- */
export async function getTechnicianJobs(techId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('technician_id', techId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get Technician Jobs Error:', error);
    return { error };
  }

  return { data };
}

/* ---------------------------------------------------------
   GET SINGLE JOB (Admin + Dispatcher)
--------------------------------------------------------- */
export async function getJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    console.error('Get Job Error:', error);
    return { error };
  }

  return { data };
}
async function loadAdminRequests() {
  const { data: jobs, error } = await sb
    .from("jobs")
    .select(`
      id,
      title,
      scheduled_date,
      scheduled_time,
      requested_by,
      request_status,
      clients ( name, address )
    `)
    .eq("request_status", "requested")
    .order("scheduled_date", { ascending: true });

  if (error) {
    console.error(error);
    showToast("Failed to load workorder requests.");
    return;
  }

  renderAdminRequests(jobs || []);
}

function renderAdminRequests(jobs) {
  const el = document.getElementById("admin-requests-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = "<p>No pending workorder requests.</p>";
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    const techList = job.requested_by.map(id => `<li>${id}</li>`).join("");

    card.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Client:</strong> ${job.clients?.name}</p>
      <p><strong>Address:</strong> ${job.clients?.address}</p>
      <p><strong>Scheduled Date:</strong> ${job.scheduled_date}</p>
      <p><strong>Scheduled Time:</strong> ${job.scheduled_time}</p>

      <p><strong>Requested By:</strong></p>
      <ul>${techList}</ul>

      <label>Select Technician:</label>
      <select id="approve-${job.id}">
        ${job.requested_by.map(id => `<option value="${id}">${id}</option>`).join("")}
      </select>

      <button onclick="approveRequest('${job.id}')">Approve</button>
      <button onclick="rejectRequest('${job.id}')">Reject All</button>
    `;

    el.appendChild(card);
  });
}

function showPanel(panelId) {
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.add('hidden');
  });

  const activePanel = document.getElementById(panelId);
  if (activePanel) {
    activePanel.classList.remove('hidden');
  }
}


async function approveRequest(jobId) {
  const techId = document.getElementById(`approve-${jobId}`).value;

  // Assign job
  const { error } = await sb
    .from("jobs")
    .update({
      technician_id: techId,
      request_status: "approved",
      requested_by: [],
      status: "assigned"
    })
    .eq("id", jobId);

  if (error) throw error;

  // Fetch technician email
  const { data: techProfile } = await sb
    .from("profiles")
    .select("email")
    .eq("id", techId)
    .maybeSingle();

  // Send notification
  await fetch("https://admin.plushintentions.work/api/send-approval-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: techProfile.email,
      jobId,
      message: "Your workorder request has been approved."
    })
  });

  showToast("Workorder approved.");
  loadAdminRequests();
}


async function rejectRequest(jobId) {
  const { error } = await sb
    .from("jobs")
    .update({
      request_status: "none",
      requested_by: []
    })
    .eq("id", jobId);

  if (error) {
    console.error(error);
    showToast("Rejection failed.");
    return;
  }

  showToast("All requests rejected.");
  loadAdminRequests();
}

