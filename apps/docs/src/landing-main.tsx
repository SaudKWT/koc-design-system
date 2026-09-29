/**
 * Standalone entry for the DWEG landing comparison, built on its own by
 * `npm run build:landing` for hosting outside the repo.
 *
 * It deliberately ships ONLY the comparison: the index of directions and the
 * full-screen viewer. The design-system docs and the `@koc` registry files in
 * public/r are private and must not ride along on a public deployment.
 */
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import { Toaster } from "@koc/ui";
import { LandingDirections } from "./bakeoff/landing/LandingDirections";
import { LandingViewer } from "./bakeoff/landing/LandingViewer";
import { directionFromHash } from "./bakeoff/landing/directions";
import "./styles.css";

function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const id = directionFromHash(hash);
  if (id) return <LandingViewer id={id} />;
  return (
    <>
      <main className="mx-auto min-h-screen max-w-5xl bg-background px-4 py-10 sm:px-8">
        <LandingDirections />
      </main>
      <Toaster position="bottom-right" />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
