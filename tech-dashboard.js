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


