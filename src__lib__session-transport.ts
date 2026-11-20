export const SESSION_TRANSPORT_PATH = "/api/session/transport";
export const SESSION_TOKEN_PATTERN = /^se1\.[A-Za-z0-9_-]{43}$/;

const routes = {
  "/api/auth/me": ["GET"],
  "/api/auth/logout": ["POST"],
  "/api/auth/password": ["POST"],
  "/api/data/snapshot": ["GET"],
  "/api/data/eleves": ["GET", "POST", "PATCH", "DELETE"],
  "/api/data/historique": ["GET"],
  "/api/data/utilisateurs": ["GET", "POST", "PATCH"],
  "/api/data/pieces-jointes": ["GET", "POST"],
  "/api/data/export": ["GET"],
  "/api/data/export-journal": ["GET"],
  "/api/data/import": ["POST"],
  "/api/data/journal": ["POST", "PATCH", "DELETE"],
  "/api/data/fiches": ["POST", "DELETE"],
  "/api/data/code": ["POST"],
  "/api/data/ecole": ["PATCH"],
  "/api/events": ["GET"],
} as const;

type WorkspaceRoute = keyof typeof routes;
export type TransportTarget = { path: WorkspaceRoute; method: "GET" | "POST" | "PATCH" | "DELETE" };
export function transportTarget(path: unknown, method: unknown): TransportTarget | null {
  if (typeof path !== "string" || typeof method !== "string" || !Object.hasOwn(routes, path)) return null;
  const allowed: readonly string[] = routes[path as WorkspaceRoute];
  if (!allowed.includes(method)) return null;
  return { path: path as WorkspaceRoute, method: method as TransportTarget["method"] };
}
