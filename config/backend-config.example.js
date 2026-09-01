/*
 * Work Management account backend configuration.
 *
 * Work Management v1.13+ is account-based: authenticated access is mandatory.
 * GitHub Pages is a public client environment, so ONLY public Supabase values belong here.
 * Never place sb_secret_*, service_role keys, database passwords, SMTP credentials, or other secrets in this file.
 */
window.WM_BACKEND_CONFIG = Object.freeze({
  provider: 'supabase',
  accountBased: true,
  enabled: true,
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'sb_publishable_YOUR_PUBLIC_KEY',
  requireAuthentication: true,
  allowRegistration: true
});
