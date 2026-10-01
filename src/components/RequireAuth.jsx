import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homePathForRole } from "../auth/roleHome";

/** @param {{ role: 'admin' | 'usta' | 'asisten' }} props */
export default function RequireAuth({ role }) {
  const { session, authLoading } = useAuth();

  if (authLoading) return <p role="status" className="p-6 text-sm text-slate-500">Tekshirilmoqda...</p>;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.role !== role) {
    return <Navigate to={homePathForRole(session.role)} replace />;
  }

  return <Outlet />;
}
