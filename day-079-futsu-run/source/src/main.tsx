import React from "react";
import ReactDOM from "react-dom/client";
import GameApp from "./components/GameApp";
import "./app/globals.css";
import "./app/product-ui.css";
import "./app/race-ui.css";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <GameApp />
    </React.StrictMode>
  );
}
