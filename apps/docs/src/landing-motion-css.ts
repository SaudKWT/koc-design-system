/**
 * Shared by src/landing-motion.ts (runtime) and vite.landing.config.ts (build).
 * A separate, DOM-free module so the Vite config can import it under Node.
 */
export const NEVER = "(min-resolution: 99999dppx)";
export const ALWAYS = "(min-width: 0px)";
