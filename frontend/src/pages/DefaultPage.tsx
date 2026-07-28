import { Navigate } from "react-router";

export default function DefaultPage() {
  return <Navigate to="/notes" replace />;
}
