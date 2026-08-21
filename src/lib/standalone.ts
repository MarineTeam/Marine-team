/**
 * Telling an installed app apart from a browser tab.
 *
 * The two get different chrome: in a tab the app is a website — sidebar,
 * header search field, footer — while installed it should read like the
 * native app it's standing in for, with an app bar and a bottom tab strip.
 * CSS alone can't quite decide this (iOS home-screen apps still don't report
 * `display-mode` reliably), so the script below stamps the answer on <html>
 * and the stylesheet keys off that.
 *
 * The attribute is only ever *added*, and only when installed: with the
 * script blocked or still pending, nothing is stamped and the page renders as
 * the website — the safe default, and the one the server rendered.
 */

export const STANDALONE_ATTRIBUTE = "data-standalone";

/**
 * Blocking and inline in <head>, for the same reason as THEME_INIT_SCRIPT:
 * run this any later and the app bar and the website header both paint for a
 * frame before one of them disappears.
 */
export const STANDALONE_INIT_SCRIPT = `(function(){try{
var m=window.matchMedia;
var installed=(m&&(m("(display-mode: standalone)").matches||m("(display-mode: fullscreen)").matches||m("(display-mode: minimal-ui)").matches))||window.navigator.standalone===true;
if(installed)document.documentElement.setAttribute(${JSON.stringify(STANDALONE_ATTRIBUTE)},"true");
}catch(e){}})();`;
