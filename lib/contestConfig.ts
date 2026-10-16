/**
 * The one central place for every Creator Program / contest value the
 * spec calls out as a placeholder — so changing a reward amount or a
 * deadline is a one-line edit here, not a hunt through routes.
 *
 * Only what Phase 2 needs lives here so far (the terms version string).
 * Phase 4 adds the reward/discount/founding-member values; later phases
 * add the contest round shape. Bump CONTEST_TERMS_VERSION whenever
 * /legal/terms-contest's substance changes — existing accepted
 * submissions keep whatever version they actually agreed to
 * (finished_rooms.terms_version), so this is an audit trail, not just a cache key.
 */
export const CONTEST_TERMS_VERSION = "v1";
