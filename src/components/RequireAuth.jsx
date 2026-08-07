import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homePathForRole } from "../auth/roleHome";

/** @param {{ role: 'admin' | 'usta' | 'asisten' }} props */
export default function RequireAuth({ role }) {
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.role !== role) {
    return <Navigate to={homePathForRole(session.role)} replace />;
  }

  return <Outlet />;
}
