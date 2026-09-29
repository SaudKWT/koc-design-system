import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { LandingViewer } from "./bakeoff/landing/LandingViewer";
import { directionFromHash } from "./bakeoff/landing/directions";
import "./styles.css";

/**
 * `#/landing/<id>` renders one landing-page direction full-screen, with no docs
 * chrome — a landing page cannot be judged inside a max-w-5xl docs column.
 * Evaluation only; see src/bakeoff/landing/. Everything else is the docs app.
 */
function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const landing = directionFromHash(hash);
  return landing ? <LandingViewer id={landing} /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
