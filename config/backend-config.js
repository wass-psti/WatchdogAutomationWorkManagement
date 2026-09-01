/*
 * Work Management account backend configuration.
 *
 * v1.13+ does not permit local-only workspace access. Configure the public Supabase
 * project URL and publishable key before deployment. These values are public client
 * configuration; privileged secrets must remain server-side.
 */
window.WM_BACKEND_CONFIG = Object.freeze({
  provider: 'supabase',
  accountBased: true,
  enabled: true,
  supabaseUrl: '',
  publishableKey: '',
  requireAuthentication: true,
  allowRegistration: true
});
