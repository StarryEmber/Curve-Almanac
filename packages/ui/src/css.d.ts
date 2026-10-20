/**
 * CSS side-effect imports are handled by Vite; TypeScript needs the ambient
 * declaration. (`tokens.test.ts` reads the stylesheet with `node:fs` so it
 * inspects the source text rather than a transformed module.)
 */

declare module '*.css';
