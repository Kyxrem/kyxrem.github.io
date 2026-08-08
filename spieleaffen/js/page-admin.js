/* Verwaltung (nur Runden-Chef): Zugangs-Tokens registrieren & sperren.
   In tokens.json landen ausschließlich SHA-256-Hashes — nie das Token selbst. */
(async function () {
  'use strict';
  const { h } = UI;
  const app = UI.qs('#app');
  const cfg = window.SA_CONFIG;

  let ownerToken = sessionStorage.getItem('spieleaffen.owner') || '';
  let registry = null;

  app.append(h('header', { class: 'pagehead' },
    h('div', null,
      h('div', { class: 'eyebrow acid' }, 'SPIELEAFFEN · RUNDEN-CHEF'),
      h('h1', null, 'Tokens')),
    h('div', { class: 'meta', html: 'Modus:<br><b>' + cfg.mode + '</b>' })));
  const body = h('div');
  app.append(body);

  async function loadRegistry() {
    registry = await API.loadTokens();
    registry.tokens = registry.tokens || {};
  }

  function gate() {
    const input = h('input', { class: 'input', type: 'password', placeholder: 'github_pat_… (Fine-grained PAT, Contents RW)', value: ownerToken });
    const err = h('div', { class: 'small', style: 'color:var(--alert);min-height:16px' });
    const btn = h('button', { class: 'btn block' }, 'Weiter');
    btn.addEventListener('click', async () => {
      ownerToken = input.value.trim();
      if (!ownerToken) { err.textContent = 'Token fehlt.'; return; }
      btn.disabled = true; btn.textContent = 'Prüfe…';
      try {
        const res = await fetch('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo, {
          headers: { Authorization: 'Bearer ' + ownerToken, Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) throw new Error('GitHub sagt HTTP ' + res.status + ' — Token oder Rechte prüfen.');
        sessionStorage.setItem('spieleaffen.owner', ownerToken);
        await loadRegistry();
        main();
      } catch (e) { err.textContent = String(e.message || e); btn.disabled = false; btn.textContent = 'Weiter'; }
    });
    UI.clear(body).append(h('div', { class: 'section stack', style: 'padding-top:14px' },
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow acid' }, 'DEIN GITHUB-TOKEN (NUR DU)'),
        h('p', { class: 'small muted' },
          'Zum Verwalten der Zugänge brauchst du dein eigenes Fine-grained PAT mit „Contents: Read and write" für ',
          h('b', null, cfg.owner + '/' + cfg.repo),
          '. Es bleibt nur in dieser Browser-Sitzung (sessionStorage).'),
        input, err, btn),
      h('div', { class: 'small muted center' }, 'Anleitung: DEPLOY.md im Repo · ',
        h('a', { style: 'color:var(--acid)', href: 'edit.html' }, 'Zurück zum Eintragen'))));
  }

  function randomToken() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    let s = '';
    bytes.forEach((b, i) => { s += alphabet[b % alphabet.length]; if (i % 5 === 4 && i < 19) s += '-'; });
    return 'SA-' + s;
  }

  async function commitRegistry(message, btn) {
    if (btn) btn.disabled = true;
    try {
      await API.saveTokens({
        ownerToken, who: 'Runden-Chef', message,
        mutator: (reg) => { reg.tokens = registry.tokens; reg._hinweis = registry._hinweis || 'Nur SHA-256-Hashes, nie echte Tokens.'; }
      });
      await loadRegistry();
      UI.toast('tokens.json aktualisiert ✓');
      main();
    } catch (e) { UI.toast(String(e.message || e), true); if (btn) btn.disabled = false; }
  }

  function main() {
    const entries = Object.entries(registry.tokens);
    const nameIn = h('input', { class: 'input grow', placeholder: 'Name (z.B. Mattes)' });
    const tokenIn = h('input', { class: 'input grow', placeholder: cfg.mode === 'github' ? 'Deren github_pat_… hier einfügen' : 'Token (oder generieren)' });
    const genBtn = h('button', { class: 'btn ghost sm', style: 'flex:none' }, '🎲 Generieren');
    genBtn.addEventListener('click', () => { tokenIn.value = randomToken(); });
    const out = h('div', { class: 'small', style: 'min-height:18px;word-break:break-all' });
    const regBtn = h('button', { class: 'btn block' }, 'Zugang registrieren');
    regBtn.addEventListener('click', async () => {
      const name = nameIn.value.trim(); const token = tokenIn.value.trim();
      if (!name || !token) { UI.toast('Name und Token angeben.', true); return; }
      const hash = await API.sha256(token);
      registry.tokens[hash] = { name, active: true, created: new Date().toISOString().slice(0, 10) };
      out.innerHTML = 'Token für <b>' + name + '</b> — jetzt kopieren und übergeben, es wird nie wieder angezeigt:<br>' +
        '<b style="color:var(--acid)">' + token + '</b>';
      try { await navigator.clipboard.writeText(token); UI.toast('Token in der Zwischenablage'); } catch (e) { /* egal */ }
      nameIn.value = ''; tokenIn.value = '';
      await commitRegistry('Zugang für ' + name + ' registriert', regBtn);
    });

    UI.clear(body).append(h('div', { class: 'section stack', style: 'padding-top:6px' },
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow acid' }, 'NEUER ZUGANG'),
        cfg.mode === 'github'
          ? h('p', { class: 'small muted' }, '1) In deinem GitHub-Account ein weiteres Fine-grained PAT anlegen (nur dieses Repo, Contents: Read/Write, Name = Person). 2) Hier mit Namen registrieren. 3) Token der Person schicken. Sperren geht jederzeit hier + in GitHub widerrufen.')
          : h('p', { class: 'small muted' }, 'Token generieren, mit Namen registrieren, der Person schicken. Der Worker prüft es gegen tokens.json — GitHub-Zugang hat nur der Worker.'),
        h('div', { class: 'field' }, h('label', null, 'Name'), nameIn),
        h('div', { class: 'field' }, h('label', null, 'Token'),
          h('div', { class: 'hstack' }, tokenIn, cfg.mode === 'worker' ? genBtn : null)),
        regBtn, out),
      h('div', { class: 'card stack' },
        h('div', { class: 'eyebrow' }, 'REGISTRIERTE ZUGÄNGE · ' + entries.length),
        entries.length ? entries.map(([hash, e]) => h('div', { class: 'between' },
          h('div', null,
            h('div', { class: 'small', style: 'font-weight:600;opacity:' + (e.active === false ? '.45' : '1') },
              e.name + (e.active === false ? ' — gesperrt' : '')),
            h('div', { class: 'small muted', style: 'font-size:9.5px;font-family:var(--mono)' }, hash.slice(0, 16) + '… · seit ' + (e.created || '?'))),
          h('div', { class: 'hstack', style: 'gap:6px' },
            h('button', {
              class: 'chip', onclick: () => {
                registry.tokens[hash].active = e.active === false;
                commitRegistry('Zugang ' + e.name + (e.active === false ? ' entsperrt' : ' gesperrt'));
              }
            }, e.active === false ? '↩︎ Entsperren' : '🚫 Sperren'),
            h('button', {
              class: 'chip', onclick: () => {
                if (!window.confirm('Zugang von ' + e.name + ' endgültig löschen?')) return;
                delete registry.tokens[hash];
                commitRegistry('Zugang ' + e.name + ' gelöscht');
              }
            }, '🗑'))))
          : h('div', { class: 'small muted' }, 'Noch keine Zugänge registriert.')),
      h('div', { class: 'small muted center' },
        'Wichtig (Modus github): Sperren hier blockt nur die App. Das GitHub-PAT der Person zusätzlich unter github.com → Settings → Developer settings widerrufen.'),
      h('div', { class: 'center' },
        h('button', { class: 'chip', onclick: () => { sessionStorage.removeItem('spieleaffen.owner'); ownerToken = ''; gate(); } }, 'Abmelden'))));
  }

  if (ownerToken) {
    try { await loadRegistry(); main(); } catch (e) { gate(); }
  } else gate();
})();
