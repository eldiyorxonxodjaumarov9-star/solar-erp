import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homePathForRole } from "../auth/roleHome";

export default function CatchAllRedirect() {
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={homePathForRole(session.role)} replace />;
}
