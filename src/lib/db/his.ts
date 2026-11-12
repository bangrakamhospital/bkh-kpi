import "server-only";

import { createReadOnlyQuery } from "./read-only-pool";

/**
 * Read-only connection pool to the HIS database (HOSxP of the hospital,
 * hospcode 11252, MySQL/MariaDB). Env: HIS_HOST / HIS_PORT / HIS_USER /
 * HIS_PASSWORD / HIS_DATABASE. See ./read-only-pool for the guarantees
 * (READ ONLY session, prepared statements, no secrets in errors/logs).
 * Use `query()` with named placeholders (`:name`) only.
 */

export {
  HisConfigError,
  HisQueryError,
  type QueryParams,
} from "./read-only-pool";

/**
 * Run a parameterized SELECT against HIS (HOSxP) and return rows.
 * Uses server-side prepared statements (`execute`).
 */
export const query = createReadOnlyQuery({
  envSuffix: "",
  label: "HIS",
  globalKey: "__hisPool",
});
