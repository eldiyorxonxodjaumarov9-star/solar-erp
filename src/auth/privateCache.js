/** Business caches are display data, never authorization. Remove them on identity change. */
const CACHE_KEYS = new Set(['currentSession','users','workers','assistants','expenses','projects','brigades','ustaPhotos','userActivityLogs','user_activity_logs','workLogs','work_logs','project_worker_days','complaints','jalbalar','solar-erp-admin-credentials','solar-erp-payroll-draft','project_stage_bot_locks_v1','usta_project_progress_v2','solar-erp-projects','solar-erp-workers','project_stage_locks']);
export function clearPrivateCaches(storage = globalThis.localStorage, sessionStorage = globalThis.sessionStorage) {
 for (const store of [storage,sessionStorage]) {
  if(!store)continue;
  try {
   for(let i=store.length-1;i>=0;i--){const key=store.key(i);if(CACHE_KEYS.has(key)||/^(solar-erp-(activity|telegram|worker|assistant|payroll|usta)|usta[_-]|yorijnoma|salary|payroll)/i.test(key))store.removeItem(key);}
   // Simple mocked/legacy stores may not expose length/key.
   for(const key of CACHE_KEYS)store.removeItem(key);
  }catch{ /* UI identity still resets if storage is unavailable. */ }
 }
}
