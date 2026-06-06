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

