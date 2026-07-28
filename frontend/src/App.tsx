import {Routes,Route} from "react-router-dom";import HomePage from "./pages/HomePage";
export default function App(){return <Routes><Route path="/" element={<HomePage/>}/><Route path="*" element={<main className="p-8">Page not found</main>}/></Routes>}
