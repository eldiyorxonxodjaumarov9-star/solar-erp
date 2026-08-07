import { useEffect, useState } from "react";
import {
  USER_ACTIONS_LOGS_EVENT,
  loadUserActionsLogs,
} from "../activity/userActionsLogsStorage";

export function useUserActionsLogs() {
  const [logs, setLogs] = useState(loadUserActionsLogs);

  useEffect(() => {
    const sync = () => setLogs(loadUserActionsLogs());
    window.addEventListener("storage", sync);
    window.addEventListener(USER_ACTIONS_LOGS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(USER_ACTIONS_LOGS_EVENT, sync);
    };
  }, []);

  return logs;
}
