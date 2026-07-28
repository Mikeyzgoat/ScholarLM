import { Navigate, Routes, Route } from "react-router";
import HomePage from "./pages/HomePage";
import DefaultPage from "./pages/DefaultPage";
import WorkspacePage from "./pages/WorkspacePage";
import NotesPage from "./pages/NotesPage";
import StandaloneCanvasPage from "./pages/StandaloneCanvasPage";
import KnowledgeGraphPage from "./pages/KnowledgeGraphPage";
import NotesLibraryPage from "./pages/NotesLibraryPage";
import { AppLayout } from "./components/layout/AppLayout";
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DefaultPage />} />
        <Route path="/upload" element={<HomePage />} />
        <Route path="/workspace/:documentId" element={<WorkspacePage />} />
        <Route path="/graph" element={<KnowledgeGraphPage />} />
        <Route path="/graph/:documentId" element={<KnowledgeGraphPage />} />
        <Route path="/notes" element={<NotesLibraryPage />} />
      </Route>
      <Route path="/notes/:noteId" element={<NotesPage />} />
      <Route path="/canvas" element={<Navigate to="/notes" replace />} />
      <Route path="/canvas/:canvasId" element={<StandaloneCanvasPage />} />
      <Route path="*" element={<main className="p-8">Page not found</main>} />
    </Routes>
  );
}
