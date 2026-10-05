/**
 * The desktop sidebar's expanded/collapsed preference lives in a cookie (not
 * localStorage) so the server layout can render the saved state directly — a
 * refresh then never flashes or animates from the default. No cookie means
 * collapsed, the first-visit default.
 *
 * Kept outside the "use client" sidebar module because the server layout reads
 * this constant, and a client module's exports reach the server only as
 * client references.
 */
export const SIDEBAR_COOKIE = "desk-booking-sidebar";
export const SIDEBAR_EXPANDED = "expanded";
export const SIDEBAR_COLLAPSED = "collapsed";
