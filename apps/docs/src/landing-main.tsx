/**
 * Standalone entry for the DWEG landing comparison, built on its own by
 * `npm run build:landing` for hosting outside the repo.
 *
 * It deliberately ships ONLY the comparison: the full-screen viewer, opening on
 * A v2 when the address names no direction (Saud: skip the index, land on a page). The design-system docs and the `@koc` registry files in
 * public/r are private and must not ride along on a public deployment.
 */
// First: every later module must see the patched matchMedia.
import "./landing-motion";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import { LandingViewer } from "./bakeoff/landing/LandingViewer";
import { LANDING_HASH, directionFromHash } from "./bakeoff/landing/directions";
import "./styles.css";

/** Where the hosted comparison opens when the address names no direction. */
const HOME = "a2";

function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const id = directionFromHash(hash) ?? HOME;
  // Put the direction in the address so the link is shareable and back/forward work.
  useEffect(() => {
    if (!directionFromHash(window.location.hash)) {
      history.replaceState(null, "", `${LANDING_HASH}${HOME}`);
    }
  }, [hash]);
  return <LandingViewer id={id} standalone />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
