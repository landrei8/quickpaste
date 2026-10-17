# QuickPaste

A pastebin-style website with an Apple-inspired design. It's a static site (plain HTML, CSS and JS, no build step) that runs on GitHub Pages and stores pastes in Supabase.

**Features:** syntax highlighting with Xcode colors, auto language detection, expiration times, public and unlisted pastes, burn after reading, a list of recent pastes, copy/raw/download/fork actions, drag and drop for files, an auto-saved draft, ⌘/Ctrl + Enter to create, and automatic light and dark mode.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste in all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon** (or **publishable**) key.
4. Put both values into [`config.js`](config.js).

The anon key is safe to make public. The `pastes` table has Row Level Security on and no policies, so the key can only call the three functions `create_paste`, `get_paste` and `recent_pastes`. Never put the `service_role` or secret key in this project.

Optional: to delete expired rows automatically, enable the `pg_cron` extension and run the `cron.schedule` snippet at the bottom of `schema.sql`. Expired pastes are hidden either way.

## 2. Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. Until `config.js` is filled in, the site runs in **Demo** mode and saves pastes only in your browser.

## 3. Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to it.
2. On GitHub, open **Settings → Pages**, set **Source** to "Deploy from a branch", and choose `main` with the `/ (root)` folder.
3. Your site will be live at `https://<username>.github.io/<repo>/`.

Paste links look like `https://<username>.github.io/<repo>/#/aB3dE5fG7h`. Hash-based routing means GitHub Pages needs no extra configuration.

## Project structure

```
index.html            App shell
config.js             Supabase URL + public key
assets/styles.css     Design system and animations
assets/app.js         Router, views, Supabase API
assets/icon.svg       App icon
supabase/schema.sql   Table, security and RPC functions
```

## Notes

- Maximum paste size is 500 KB.
- There is no rate limiting. If spam becomes a problem, add Cloudflare Turnstile or put an Edge Function in front of `create_paste`.
- Burn-after-read pastes are deleted the moment they are fetched. The creator can still see theirs right after creating it, because the app keeps it in memory.
