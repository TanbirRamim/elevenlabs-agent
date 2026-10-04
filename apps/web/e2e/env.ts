/**
 * Ports and URLs shared by playwright.config.ts and the tests (kept off :3000/:4000 so a dev
 * stack can run alongside). E2E_API_PORT / E2E_WEB_PORT override them, e.g. for a second
 * checkout running its own suite at the same time.
 */
const port = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
export const API_PORT = port(process.env.E2E_API_PORT, 4104);
export const WEB_PORT = port(process.env.E2E_WEB_PORT, 3104);
export const API_URL = `http://localhost:${API_PORT}`;
export const WS_URL = `ws://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
