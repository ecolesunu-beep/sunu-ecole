/** Presence only. Hash the exact string supplied by the user, including spaces. */
export function isPasswordProvided(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
