/** Admin credentials now belong exclusively to the server secret environment.
 * Kept as a module for old imports outside the application; no password defaults.
 */
export function loadAdminCredentials() { return { login: "", password: "" }; }
export function saveAdminCredentials() { throw new Error("Admin credentials are managed on the server."); }
