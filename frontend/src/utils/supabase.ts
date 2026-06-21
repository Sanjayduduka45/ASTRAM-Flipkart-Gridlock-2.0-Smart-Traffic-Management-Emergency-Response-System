// Supabase REST client utility
// Communicates directly with Supabase PostgREST endpoints using browser fetch

const SUPABASE_URL = 'https://odbmivpdwcoddcotwddl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WcAX3rLNeLRRglKzVZyxlQ_pOKR2LQi';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const supabaseFetch = async (path: string, options: RequestInit = {}) => {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${errText}`);
  }
  return response.json();
};

export const supabaseReports = {
  getAll: async () => {
    try {
      return await supabaseFetch('citizen_reports?select=*&order=start_datetime.desc');
    } catch (e) {
      console.warn('Failed to fetch from Supabase (is the table citizen_reports created?):', e);
      return [];
    }
  },
  insert: async (report: Record<string, unknown>) => {
    try {
      return await supabaseFetch('citizen_reports', {
        method: 'POST',
        body: JSON.stringify(report)
      });
    } catch (e) {
      console.error('Failed to insert report into Supabase:', e);
      throw e;
    }
  },
  updateStatus: async (id: string, status: string, assignedResource?: string) => {
    try {
      const updateBody: Record<string, unknown> = { status };
      if (assignedResource !== undefined) {
        updateBody.assigned_resource = assignedResource;
      }
      return await supabaseFetch(`citizen_reports?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody)
      });
    } catch (e) {
      console.error('Failed to update status in Supabase:', e);
      throw e;
    }
  }
};
