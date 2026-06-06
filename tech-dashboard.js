import { getTechnicianJobs, getUnassignedJobs } from './jobs.js';

async function loadTechDashboard() {
  const active = await getTechnicianJobs();
  const open = await getUnassignedJobs();

  renderActiveJobs(active);
  renderOpenJobs(open);
}

loadTechDashboard();
