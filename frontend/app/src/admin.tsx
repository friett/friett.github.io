// The owner's admin island, mounted by frontend/templates/app.html on /admin.
import "@/styles/shadcn.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./admin/App.tsx";

const root = document.getElementById("app-root");
if (root) {
  root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <AdminApp />
    </StrictMode>,
  );
}
