/**
 * Direction E — "Wellpath", after sstr.tech.
 *
 * A live 3D tour down one horizontal well sits in the hero; below it, a plain
 * grid of every dashboard and the KPIs. The tour is modelled from real
 * dimensions in raw WebGL2 (./gl), with zero new dependencies.
 */

import "./landing-e.css";

import { Hero } from "./Hero";
import { CompanyStrip, Footer, GroupKpis, Teams } from "./Sections";

export default function DirectionE() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main>
        <Hero />
        <CompanyStrip />
        <Teams />
        <GroupKpis />
      </main>
      <Footer />
    </div>
  );
}
