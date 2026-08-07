# Supercell API relay (one-time setup, ~10 minutes)

Supercell's APIs can't be called from a public web page: they send no CORS
headers and every token is pinned to fixed IP addresses — so a token embedded
in the site would both fail and be public. This tiny relay holds your tokens
server-side and adds CORS, so the analyzers only need a **player tag**.

## Steps

1. **Create the API tokens** (both free):
   - Clash of Clans: <https://developer.clashofclans.com> → My Account →
     Create New Key → allowed IP address: `45.79.218.79`
   - Clash Royale: <https://developer.clashroyale.com> → same, allowed IP
     `45.79.218.79`

   That IP is the [RoyaleAPI developer proxy](https://docs.royaleapi.com/proxy.html),
   which the worker calls so the token works from Cloudflare's changing IPs.

2. **Deploy the worker**: <https://dash.cloudflare.com> → Workers & Pages →
   Create Worker → paste the contents of [`worker.js`](worker.js) → Deploy.

3. **Add the secrets**: worker → Settings → Variables and Secrets →
   add `COC_TOKEN` and `CR_TOKEN` (type *Secret*) with the tokens from step 1.

4. **Connect the tools**: open the analyzers' *Import / Export* tab and paste
   your worker URL (e.g. `https://something.your-name.workers.dev`) into the
   *Relay URL* field — it's remembered. From then on: enter a tag → Fetch.

The worker caches responses for 5 minutes and relays only
`/coc/players/TAG` and `/cr/players/TAG` — nothing else.
