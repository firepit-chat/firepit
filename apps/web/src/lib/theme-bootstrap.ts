import {
    ACCENT_COOKIE,
    ACCENT_NAMES,
    DEFAULT_ACCENT,
    DARK_DEFAULT_THEME,
    DEFAULT_THEME,
    THEME_COOKIE,
} from "@/lib/themes";

/**
 * Applies the stored accent and seeds the theme, before first paint.
 *
 * This is a blocking inline script rather than a cookie read in the layout,
 * because `cookies()` would opt the whole app out of static rendering. The name
 * lists are inlined so the script never has to wait on a payload.
 *
 * The theme seed exists because `@teispace/next-themes` cannot resolve
 * `system` onto custom palette names — it resolves to the literal string
 * `"system"`, which matches no `[data-theme]` block and so has no CSS. With
 * `enableSystem` off, a first visit would otherwise take the provider's
 * `defaultTheme` and hand every dark-mode user a light app, which is what the
 * previous `defaultTheme="system"` setup avoided. Writing the OS-derived palette
 * into the library's own cookie (`THEME_COOKIE`, its default storage key) makes
 * its inline script, its store, and this script all agree, and the choice then
 * persists like any other. Once that cookie exists this branch never runs
 * again, and the attribute is left entirely to the library.
 *
 * `DARK_DEFAULT_THEME`/`DEFAULT_THEME` must stay in step with the provider's
 * `defaultTheme`, which resolves the same way; if they disagree the provider
 * overwrites the attribute on mount and undoes this.
 */
export const PREFERENCES_BOOTSTRAP_SCRIPT = `(function(){try{var d=document.documentElement,c=document.cookie.split("; "),g=function(n){for(var i=0;i<c.length;i++){if(c[i].indexOf(n+"=")===0)return decodeURIComponent(c[i].slice(n.length+1))}return null};var m=${JSON.stringify(ACCENT_COOKIE)},a=g(m);if(${JSON.stringify(ACCENT_NAMES)}.indexOf(a)<0)a=${JSON.stringify(DEFAULT_ACCENT)};d.dataset.accent=a;var t=${JSON.stringify(THEME_COOKIE)};if(!g(t)){var dk=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches,p=dk?${JSON.stringify(DARK_DEFAULT_THEME)}:${JSON.stringify(DEFAULT_THEME)};d.setAttribute("data-theme",p);document.cookie=t+"="+p+"; path=/; max-age=31536000; samesite=lax"}}catch(e){}})();`;
