import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./tokens.css";
import "./styles.css";
import "./components.css";
import "./bluesky.css";
import "./poll-workspace.css";
import "./workspace-layout.css";
import "./bluesky-spacing.css";
import "./bluesky-components.css";
import "./settings.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
