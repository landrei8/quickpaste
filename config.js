// QuickPaste configuration.
// Find both values in Supabase: Project Settings → API (or "Connect" → App Frameworks).
// The anon / publishable key is meant to be public — the database is protected
// by the functions in supabase/schema.sql, not by keeping this key secret.
// Never put the service_role / secret key here.
//
// While these still contain "YOUR_", the site runs in Demo mode and saves
// pastes only in the current browser.
//
// If you change supabaseUrl, also update connect-src in the Content-Security-Policy
// <meta> tag in index.html — the browser blocks requests to any other server.
window.QUICKPASTE_CONFIG = {
  supabaseUrl: 'https://jkbrbvdcsxlpbwdqfwuq.supabase.co',
  supabaseKey: 'sb_publishable_abUKrBZga88N5I52F8IxZw_O1wbtbWK',
};
