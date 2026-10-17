# QuickPaste

A pastebin-style website with an Apple-inspired design. It's a static site (plain HTML, CSS and JS, no build step) that runs on GitHub Pages and stores pastes in Supabase.

**Features**

- **Pastes:** syntax highlighting with Xcode colors, live highlighting while you type, and auto language detection
- **Options:** expiration times, public or unlisted, password protection, and burn after reading
- **Sharing:** a list of recent pastes, plus copy, share, raw, download and duplicate actions
- **Editor:** drag and drop for files, an auto-saved draft, and ⌘/Ctrl + Enter to create
- **Accounts:** email and password sign-in. **My Pastes** lists everything you created while signed in, and you can open, share, edit or delete any of it. Editing changes the text and every option, and the link stays the same.
- Automatic light and dark mode

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste in all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. You can re-run it safely whenever the file changes, and existing pastes are kept.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon** (or **publishable**) key.
4. Put both values into [`config.js`](config.js).

The anon key is safe to make public. The `pastes` table has Row Level Security on and no policies, so the key can only call the functions in `schema.sql`. Those functions only let a signed-in user list, edit or delete their own pastes. Never put the `service_role` or secret key in this project.

Optional: to delete expired rows automatically, enable the `pg_cron` extension and run the `cron.schedule` snippet at the bottom of `schema.sql`. Expired pastes are hidden either way.

## 2. Set up accounts (Supabase Auth)

Email and password sign-in is turned on by default in new Supabase projects. You only need to tell Supabase where your site lives, so the confirmation links in sign-up emails point to the right place:

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to your GitHub Pages address, for example `https://<username>.github.io/<repo>/`.
3. Add the same address under **Redirect URLs**.

**Email confirmation:** by default, a new user has to click a link in an email before they can sign in. Supabase's built-in email service only sends a few emails per hour, which is fine for testing but not for real traffic. You have two options:

- Add your own email provider under **Authentication → Emails → SMTP Settings**.
- Turn off **Confirm email** in **Authentication → Sign In / Providers → Email**, so accounts work immediately.

## 3. Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. Until `config.js` is filled in, the site runs in **Demo** mode and saves pastes and accounts only in your browser.

## 4. Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to it.
2. On GitHub, open **Settings → Pages**, set **Source** to "Deploy from a branch", and choose `main` with the `/ (root)` folder.
3. Your site will be live at `https://<username>.github.io/<repo>/`.

Paste links look like `https://<username>.github.io/<repo>/#/aB3dE5fG7h`. Hash-based routing means GitHub Pages needs no extra configuration.

## Project structure

```
index.html            App shell
config.js             Supabase URL + public key
assets/styles.css     Design system and animations
assets/app.js         Router, views, accounts, Supabase API
assets/icon.svg       App icon
supabase/schema.sql   Table, security and RPC functions
```

## Notes

- Maximum paste size is 500 KB.
- Pastes created while signed out have no owner, so nobody can edit them later.
- As the owner, you can open your own pastes without entering their password and without burning them, even after they expire. Nobody else can see an expired paste.
- There is no rate limiting. If spam becomes a problem, add Cloudflare Turnstile or put an Edge Function in front of `create_paste`.
- Paste passwords are stored only as bcrypt hashes and checked inside the database. There is no limit on how many guesses someone can make, so use a strong password for anything sensitive.
- Burn-after-read pastes are deleted the first time someone other than the owner opens them.
- There's no "forgot password" flow yet.
