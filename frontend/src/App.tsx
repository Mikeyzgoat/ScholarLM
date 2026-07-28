import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import WorkspacePage from "./pages/WorkspacePage";
import NotesPage from "./pages/NotesPage";
import { AppLayout } from "./components/layout/AppLayout";
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace/:documentId" element={<WorkspacePage />} />
      </Route>
      <Route path="/notes/:noteId" element={<NotesPage />} />
      <Route path="*" element={<main className="p-8">Page not found</main>} />
    </Routes>
  );
}
