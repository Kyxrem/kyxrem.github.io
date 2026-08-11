/* SpieleAffen — Konfiguration
 *
 * apiBase: URL des Cloudflare Workers (siehe DEPLOY.md).
 *   Leer lassen = Demo-Modus mit Beispieldaten; die App läuft dann
 *   vollständig, speichert aber nur im eigenen Browser.
 *   Nach dem Worker-Deploy hier eintragen, z. B.:
 *   apiBase: 'https://spieleaffen.DEIN-SUBDOMAIN.workers.dev'
 */
window.SPIELEAFFEN_CONFIG = {
  apiBase: 'https://spieleaffen.torben-meyer-61a.workers.dev'
};
