import { getTechnicianJobs, getUnassignedJobs } from './jobs.js';

async function loadTechDashboard() {
  const active = await getTechnicianJobs();
  const open = await getUnassignedJobs();

  renderActiveJobs(active);
  renderOpenJobs(open);
}

loadTechDashboard();


async function hasAllRequiredDocs(userId) {
  const buckets = [
    "technician-msa",
    "technician-w9",
    "technician-nda",
    "technician-ids"
  ];

  for (const bucket of buckets) {
    const { data, error } = await sb.storage.from(bucket).list(userId + "/");
    if (error || !data || data.length === 0) {
      return false;
    }
  }

  return true;
}
async function initTechDashboard() {
  const session = await sb.auth.getSession();
  const user = session.data.session.user;

  const { data: tech } = await sb.from("technicians")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // 1. If missing documents → show upload tool only
  if (tech.status === "pending_documents") {
    const ready = await hasAllRequiredDocs(user.id);

    if (!ready) {
      showDocumentUploadPanel();
      hideWorkOrderPanels();
      return;
    }

    // All docs uploaded → move to pending_approval
    await sb.from("technicians")
      .update({ status: "pending_approval" })
      .eq("user_id", user.id);

    showWaitingForApprovalPanel();
    hideWorkOrderPanels();
    return;
  }

  // 2. If waiting for admin approval
  if (tech.status === "pending_approval") {
    showWaitingForApprovalPanel();
    hideWorkOrderPanels();
    return;
  }

  // 3. If approved → show work orders
  if (tech.status === "approved" || tech.status === "active") {
    showWorkOrderPanels();
    return;
  }
}



async function hasSignOutSheets(workOrderId, userId) {
  const { data, error } = await sb.storage
    .from("workorder-signouts")
    .list(`${userId}/${workOrderId}/`);

  return data && data.length > 0;
}




