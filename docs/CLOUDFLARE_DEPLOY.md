# Deploying to Cloudflare Workers (OpenNext)

The app is hosted on Cloudflare Workers through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare/get-started).
Supabase is unchanged: same project, same database, same auth.

- Worker name: `rawana-pos` (see `wrangler.jsonc`)
- Production domain: `pos.hotelrawana.com`
- Worker bundle size: ~9.7 MiB uncompressed, **~2.0 MiB gzip**, which fits the Workers Free plan (3 MiB limit)

## Environment variables

The app reads three variables. There are no other `process.env` reads, no `VERCEL_*` usage and no cron jobs.

| Variable | Kind | Where to set it in Cloudflare | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public, inlined at build time | **Build variable** (Settings → Build → Variables and secrets) **and** runtime variable | e.g. `https://<project>.supabase.co`. `next build` bakes `NEXT_PUBLIC_*` into the JS bundle, so it **must** exist during the build. The server code (`admin.ts`, middleware) also reads it, so add it as a runtime variable too. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public, inlined at build time | **Build variable** **and** runtime variable | Supabase anon key. Safe to expose because RLS protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret**, runtime only | **Runtime secret** (Settings → Variables and secrets → type *Secret*) | Used only by server actions in `/settings/users`. Never prefix it with `NEXT_PUBLIC_` and do not add it as a build variable. |
| `NODE_VERSION` | Build only | Build variable | Set to `22`. |

CLI equivalent for the runtime secret:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

For local `npm run preview`, put the same three variables in `.env.local` (Next.js build) and `.dev.vars` (Worker runtime). Both files are git-ignored.

## Cloudflare dashboard setup (Workers Builds)

1. **Workers & Pages → Create → Import a repository** → `soheilycreations/hotelsystem`.
2. Build settings:
   - Production branch: `main`
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx wrangler deploy`
   - Non-production branch deploy command (optional): `npx wrangler versions upload`
   - Root directory: `/`
   - Build variables: `NODE_VERSION=22`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Worker runtime variables (Settings → Variables and secrets): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (plain text), `SUPABASE_SERVICE_ROLE_KEY` (Secret).
4. The Worker name in the dashboard must be `rawana-pos`, matching `wrangler.jsonc`. The `WORKER_SELF_REFERENCE` service binding points at that name.
5. **Custom domain:** Settings → Domains & Routes → Add → Custom domain → `pos.hotelrawana.com`. The `hotelrawana.com` zone must be on Cloudflare DNS. Remove the old Vercel CNAME/A record for `pos` first, or Cloudflare will refuse to add the domain.
6. Supabase → Authentication → URL Configuration: make sure `https://pos.hotelrawana.com` is the Site URL. Login is email + password, so no redirect URL changes are needed.

Manual deploy from a laptop (needs `npx wrangler login`):

```bash
npm ci
npm run deploy      # opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

## What changed in the code

- Added `@opennextjs/cloudflare` and `wrangler`, plus the scripts `preview`, `deploy`, `upload` and `cf-typegen`. `npm run build` is still `next build`.
- Added `wrangler.jsonc` and `open-next.config.ts` (default cache, no R2).
- `next.config.ts` calls `initOpenNextCloudflareForDev()`.
- Added `public/_headers`, which gives `/_next/static/*` a one-year immutable cache.
- `.open-next`, `.wrangler`, `.dev.vars` and `cloudflare-env.d.ts` are git-ignored.

Vercel audit: the repo had no `vercel.json`, crons, `@vercel/analytics`, `@vercel/speed-insights`, `maxDuration` exports, `runtime = "edge"`, `VERCEL_*` env usage, `next/image` usage or runtime `fs` reads. Middleware runs on the default runtime. Next.js is on 15.5.x.

Caching: every page is `force-dynamic`. The app only calls `revalidatePath()` after server actions and has no ISR or `revalidate` exports, so it does not need the R2 incremental cache.

## Rollback

1. **Bad Worker deploy:** go to Workers & Pages → `rawana-pos` → Deployments, pick the previous version and choose **Rollback**. From the CLI: `npx wrangler deployments list`, then `npx wrangler rollback <version-id>`.
2. **Bad commit on `main`:** revert it on GitHub (`git revert <sha>` and push). Workers Builds will redeploy automatically.
3. **Move back to Vercel** (only once the Vercel account is reactivated):
   1. In Cloudflare, remove the `pos.hotelrawana.com` custom domain from the Worker.
   2. Re-create the DNS record Vercel asks for (`CNAME pos → cname.vercel-dns.com`, set to *DNS only*, grey cloud).
   3. Redeploy on Vercel. Leaving the OpenNext files in the repo is harmless because Vercel ignores `wrangler.jsonc` and `open-next.config.ts`.
