import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homePathForRole } from "../auth/roleHome";

/** @param {{ roles: Array<'admin' | 'usta' | 'asisten'> }} props */
export default function RequireAnyRole({ roles }) {
  const { session } = useAuth();
  const allowed = Array.isArray(roles) ? roles : [];

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(session.role)) {
    return <Navigate to={homePathForRole(session.role)} replace />;
  }

  return <Outlet />;
}
