import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homePathForRole } from "../auth/roleHome";

export default function CatchAllRedirect() {
  const { session, authLoading } = useAuth();

  if (authLoading) return <p role="status" className="p-6 text-sm text-slate-500">Tekshirilmoqda...</p>;

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={homePathForRole(session.role)} replace />;
}
