// The /ask island: the chat about Fried, mounted in the site's shell.
import "@/styles/shadcn.css";
import "@/styles/markdown.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Chat } from "@/chat/Chat";

const root = document.getElementById("app-root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Chat initialQuestion={root.dataset.q ?? ""} />
    </StrictMode>,
  );
}
