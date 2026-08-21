/**
 * Whether a nav destination is the page currently being viewed.
 *
 * Split out from the components because the rail, the tab strip and the app
 * bar must agree on it — and because the segment-boundary rule is the kind of
 * thing that quietly regresses: a plain `startsWith` lights up "/series" while
 * you're reading /series-archive, and lights up *every* link when the href is
 * "/", which is why Home passes `exact`.
 */
export function isActivePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
