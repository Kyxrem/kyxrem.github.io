/* SpieleAffen Konfiguration
   mode:
     'github'  — Schreibzugriff direkt über die GitHub-API. Jede Person bekommt ein
                 eigenes Fine-Grained Personal Access Token (siehe DEPLOY.md).
                 Kein eigener Server nötig.
     'worker'  — Schreibzugriff über einen Cloudflare Worker (worker/worker.js).
                 Personen-Tokens sind dann beliebige Strings, das Repo-Token bleibt
                 geheim auf dem Worker. Empfohlen, sobald es "ernst" wird.
*/
window.SA_CONFIG = {
  mode: 'github',
  owner: 'Kyxrem',
  repo: 'kyxrem.github.io',
  branch: 'main',
  dataPath: 'spieleaffen/data/data.json',
  tokensPath: 'spieleaffen/data/tokens.json',
  workerUrl: ''  // z.B. 'https://spieleaffen.dein-name.workers.dev' (nur mode:'worker')
};
