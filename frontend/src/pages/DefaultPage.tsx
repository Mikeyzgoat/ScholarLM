import { Navigate } from "react-router-dom";

export default function DefaultPage() {
  return <Navigate to="/notes" replace />;
}
