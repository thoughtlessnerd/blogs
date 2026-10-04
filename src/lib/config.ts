// Single place for the things you'll want to change without hunting through
// components. Everything here is public by design — this repo is public, so
// never put anything secret in this file.

// Used in the copyright line. Your legal name is what asserts ownership, so
// this is deliberately "Abhay" rather than one of the handles.
export const AUTHOR = 'Abhay';

// First year the blog existed. The footer shows "2026" on its own until the
// current year moves past it, then switches to a "2026–2028" range.
export const SITE_START_YEAR = 2026;

// Split so the address isn't sitting in the page source as one scrapeable
// string. The contact page renders it as "user [at] domain".
export const EMAIL_USER = 'abhay.csgo001';
export const EMAIL_DOMAIN = 'gmail.com';

// Shown on /contact. Delete any you don't want, add any you do.
export const SOCIALS = [
  { label: 'GitHub', handle: '@thoughtlessnerd', url: 'https://github.com/thoughtlessnerd' },
  { label: 'LinkedIn', handle: '/in/thoughtlessnerd', url: 'https://linkedin.com/in/thoughtlessnerd' },
];

// GoatCounter's site code. It is a public identifier (same category as a
// Google Analytics ID), so it is safe in a public repo — there is no secret
// here. Sign up free at https://www.goatcounter.com, then put your code here.
//
// While this is empty, no analytics script is emitted at all.
export const GOATCOUNTER_CODE = 'thoughtlessnerd';
