import "server-only";

import { createReadOnlyQuery } from "./read-only-pool";

/**
 * Read-only connection pool to the district HDC database (`sub_hdc`,
 * 43-file person-level data of every unit in อ.บางระกำ, MariaDB 10.6).
 * Env: HIS_HOST2 / HIS_PORT2 / HIS_USER2 / HIS_PASSWORD2 / HIS_DATABASE2.
 *
 * Errors are the same classes as HOSxP (HisConfigError / HisQueryError,
 * message "HDC query failed (<code>)"), so the existing route error
 * mapping works unchanged.
 *
 * Data notes (verified with db-cli --conn 2):
 *  - every column is varchar; dates are 'YYYYMMDD' strings
 *  - `cid` is an MD5 hash (32 hex) — consistent across tables, used only to
 *    join / de-duplicate inside SQL and never returned
 *  - only FY 2569 onward is loaded (service / ncdscreen from 2025-10)
 */
export const hdcQuery = createReadOnlyQuery({
  envSuffix: "2",
  label: "HDC",
  globalKey: "__hdcPool",
});
