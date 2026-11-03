// Browser-only entry for the GitHub Pages build (vite.pages.config.ts). The Sites build keeps using app/layout.tsx.
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import "./pages.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(<Home />);
