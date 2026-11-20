// Public preview hosts may be embedded by the managed editor, not private deployments.
const managedHostDefaults = ["https://arena.ai", "https://*.arena.ai", "https://lmarena.ai", "https://*.lmarena.ai", "http://localhost:*", "http://127.0.0.1:*"];
export function previewAncestors(additional = "") {
  const origins = additional.split(/\s+/).filter((origin) => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin));
  return [...new Set([...managedHostDefaults, ...origins])];
}
export function matchesPreviewHost(origin: string, patterns: string[]) {
  try {
    const url = new URL(origin);
    if (patterns.includes(url.origin)) return true;
    return patterns.some((pattern) => {
      if (pattern === "http://localhost:*" || pattern === "http://127.0.0.1:*") return url.protocol === "http:" && url.hostname === pattern.slice(7, -2);
      return url.protocol === "https:" && pattern.startsWith("https://*.") && url.hostname.endsWith(pattern.slice(9));
    });
  } catch { return false; }
}
