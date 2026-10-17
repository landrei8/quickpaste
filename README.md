# QuickPaste

A pastebin-style website with an Apple-inspired design. It's a static site (plain HTML, CSS and JS, no build step) that runs on GitHub Pages and stores pastes in Supabase. Pastes are **end-to-end encrypted** in the browser.

**Features**

- **Pastes:** syntax highlighting with Xcode colors, live highlighting while you type, and auto language detection
- **Options:** public, unlisted or private; expiration times; password protection; burn after reading
- **Encryption:** every unlisted, private or password-protected paste is encrypted before it leaves your browser
- **Accounts:** custom links (5 per account by default), private pastes, and **My Pastes**, where you can open, share, edit or delete everything you created
- **Reports and admin:** anyone can report a paste. Admins get a dashboard for reports, pastes, users and custom-link limits.
- Automatic light and dark mode, and a layout that works on phones

## How the encryption works ("the link is the key")

The link is everything after `#/` (a random 12 characters, or a custom word like `claudetest`). Your browser turns it into two separate values with PBKDF2 (300,000 rounds) and HKDF:

- a **lookup id**, which is stored as the row id in Supabase
- an **AES-256-GCM key**, which never leaves the browser

The title, text and language are encrypted with that key. So the database only ever contains scrambled bytes plus the lookup id, and neither of those reveals the link or the content. Because everything after `#` is never sent to any server, GitHub and Supabase never see the link either.

With a paste password, a second PBKDF2 (600,000 rounds) over the password produces a second key half and a login token. The server stores only a bcrypt hash of that token, so it can refuse wrong passwords. It never sees the password itself.

**Who can read what**

| Paste type | Stored as | Who can read it |
|---|---|---|
| Unlisted | encrypted | only people with the link |
| Private | encrypted | only you, and only while signed in |
| Any paste with a password | encrypted | only people with the link **and** the password |
| Public, no password | readable | everyone, because it's listed in Recent |
| Created before encryption | readable | as before. Duplicate it to get an encrypted copy. |

**My Pastes.** Your links are stored encrypted with a random "vault" key. That vault key is itself encrypted with your account password (600,000 rounds of PBKDF2) inside your browser. On a new device you type your password once to unlock the list.

**Reports.** A report sends the paste's link to the admins (and its password, if the reporter chooses to include it), so admins can decrypt that one paste. They can't read any other encrypted paste.

**Limits worth knowing**

- A custom link is also the paste's key. A word like `claudetest` is easy to guess, so anyone who guesses it can read that paste. Random links can't realistically be guessed.
- Your account password unlocks your list of links. If it's ever reset, links saved before the reset can't be shown in My Pastes anymore. The pastes still work for anyone who has the link.
- The custom-link limit is enforced by the app and the database. Because the server never sees links, a technical user calling the API directly could store extra lookup ids without marking them as custom.
- When you sign in, Supabase's login service briefly receives your account password. That's how all logins work. Supabase stores only a hash of it.

## Code integrity: nothing loads from outside servers

The encryption only helps if the code doing it can be trusted, so the site runs code from this repository only:

- **Self-hosted libraries.** highlight.js and supabase-js live in [`assets/vendor/`](assets/vendor/VENDOR.md). Each was verified byte-for-byte against an independent official source: the highlight.js GitHub release and the npm registry tarball.
- **Integrity hashes.** `index.html` pins both files with SHA-384 Subresource Integrity, so the browser refuses to run them if even one byte changes.
- **Content Security Policy.** A `<meta>` tag lets the page run only this site's own scripts, and send data only to this site and your Supabase project. Even injected code couldn't load other scripts or send pastes anywhere else. If you change `supabaseUrl` in `config.js`, update `connect-src` in that tag too.

What's left to protect is your GitHub account (use 2-step verification or a passkey, and add no collaborators you don't fully trust), your own computer, and the visitor's device. Also make sure **Settings → Pages → Enforce HTTPS** is ticked.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste in all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. You can re-run it safely whenever the file changes, and existing pastes are kept.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon** (or **publishable**) key.
4. Put both values into [`config.js`](config.js), and put the same Project URL into `connect-src` in the Content-Security-Policy tag at the top of [`index.html`](index.html).

The anon key is safe to make public. Every table has Row Level Security on and no policies, so the key can only call the functions in `schema.sql`. Those functions check ownership and admin rights themselves. Never put the `service_role` or secret key in this project.

Optional: to delete expired rows automatically, enable the `pg_cron` extension and run the `cron.schedule` snippet at the bottom of `schema.sql`. Expired pastes are hidden either way.

## 2. Set up accounts (Supabase Auth)

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to your GitHub Pages address, for example `https://<username>.github.io/<repo>/`.
3. Add the same address under **Redirect URLs**.

**Email confirmation:** by default, new users must click a link in an email before they can sign in. Supabase's built-in email service only sends a few emails per hour. Either add your own email provider under **Authentication → Emails → SMTP Settings**, or turn off **Confirm email** under **Authentication → Sign In / Providers → Email**.

## 3. Make yourself an admin

Sign up on your site first, then run this in the Supabase SQL Editor with your email:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'you@example.com';
```

Refresh the site, and an **Admin** link appears in the top bar (on phones it's in the account menu). From the dashboard you can:

- **Reports:** review reported pastes, make them private, delete them, or resolve or dismiss the report
- **Pastes:** search all pastes, change their visibility, or delete them. Encrypted pastes show only metadata.
- **Users:** see accounts, set a personal custom-link limit, reset it to the default, or delete a user along with all of their pastes
- **Settings:** change the default custom-link limit for everyone (starts at 5)

To remove an admin: `delete from public.admins where user_id = (select id from auth.users where email = 'them@example.com');`

## 4. Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to it.
2. On GitHub, open **Settings → Pages**, set **Source** to "Deploy from a branch", and choose `main` with the `/ (root)` folder.
3. Your site will be live at `https://<username>.github.io/<repo>/`.

Encryption needs HTTPS (GitHub Pages provides it) or `localhost`. Until `config.js` is filled in, the site runs in **Demo** mode and keeps everything in your browser. In Demo mode, the first account you create becomes an admin, so you can try the dashboard.

## Project structure

```
index.html            App shell
config.js             Supabase URL + public key
assets/styles.css     Design system and animations
assets/app.js         Router, views, encryption, accounts, admin, Supabase API
assets/icon.svg       App icon
assets/vendor/        Self-hosted, verified highlight.js and supabase-js (see VENDOR.md)
supabase/schema.sql   Tables, security and RPC functions
```

## Notes

- Maximum paste size is 500 KB.
- Pastes created while signed out have no owner, so nobody can edit them later.
- As the owner, you can open your own pastes without burning them, even after they expire. Nobody else can see an expired or private paste.
- There is no rate limiting. If spam becomes a problem, add Cloudflare Turnstile or put an Edge Function in front of `create_paste`.
- There's no "forgot password" flow yet.
