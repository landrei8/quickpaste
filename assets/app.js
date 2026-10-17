(() => {
  'use strict';

  // ───────── Config & constants ─────────

  const cfg = window.QUICKPASTE_CONFIG || {};
  const SUPABASE_URL = (cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const SUPABASE_KEY = (cfg.supabaseKey || '').trim();
  const isConfigured = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY && !/YOUR_/.test(SUPABASE_URL + SUPABASE_KEY);

  const MAX_CHARS = 512000;
  const HIGHLIGHT_LIMIT = 200000;
  const EDITOR_HIGHLIGHT_LIMIT = 100000;
  const MIN_PASSWORD = 6;
  const DRAFT_KEY = 'quickpaste:draft';
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const LANGUAGES = [
    ['auto', 'Auto-detect'], ['plaintext', 'Plain Text'], ['bash', 'Bash'], ['c', 'C'],
    ['cpp', 'C++'], ['csharp', 'C#'], ['css', 'CSS'], ['diff', 'Diff'], ['go', 'Go'],
    ['graphql', 'GraphQL'], ['xml', 'HTML / XML'], ['ini', 'INI / TOML'], ['java', 'Java'],
    ['javascript', 'JavaScript'], ['json', 'JSON'], ['kotlin', 'Kotlin'], ['less', 'Less'],
    ['lua', 'Lua'], ['makefile', 'Makefile'], ['markdown', 'Markdown'], ['objectivec', 'Objective-C'],
    ['perl', 'Perl'], ['php', 'PHP'], ['python', 'Python'], ['r', 'R'], ['ruby', 'Ruby'],
    ['rust', 'Rust'], ['scss', 'SCSS'], ['shell', 'Shell Session'], ['sql', 'SQL'],
    ['swift', 'Swift'], ['typescript', 'TypeScript'], ['yaml', 'YAML'],
  ];
  const LANG_NAME = Object.fromEntries(LANGUAGES);

  const EXT_TO_LANG = {
    sh: 'bash', zsh: 'bash', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
    css: 'css', diff: 'diff', patch: 'diff', go: 'go', graphql: 'graphql', gql: 'graphql',
    html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', ini: 'ini', toml: 'ini', cfg: 'ini',
    java: 'java', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    json: 'json', kt: 'kotlin', kts: 'kotlin', less: 'less', lua: 'lua', mk: 'makefile',
    md: 'markdown', markdown: 'markdown', m: 'objectivec', pl: 'perl', php: 'php', py: 'python',
    r: 'r', rb: 'ruby', rs: 'rust', scss: 'scss', sql: 'sql', swift: 'swift', ts: 'typescript',
    tsx: 'typescript', yml: 'yaml', yaml: 'yaml', txt: 'plaintext', log: 'plaintext',
  };
  const LANG_TO_EXT = {
    bash: 'sh', c: 'c', cpp: 'cpp', csharp: 'cs', css: 'css', diff: 'diff', go: 'go', graphql: 'graphql',
    xml: 'html', ini: 'ini', java: 'java', javascript: 'js', json: 'json', kotlin: 'kt', less: 'less',
    lua: 'lua', makefile: 'mk', markdown: 'md', objectivec: 'm', perl: 'pl', php: 'php', python: 'py',
    r: 'r', ruby: 'rb', rust: 'rs', scss: 'scss', shell: 'sh', sql: 'sql', swift: 'swift',
    typescript: 'ts', yaml: 'yml',
  };
  const BADGE_COLORS = ['#0a84ff', '#5e5ce6', '#ff9500', '#34c759', '#ff2d55', '#af52de', '#30b0c7', '#ff6b22', '#a2845e'];

  const EXPIRATIONS = [
    ['', 'Never'], ['600', '10 Minutes'], ['3600', '1 Hour'], ['86400', '1 Day'],
    ['604800', '1 Week'], ['2592000', '1 Month'],
  ];

  // SF Symbols–style line icons
  const ICONS = {
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.6"/><path d="M15.5 8.5V6.6A2.6 2.6 0 0 0 12.9 4H6.6A2.6 2.6 0 0 0 4 6.6v6.3a2.6 2.6 0 0 0 2.6 2.6h1.9"/>',
    duplicate: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.6"/><path d="M15.5 8.5V6.6A2.6 2.6 0 0 0 12.9 4H6.6A2.6 2.6 0 0 0 4 6.6v6.3a2.6 2.6 0 0 0 2.6 2.6h1.9M14.25 11.5v5.5M11.5 14.25H17"/>',
    link: '<path d="M10.2 13.8a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.2 1.2"/><path d="M13.8 10.2a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.2-1.2"/>',
    share: '<path d="M12 14.5v-11M8 7.5l4-4 4 4"/><path d="M8.5 10.5h-2A1.5 1.5 0 0 0 5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5h-2"/>',
    doc: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>',
    download: '<path d="M12 4v11.5M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
    pencil: '<path d="M4 20h4L19.3 8.7a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7M6.5 6.5l.8 12.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8l.8-12.2M10 10.5v6M14 10.5v6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    flame: '<path d="M12 21c-3.9 0-7-2.7-7-6.4 0-2.7 1.5-4.7 3.1-6.1.3 1.6 1 2.8 2.2 3.4C10.1 8.5 11.7 5.3 14 3c.3 3 1.6 4.6 3 6.2 1.3 1.5 2 3.1 2 5.3 0 3.8-3.1 6.5-7 6.5z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 2.5h4"/>',
    lines: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    tray: '<path d="M3.5 13.5 6 5.5h12l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
    key: '<circle cx="8" cy="15.5" r="4.5"/><path d="m11.2 12.3 8.3-8.3M16.5 7l2.5 2.5M14 9.5l2 2"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    logout: '<path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7"/><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5"/>',
    person: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  // ───────── Helpers ─────────

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = (markup) => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content; };

  // localStorage with an in-memory fallback for when it is blocked
  const memory = new Map();
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { memory.set(k, v); } },
    del(k) { try { localStorage.removeItem(k); } catch { memory.delete(k); } },
  };

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  const byteLength = (s) => new Blob([s]).size;
  const lineCount = (s) => (s ? s.split('\n').length : 1);
  const plural = (n, word) => `${Number(n).toLocaleString()} ${word}${Number(n) === 1 ? '' : 's'}`;
  const isExpired = (p) => !!p.expires_at && new Date(p.expires_at) <= new Date();

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }); // match the English UI
  function relativeTime(date) {
    const diff = (new Date(date).getTime() - Date.now()) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, secs] of units) {
      // 1% slack so "expires in 1 hour" doesn't show as "60 minutes" a second later
      if (Math.abs(diff) >= secs * 0.99) return rtf.format(Math.round(diff / secs), unit);
    }
    return diff > 0 ? 'in a moment' : 'just now';
  }

  function randomId(len = 10) {
    const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  // Demo mode only — real passwords are handled by Supabase / bcrypt in Postgres.
  async function sha256(text) {
    if (!crypto.subtle) return text;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const pasteUrl = (id) => `${location.origin}${location.pathname}#/${id}`;

  async function sharePaste(p) {
    const url = pasteUrl(p.id);
    if (navigator.share) {
      try {
        await navigator.share({ title: p.title || 'QuickPaste', url });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    toast((await copyText(url)) ? 'Link copied' : 'Couldn’t copy link');
  }

  // Wait for a Web Animation, but never longer than `ms` — background tabs may pause animations.
  const settle = (animation, ms) => Promise.race([
    animation.finished.catch(() => {}),
    new Promise((r) => setTimeout(r, ms)),
  ]);

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth; // restart animation
    el.classList.add('shake');
  }

  function langBadge(lang) {
    const ext = (LANG_TO_EXT[lang] || 'txt').toUpperCase().slice(0, 4);
    const hash = [...(lang || 'plaintext')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const color = lang && lang !== 'plaintext' ? BADGE_COLORS[hash % BADGE_COLORS.length] : '#8e8e93';
    return `<span class="lang-badge" style="--c:${color}">${esc(ext)}</span>`;
  }

  // ───────── Toasts & dialogs ─────────

  function toast(message, type = 'success') {
    const host = $('#toasts');
    const el = html(`<div class="toast ${type}" role="status">${icon(type === 'error' ? 'warn' : 'check')}<span>${esc(message)}</span></div>`).firstElementChild;
    host.appendChild(el);
    while (host.children.length > 3) host.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, type === 'error' ? 4200 : 2600);
  }

  function confirmDialog({ title, message, confirmLabel = 'OK', destructive = false }) {
    return new Promise((resolve) => {
      const el = html(`
        <div class="dialog-backdrop">
          <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-msg">
            <h2 id="dialog-title">${esc(title)}</h2>
            <p id="dialog-msg">${esc(message)}</p>
            <div class="dialog-actions">
              <button class="btn" type="button" data-v="0">Cancel</button>
              <button class="btn ${destructive ? 'destructive' : 'primary'}" type="button" data-v="1">${esc(confirmLabel)}</button>
            </div>
          </div>
        </div>`).firstElementChild;
      const previous = document.activeElement;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('open'));
      $('[data-v="0"]', el).focus();

      const close = (value) => {
        document.removeEventListener('keydown', onKey);
        el.classList.remove('open');
        setTimeout(() => el.remove(), 260);
        previous?.focus?.({ preventScroll: true });
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Tab') { // keep focus inside the dialog
          const buttons = [...el.querySelectorAll('button')];
          const i = buttons.indexOf(document.activeElement);
          e.preventDefault();
          buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
        }
      };
      document.addEventListener('keydown', onKey);
      el.addEventListener('click', (e) => {
        if (e.target === el) return close(false);
        const b = e.target.closest('[data-v]');
        if (b) close(b.dataset.v === '1');
      });
    });
  }

  // ───────── Backends ─────────
  // Both expose the same interface: pastes (create/get/getOwn/recent/mine/update/remove)
  // and auth (init/signIn/signUp/signOut).

  function friendlyError(message = '') {
    if (/failed to fetch|networkerror|load failed/i.test(message)) return 'Can’t reach the server. Check your connection.';
    if (/invalid login credentials/i.test(message)) return 'Incorrect email or password';
    if (/email not confirmed/i.test(message)) return 'Confirm your email first — check your inbox';
    if (/already registered|already exists/i.test(message)) return 'An account with this email already exists';
    if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a moment and try again.';
    return message || 'Something went wrong';
  }

  function createSupabaseBackend() {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const rpc = async (fn, args = {}) => {
      let result;
      try {
        result = await client.rpc(fn, args);
      } catch (err) {
        throw new Error(friendlyError(err?.message));
      }
      if (result.error) throw new Error(friendlyError(result.error.message));
      return result.data;
    };
    const authCall = async (promise) => {
      const { data, error } = await promise;
      if (error) throw new Error(friendlyError(error.message));
      return data;
    };

    return {
      create: (p) => rpc('create_paste', {
        p_title: p.title, p_content: p.content, p_language: p.language,
        p_visibility: p.visibility, p_expires_in: p.expiresIn, p_burn: p.burn,
        p_password: p.password || null,
      }),
      get: (id, password) => rpc('get_paste', { p_id: id, p_password: password || null }),
      getOwn: (id) => rpc('get_own_paste', { p_id: id }),
      recent: () => rpc('recent_pastes', { p_limit: 30 }),
      mine: () => rpc('my_pastes'),
      update: (id, p) => rpc('update_paste', {
        p_id: id, p_title: p.title, p_content: p.content, p_language: p.language,
        p_visibility: p.visibility, p_burn: p.burn, p_change_expiry: p.changeExpiry,
        p_expires_in: p.expiresIn, p_password_mode: p.passwordMode, p_password: p.password || null,
      }),
      remove: (id) => rpc('delete_paste', { p_id: id }),

      auth: {
        async init(onChange) {
          // Email confirmation links come back as ?code=… (PKCE). supabase-js
          // exchanges it during getSession(); afterwards tidy the URL.
          const params = new URLSearchParams(location.search);
          const hashError = /^#error/.test(location.hash) ? new URLSearchParams(location.hash.slice(1)) : null;
          const fromEmail = params.has('code');
          let user = null;
          try {
            const { data } = await client.auth.getSession();
            user = data.session?.user ?? null;
          } catch { /* treat as signed out */ }
          client.auth.onAuthStateChange((_event, session) => {
            // Don't call Supabase from inside this callback; just schedule the UI update.
            setTimeout(() => onChange(session?.user ?? null), 0);
          });
          if (params.toString() || hashError) {
            history.replaceState(null, '', location.pathname + (hashError ? '#/' : location.hash));
          }
          let notice = null;
          const error = params.get('error_description') || hashError?.get('error_description');
          if (error) notice = { type: 'error', text: error.replace(/\+/g, ' ') };
          else if (fromEmail && user) notice = { type: 'success', text: 'Email confirmed — you’re signed in' };
          else if (fromEmail) notice = { type: 'error', text: 'That link is invalid or has expired' };
          return { user, notice };
        },
        async signIn(email, password) {
          const data = await authCall(client.auth.signInWithPassword({ email, password }));
          return data.user;
        },
        async signUp(email, password) {
          const data = await authCall(client.auth.signUp({
            email, password, options: { emailRedirectTo: location.origin + location.pathname },
          }));
          return { user: data.session ? data.user : null, needsConfirmation: !data.session };
        },
        async signOut() {
          await client.auth.signOut();
        },
      },
    };
  }

  // Used until config.js is filled in: everything lives in this browser only.
  function createDemoBackend() {
    const PASTES = 'quickpaste:demo-pastes';
    const USERS = 'quickpaste:demo-users';
    const SESSION = 'quickpaste:demo-session';
    const read = (k, fallback) => { try { return JSON.parse(storage.get(k)) ?? fallback; } catch { return fallback; } };
    const write = (k, v) => storage.set(k, JSON.stringify(v));
    let user = read(SESSION, null);
    let notify = () => {};
    const setUser = (u) => {
      user = u;
      if (u) write(SESSION, u); else storage.del(SESSION);
      notify(u);
    };

    const isOwner = (p) => !!user && p.owner_id === user.id;
    const toJson = (p) => {
      const { password_hash, owner_id, ...rest } = p;
      return { ...rest, has_password: !!password_hash, is_owner: isOwner(p) };
    };
    const expiry = (secs) => (secs ? new Date(Date.now() + secs * 1000).toISOString() : null);
    const owned = (id) => {
      const all = read(PASTES, {});
      if (!user) throw new Error('Sign in to manage pastes');
      if (!all[id] || !isOwner(all[id])) throw new Error('Paste not found');
      return all;
    };

    return {
      async create(p) {
        const all = read(PASTES, {});
        const id = randomId();
        all[id] = {
          id, title: p.title, content: p.content, language: p.language, visibility: p.visibility,
          burn_after_read: p.burn, views: 0, created_at: new Date().toISOString(), updated_at: null,
          expires_at: expiry(p.expiresIn), password_hash: p.password ? await sha256(p.password) : null,
          owner_id: user?.id ?? null,
        };
        write(PASTES, all);
        return id;
      },
      async get(id, password) {
        const all = read(PASTES, {});
        const p = all[id];
        if (!p) return null;
        if (isOwner(p)) return toJson(p);
        if (isExpired(p)) return null;
        if (p.password_hash) {
          if (!password) return { id, locked: true, wrong_password: false };
          if ((await sha256(password)) !== p.password_hash) return { id, locked: true, wrong_password: true };
        }
        if (p.burn_after_read) delete all[id]; else p.views += 1;
        write(PASTES, all);
        return toJson(p);
      },
      async getOwn(id) {
        const p = read(PASTES, {})[id];
        return p && isOwner(p) ? toJson(p) : null;
      },
      async recent() {
        return Object.values(read(PASTES, {}))
          .filter((p) => !isExpired(p) && p.visibility === 'public' && !p.burn_after_read)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 30)
          .map((p) => ({
            id: p.id, title: p.title, language: p.language, created_at: p.created_at, size: p.content.length,
            locked: !!p.password_hash, preview: p.password_hash ? null : p.content.slice(0, 400),
          }));
      },
      async mine() {
        if (!user) return [];
        return Object.values(read(PASTES, {}))
          .filter(isOwner)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((p) => {
            const { content, password_hash, owner_id, ...rest } = p;
            return { ...rest, size: content.length, has_password: !!password_hash, expired: isExpired(p) };
          });
      },
      async update(id, p) {
        const all = owned(id);
        const rec = all[id];
        if (p.passwordMode === 'set' && !p.password) throw new Error('Enter a new password');
        Object.assign(rec, {
          title: p.title, content: p.content, language: p.language, visibility: p.visibility,
          burn_after_read: p.burn, updated_at: new Date().toISOString(),
        });
        if (p.changeExpiry) rec.expires_at = expiry(p.expiresIn);
        if (p.passwordMode === 'set') rec.password_hash = await sha256(p.password);
        if (p.passwordMode === 'remove') rec.password_hash = null;
        write(PASTES, all);
        return toJson(rec);
      },
      async remove(id) {
        const all = owned(id);
        delete all[id];
        write(PASTES, all);
        return true;
      },

      auth: {
        async init(onChange) {
          notify = onChange;
          return { user, notice: null };
        },
        async signIn(email, password) {
          const u = read(USERS, {})[email.toLowerCase()];
          if (!u || u.hash !== (await sha256(password))) throw new Error('Incorrect email or password');
          const session = { id: u.id, email: u.email };
          setUser(session);
          return session;
        },
        async signUp(email, password) {
          const users = read(USERS, {});
          const key = email.toLowerCase();
          if (users[key]) throw new Error('An account with this email already exists');
          users[key] = { id: crypto.randomUUID?.() || randomId(24), email, hash: await sha256(password) };
          write(USERS, users);
          const session = { id: users[key].id, email };
          setUser(session);
          return { user: session, needsConfirmation: false };
        },
        async signOut() {
          setUser(null);
        },
      },
    };
  }

  const libMissing = isConfigured && !window.supabase?.createClient;
  const api = isConfigured && !libMissing ? createSupabaseBackend() : createDemoBackend();

  // ───────── State ─────────

  let currentUser = null;
  let booted = false;
  // Pastes seen this session — lets a creator view a burn-after-read paste
  // without destroying it, and avoids re-fetching on back/forward.
  const cache = new Map();
  let prefill = null;

  function setUser(user) {
    const changed = (user?.id ?? null) !== (currentUser?.id ?? null);
    currentUser = user;
    renderAccount();
    if (!changed) return;
    cache.clear();
    // Pages that depend on who is signed in get re-rendered.
    if (booted && ['mine', 'edit'].includes(parseRoute().name)) navigate();
  }

  // highlight.js's relevance scoring is unreliable on short snippets (e.g. it
  // calls `const x = "a"; console.log(x)` C++), so clear signatures win first,
  // checked in order, and the scoring is only a fallback.
  const isJson = (s) => { try { JSON.parse(s); return true; } catch { return false; } };
  const SIGNATURES = [
    ['json', (s) => /^[[{]/.test(s) && isJson(s)],
    ['php', (s) => /^<\?php/.test(s)],
    ['xml', (s) => /^<(!doctype|\?xml|[a-z][\w-]*[\s>/])/i.test(s) && /<\/?[a-z][\w-]*[^>]*>/i.test(s)],
    ['bash', (s) => /^#!.*\b(ba|z)?sh\b/.test(s)],
    ['python', (s) => /^#!.*python/.test(s)],
    ['diff', (s) => /^(diff --git|--- \S|\+\+\+ \S|@@ -\d)/m.test(s)],
    ['go', (s) => /^package \w+\s*$/m.test(s) && /\bfunc\b/.test(s)],
    ['rust', (s) => /\bfn \w+\s*[<(]/.test(s) && /\b(let( mut)?|println!|impl|pub fn|use \w+::)/.test(s)],
    ['swift', (s) => /\bimport (SwiftUI|UIKit|Foundation|Combine)\b|\bsome View\b|\bguard let\b|@State\b/.test(s)],
    ['cpp', (s) => /#include\s*[<"]/.test(s) && /\b(std::|cout|cin|class|template|namespace|nullptr)\b/.test(s)],
    ['c', (s) => /#include\s*[<"]/.test(s)],
    ['objectivec', (s) => /#import\s*[<"]|@interface\b|@implementation\b/.test(s)],
    ['csharp', (s) => /\busing System(\.\w+)*;|Console\.Write(Line)?\(|\bnamespace [\w.]+\s*[{;]/.test(s)],
    ['java', (s) => /System\.out\.print|\bimport java\.|public static void main\s*\(String/.test(s)],
    ['kotlin', (s) => /\bfun \w+\s*\(/.test(s) && /\b(val|var) \w+/.test(s)],
    ['python', (s) => /^\s*(def \w+\s*\(.*\)\s*(->.*)?:|class \w+(\(.*\))?:|elif .*:|from [\w.]+ import |import \w+(\s+as \w+)?\s*$)/m.test(s) && !/;\s*$/m.test(s)],
    ['ruby', (s) => /^\s*(def \w+|require ['"]|puts )/m.test(s) && /^\s*end\s*$/m.test(s)],
    ['typescript', (s) => /\b(interface|type) \w+(<[^>]*>)?\s*[={]|:\s*(string|number|boolean|void|any|unknown)(\[\])?\s*[,;=){]|\bas const\b/.test(s)],
    ['javascript', (s) => /\bconsole\.\w+\(|\bdocument\.|\bwindow\.|\brequire\(|module\.exports|=>|\bexport (default|const|function)|\bimport .+ from ['"]|\b(const|let|var) \w+\s*=|\bfunction\s*\w*\s*\(/.test(s)],
    ['sql', (s) => /^\s*(select|insert|update|delete|create|alter|drop|with)\b[\s\S]*\b(from|into|table|set|where|values)\b/im.test(s)],
    ['scss', (s) => /\{/.test(s) && /^\s*\$[\w-]+\s*:|&:[\w-]+|@mixin\b|@include\b/m.test(s)],
    ['css', (s) => /(^|\})\s*[^{}@;=()]+\{\s*[\w-]+\s*:\s*[^;{}]+;?/m.test(s)],
    ['bash', (s) => /^\s*(\$ )?(sudo|echo|cd|export|apt(-get)?|brew|npm|npx|yarn|pip3?|git|curl|wget|chmod|mkdir|ls|rm|cp|mv|docker|for \w+ in)\s/m.test(s)],
    ['yaml', (s) => {
      const lines = s.split('\n').filter((l) => l.trim());
      return lines.length >= 2 && lines.every((l) => /^\s*(#.*|-( .*)?|[\w"'.-][\w "'.-]*:(\s.*)?)$/.test(l));
    }],
    ['markdown', (s) => /^#{1,6} \S/m.test(s) && /(\*\*|__|\[[^\]]+\]\([^)]+\)|^\s*[-*] |^```)/m.test(s)],
  ];

  function detectLanguage(content) {
    const sample = content.slice(0, 20000).trim();
    if (!sample) return 'plaintext';
    const hit = SIGNATURES.find(([, test]) => test(sample));
    if (hit) return hit[0];
    if (!window.hljs) return 'plaintext';
    const subset = LANGUAGES.map(([k]) => k).filter((k) => k !== 'auto' && k !== 'plaintext' && hljs.getLanguage(k));
    const res = hljs.highlightAuto(sample, subset);
    return res.relevance >= 5 && res.language ? res.language : 'plaintext';
  }

  // ───────── View: composer (new paste & edit) ─────────

  function viewComposer(existing = null) {
    const editing = !!existing;
    const draft = editing ? {
      title: existing.title, content: existing.content,
      language: LANG_NAME[existing.language] ? existing.language : 'plaintext',
      visibility: existing.visibility, burn: existing.burn_after_read, expires: 'keep',
    } : prefill || (() => { try { return JSON.parse(storage.get(DRAFT_KEY)) || {}; } catch { return {}; } })();
    prefill = null;

    const langOptions = LANGUAGES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    let expOptions = EXPIRATIONS.map(([v, l]) => `<option value="${v}">${esc(editing && v ? `${l} from now` : l)}</option>`).join('');
    if (editing) {
      const current = !existing.expires_at ? 'Never' : isExpired(existing) ? 'Expired' : `Expires ${relativeTime(existing.expires_at)}`;
      expOptions = `<option value="keep">Keep · ${esc(current)}</option>${expOptions}`;
    }

    const header = editing
      ? `<header class="page-head">
           <p class="eyebrow reveal">Editing</p>
           <h1 class="reveal" style="--d:1">${esc(existing.title || 'Untitled')}</h1>
           <p class="reveal" style="--d:1">Changes are saved to the same link.</p>
         </header>`
      : `<section class="hero">
           <h1 class="reveal">Paste it. <span class="gradient-text">Share it.</span></h1>
           <p class="reveal" style="--d:1">Drop in code or text and get a clean, shareable link in seconds.</p>
         </section>`;

    const accountNote = editing ? '' : currentUser
      ? `<p class="create-note">${icon('person')}<span>Saved to your account · <a href="#/mine">My Pastes</a></span></p>`
      : `<p class="create-note"><span><a href="#/login">Sign in</a> to edit and manage your pastes later.</span></p>`;

    const actions = editing
      ? `<div class="create-bar edit-bar reveal" style="--d:4">
           <a class="btn large" href="#/${esc(existing.id)}">Cancel</a>
           <button class="btn primary large create" type="button"><span class="label">Save Changes</span><span class="spinner"></span></button>
         </div>
         <div class="danger-zone reveal" style="--d:5">
           <button class="text-btn danger delete" type="button">${icon('trash')}<span>Delete Paste</span></button>
         </div>`
      : `<div class="create-bar reveal" style="--d:4">
           <button class="btn primary large create" type="button"><span class="label">Create Paste</span><span class="spinner"></span></button>
         </div>
         ${accountNote}`;

    const page = html(`
      <div class="page ${editing ? 'page-edit' : 'page-new'}">
        ${header}

        <form class="composer card reveal" style="--d:2" novalidate>
          <div class="composer-head">
            <input class="title-input" name="title" placeholder="Untitled" maxlength="120" autocomplete="off" aria-label="Title">
            <label class="select" title="Syntax">
              <select name="language" aria-label="Syntax highlighting">${langOptions}</select>
            </label>
          </div>
          <div class="editor">
            <div class="gutter" aria-hidden="true"><pre>1</pre></div>
            <div class="code-input">
              <pre class="highlight" aria-hidden="true"><code></code></pre>
              <textarea name="content" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"
                placeholder="Paste or type anything — or drop a file here." aria-label="Paste content"></textarea>
            </div>
            <div class="drop-hint">Drop to load file</div>
          </div>
          <div class="composer-foot">
            <span class="stats">0 lines · 0 B</span>
            <span class="hint"><kbd>${isMac ? '⌘' : 'Ctrl'}</kbd><kbd>↵</kbd> to ${editing ? 'save' : 'create'}</span>
          </div>
        </form>

        <h2 class="section-label reveal" style="--d:3">Options</h2>
        <div class="group card reveal" style="--d:3">
          <div class="row">
            <div class="row-label">
              <span class="row-icon" style="background:#0a84ff">${icon('timer')}</span>
              <span class="row-text">Expires<small>Paste is deleted after this time</small></span>
            </div>
            <label class="select"><select name="expires" aria-label="Expiration">${expOptions}</select></label>
          </div>
          <div class="row">
            <div class="row-label">
              <span class="row-icon" style="background:#5e5ce6">${icon('eye')}</span>
              <span class="row-text">Visibility<small>Unlisted pastes are hidden from Recent</small></span>
            </div>
            <div class="segmented" role="radiogroup" aria-label="Visibility" style="--n:2;--i:0">
              <button type="button" role="radio" aria-checked="true" data-value="public">Public</button>
              <button type="button" role="radio" aria-checked="false" data-value="unlisted">Unlisted</button>
            </div>
          </div>
          <div class="row">
            <div class="row-label">
              <span class="row-icon" style="background:#ff9500">${icon('flame')}</span>
              <span class="row-text">Burn after reading<small>Destroyed the first time it’s opened</small></span>
            </div>
            <label class="switch"><input type="checkbox" name="burn" aria-label="Burn after reading"><span></span></label>
          </div>
          <div class="row">
            <div class="row-label">
              <span class="row-icon" style="background:#34c759">${icon('key')}</span>
              <span class="row-text">Password<small>${editing && existing.has_password ? 'Leave empty to keep the current one' : 'Required to open the paste'}</small></span>
            </div>
            <div class="password-field">
              <input type="password" name="password" placeholder="${editing && existing.has_password ? 'Unchanged' : 'None'}" maxlength="200" autocomplete="new-password" aria-label="Password">
              <button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${icon('eye')}</button>
              ${editing && existing.has_password ? '<button type="button" class="pw-remove">Remove</button>' : ''}
            </div>
          </div>
        </div>

        ${actions}
      </div>`).firstElementChild;

    const form = $('form', page);
    const title = form.elements.title;
    const language = form.elements.language;
    const ta = form.elements.content;
    const gutter = $('.gutter pre', page);
    const stats = $('.stats', page);
    const expires = $('select[name=expires]', page);
    const burn = $('input[name=burn]', page);
    const seg = $('.segmented', page);
    const createBtn = $('.create', page);
    const editor = $('.editor', page);
    const hlLayer = $('.highlight', page);
    const hlCode = $('.highlight code', page);
    const autoOption = $('option[value=auto]', language);
    const password = $('input[name=password]', page);
    const pwToggle = $('.pw-toggle', page);
    const pwRemove = $('.pw-remove', page);
    let visibility = 'public';
    let detected = 'plaintext';
    let removePassword = false;

    pwToggle.addEventListener('click', () => {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      pwToggle.setAttribute('aria-pressed', String(show));
      pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    pwRemove?.addEventListener('click', () => {
      removePassword = !removePassword;
      password.value = '';
      password.disabled = removePassword;
      password.placeholder = removePassword ? 'Will be removed' : 'Unchanged';
      pwRemove.textContent = removePassword ? 'Undo' : 'Remove';
      pwRemove.closest('.password-field').classList.toggle('removing', removePassword);
    });

    // Live syntax highlighting: a highlighted <pre> sits behind a transparent textarea.
    const effectiveLang = () => (language.value === 'auto' ? detected : language.value);
    function paint() {
      const text = ta.value;
      if (!window.hljs || text.length > EDITOR_HIGHLIGHT_LIMIT) {
        editor.classList.add('plain');
        hlCode.textContent = '';
        return;
      }
      editor.classList.remove('plain');
      const lang = effectiveLang();
      const src = text.endsWith('\n') ? `${text} ` : text; // keep the last empty line's height
      hlCode.innerHTML = lang !== 'plaintext' && hljs.getLanguage(lang)
        ? hljs.highlight(src, { language: lang, ignoreIllegals: true }).value
        : esc(src);
    }
    let paintFrame, paintTimer;
    function schedulePaint() {
      cancelAnimationFrame(paintFrame);
      clearTimeout(paintTimer);
      if (ta.value.length > 20000) paintTimer = setTimeout(paint, 120);
      else paintFrame = requestAnimationFrame(paint);
    }

    function runDetect() {
      if (language.value !== 'auto') return;
      const hasText = ta.value.trim().length > 0;
      const next = hasText ? detectLanguage(ta.value) : 'plaintext';
      autoOption.textContent = hasText ? `Auto · ${LANG_NAME[next] || next}` : 'Auto-detect';
      if (next !== detected) { detected = next; paint(); }
    }
    let detectTimer;
    const scheduleDetect = () => { clearTimeout(detectTimer); detectTimer = setTimeout(runDetect, 350); };

    language.addEventListener('change', () => {
      if (language.value === 'auto') runDetect();
      else autoOption.textContent = 'Auto-detect';
      paint();
    });

    function setVisibility(v) {
      visibility = v;
      [...seg.querySelectorAll('button')].forEach((b, i) => {
        const on = b.dataset.value === v;
        b.setAttribute('aria-checked', String(on));
        if (on) seg.style.setProperty('--i', i);
      });
    }
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setVisibility(b.dataset.value); saveDraft(); } });
    seg.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      setVisibility(visibility === 'public' ? 'unlisted' : 'public');
      $(`[aria-checked="true"]`, seg).focus();
    });

    let lastLines = 0;
    function refresh() {
      const n = lineCount(ta.value);
      if (n !== lastLines) {
        gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
        lastLines = n;
      }
      stats.textContent = `${plural(n, 'line')} · ${formatBytes(byteLength(ta.value))}`;
      stats.style.color = ta.value.length > MAX_CHARS ? 'var(--red)' : '';
    }
    const syncScroll = () => {
      gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
      hlLayer.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    };

    let draftTimer;
    function saveDraft() {
      if (editing) return;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => storage.set(DRAFT_KEY, JSON.stringify({
        title: title.value, content: ta.value, language: language.value,
        expires: expires.value, visibility, burn: burn.checked,
      })), 300);
    }

    // Restore draft / fork / existing paste
    title.value = draft.title || '';
    ta.value = draft.content || '';
    if (draft.language && LANG_NAME[draft.language]) language.value = draft.language;
    if (draft.expires != null && [...expires.options].some((o) => o.value === draft.expires)) expires.value = draft.expires;
    if (draft.visibility) setVisibility(draft.visibility);
    burn.checked = !!draft.burn;
    refresh();
    runDetect();
    paint();

    ta.addEventListener('input', () => { refresh(); schedulePaint(); scheduleDetect(); saveDraft(); });
    ta.addEventListener('scroll', syncScroll, { passive: true });
    form.addEventListener('change', saveDraft);
    expires.addEventListener('change', saveDraft);
    burn.addEventListener('change', saveDraft);
    title.addEventListener('input', saveDraft);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } });

    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (!document.execCommand('insertText', false, '    ')) ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
      }
    });
    page.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    });

    // Drag & drop a file
    let dragDepth = 0;
    form.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; form.classList.add('dragging'); } });
    form.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; form.classList.remove('dragging'); } });
    form.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    form.addEventListener('drop', async (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      dragDepth = 0;
      form.classList.remove('dragging');
      if (file.size > MAX_CHARS * 4) { toast('That file is too large', 'error'); return; }
      ta.value = await file.text();
      if (!title.value) title.value = file.name;
      const ext = file.name.split('.').pop().toLowerCase();
      if (EXT_TO_LANG[ext]) { language.value = EXT_TO_LANG[ext]; autoOption.textContent = 'Auto-detect'; }
      ta.scrollTop = 0;
      ta.scrollLeft = 0;
      refresh(); runDetect(); paint(); syncScroll(); saveDraft();
      toast(`Loaded ${file.name}`);
    });

    function reject(message) {
      shake(form);
      toast(message, 'error');
      ta.focus();
    }

    let busy = false;
    async function submit() {
      if (busy) return;
      const content = ta.value;
      if (!content.trim()) return reject('Add some content first');
      if (content.length > MAX_CHARS) return reject('Paste is too large (max 500 KB)');

      busy = true;
      createBtn.disabled = true;
      createBtn.classList.add('loading');

      const lang = language.value === 'auto' ? detectLanguage(content) : language.value;
      const keepExpiry = expires.value === 'keep';
      const expiresIn = expires.value && !keepExpiry ? Number(expires.value) : null;
      const input = {
        title: title.value.trim(), content, language: lang, visibility, expiresIn,
        burn: burn.checked, password: password.value,
      };

      try {
        if (editing) {
          const updated = await api.update(existing.id, {
            ...input,
            changeExpiry: !keepExpiry,
            passwordMode: removePassword ? 'remove' : input.password ? 'set' : 'keep',
          });
          cache.set(existing.id, updated);
          location.hash = `#/${existing.id}`;
          toast('Changes saved');
        } else {
          const id = await api.create(input);
          cache.set(id, {
            id, title: input.title, content, language: lang, visibility,
            burn_after_read: input.burn, has_password: !!input.password, views: 0,
            own: true, is_owner: !!currentUser,
            created_at: new Date().toISOString(),
            expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
          });
          clearTimeout(draftTimer);
          storage.del(DRAFT_KEY);
          const copied = await copyText(pasteUrl(id)).catch(() => false);
          location.hash = `#/${id}`;
          toast(copied ? 'Paste created — link copied' : 'Paste created');
        }
      } catch (err) {
        toast(err.message || 'Something went wrong', 'error');
      } finally {
        busy = false;
        createBtn.disabled = false;
        createBtn.classList.remove('loading');
      }
    }
    createBtn.addEventListener('click', submit);

    $('.delete', page)?.addEventListener('click', async () => {
      if (await deletePaste(existing)) location.hash = '#/mine';
    });

    page.docTitle = editing ? `Edit · ${existing.title || 'Untitled'} · QuickPaste` : 'QuickPaste';
    page.onMount = () => {
      if (!editing && matchMedia('(hover: hover)').matches) ta.focus({ preventScroll: true });
      syncScroll();
    };
    return page;
  }

  async function deletePaste(p) {
    const ok = await confirmDialog({
      title: `Delete “${p.title || 'Untitled'}”?`,
      message: 'This paste will be removed for everyone and its link will stop working. This can’t be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return false;
    try {
      await api.remove(p.id);
      cache.delete(p.id);
      toast('Paste deleted');
      return true;
    } catch (err) {
      toast(err.message || 'Couldn’t delete paste', 'error');
      return false;
    }
  }

  // ───────── View: paste ─────────

  function viewPaste(p) {
    const lang = p.language || 'plaintext';
    const langLabel = LANG_NAME[lang] || lang;
    const name = p.title || 'Untitled';
    const lines = lineCount(p.content);
    const owner = !!p.is_owner;

    const meta = [
      `<span>${icon('clock')}<time datetime="${esc(p.created_at)}" title="${esc(new Date(p.created_at).toLocaleString())}">${esc(relativeTime(p.created_at))}</time></span>`,
      `<span>${icon('lines')}${plural(lines, 'line')} · ${formatBytes(byteLength(p.content))}</span>`,
      `<span>${icon(p.visibility === 'unlisted' ? 'lock' : 'globe')}${p.visibility === 'unlisted' ? 'Unlisted' : 'Public'}</span>`,
    ];
    if (p.has_password) meta.push(`<span>${icon('key')}Password protected</span>`);
    if (owner ? !p.own : !p.own && !p.burn_after_read) meta.push(`<span>${icon('eye')}${plural(p.views || 0, 'view')}</span>`);
    if (p.expires_at) meta.push(`<span>${icon('timer')}${isExpired(p) ? 'Expired' : `Expires ${esc(relativeTime(p.expires_at))}`}</span>`);

    const banners = [];
    if (owner && isExpired(p)) {
      banners.push(`<div class="banner info reveal" style="--d:2">${icon('timer')}<div><strong>This paste has expired</strong>Only you can see it. Edit it and choose a new expiry to share it again.</div></div>`);
    }
    if (p.burn_after_read) {
      if (owner) {
        banners.push(`<div class="banner burn reveal" style="--d:2">${icon('flame')}<div><strong>Burn after reading is on</strong>The first person to open this link will see it — then it’s gone for good. You can view it here while signed in without burning it.</div></div>`);
      } else if (p.own) {
        banners.push(`<div class="banner burn reveal" style="--d:2">${icon('flame')}<div><strong>Burn after reading is on</strong>The first person to open this link will see it — then it’s gone for good. Don’t open it yourself.</div></div>`);
      } else {
        banners.push(`<div class="banner burn reveal" style="--d:2">${icon('flame')}<div><strong>This paste has now been destroyed</strong>It was set to burn after reading. Copy anything you need before leaving this page.</div></div>`);
      }
    }

    const page = html(`
      <article class="page page-paste">
        <header class="paste-head">
          <div class="reveal">
            <p class="eyebrow">${esc(langLabel)}</p>
            <h1>${esc(name)}</h1>
            <div class="meta">${meta.join('')}</div>
          </div>
          <div class="toolbar reveal" style="--d:1">
            <button class="btn primary" data-act="link">${icon('link')}<span>Copy Link</span></button>
            ${owner ? `<a class="btn" data-act="edit" href="#/edit/${esc(p.id)}">${icon('pencil')}<span>Edit</span></a>` : ''}
            <button class="btn" data-act="copy">${icon('copy')}<span>Copy</span></button>
            <button class="btn icon-only" data-act="share" title="Share" aria-label="Share">${icon('share')}</button>
            <button class="btn icon-only" data-act="raw" title="View raw" aria-label="View raw">${icon('doc')}</button>
            <button class="btn icon-only" data-act="download" title="Download" aria-label="Download">${icon('download')}</button>
            <button class="btn icon-only" data-act="fork" title="Duplicate as new paste" aria-label="Duplicate as new paste">${icon('duplicate')}</button>
          </div>
        </header>
        ${banners.join('')}
        <div class="code card reveal" style="--d:2">
          <div class="code-gutter" aria-hidden="true"><pre></pre></div>
          <div class="code-scroll"><pre><code class="hljs"></code></pre></div>
        </div>
      </article>`).firstElementChild;

    $('.code-gutter pre', page).textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    const code = $('code', page);
    if (window.hljs && lang !== 'plaintext' && hljs.getLanguage(lang) && p.content.length <= HIGHLIGHT_LIMIT) {
      code.innerHTML = hljs.highlight(p.content, { language: lang, ignoreIllegals: true }).value;
    } else {
      code.textContent = p.content;
    }

    const filename = () => {
      const base = (p.title || p.id).replace(/[^\w.\- ]+/g, '').trim() || p.id;
      const ext = LANG_TO_EXT[lang] || 'txt';
      return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${ext}`;
    };

    $('.toolbar', page).addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      switch (btn.dataset.act) {
        case 'link':
          toast((await copyText(pasteUrl(p.id))) ? 'Link copied' : 'Couldn’t copy link');
          break;
        case 'copy':
          toast((await copyText(p.content)) ? 'Copied to clipboard' : 'Couldn’t copy');
          break;
        case 'share':
          sharePaste(p);
          break;
        case 'raw': {
          const url = URL.createObjectURL(new Blob([p.content], { type: 'text/plain;charset=utf-8' }));
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          break;
        }
        case 'download': {
          const url = URL.createObjectURL(new Blob([p.content], { type: 'text/plain;charset=utf-8' }));
          const a = Object.assign(document.createElement('a'), { href: url, download: filename() });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          break;
        }
        case 'fork':
          prefill = { title: p.title, content: p.content, language: lang };
          location.hash = '#/';
          break;
      }
    });

    page.docTitle = `${name} · QuickPaste`;
    return page;
  }

  // ───────── View: recent ─────────

  function viewRecent(list) {
    if (!list.length) {
      return emptyState('tray', 'Nothing here yet', 'Public pastes will show up here. Be the first to share something.', true);
    }
    const tiles = list.map((p, i) => `
      <a class="tile card reveal" style="--d:${Math.min(i, 10) + 1}" href="#/${esc(p.id)}">
        <div class="tile-body">
          <div class="tile-top">
            <span class="tag">${esc(LANG_NAME[p.language] || p.language || 'Plain Text')}</span>
            <time datetime="${esc(p.created_at)}">${esc(relativeTime(p.created_at))}</time>
          </div>
          <h3>${esc(p.title || 'Untitled')}</h3>
        </div>
        ${p.locked
          ? `<div class="tile-locked">${icon('lock')}<span>Password protected</span></div>`
          : `<pre>${esc((p.preview || '').split('\n').slice(0, 8).join('\n'))}</pre>`}
      </a>`).join('');
    const page = html(`
      <div class="page page-recent">
        <header class="page-head reveal"><h1>Recent</h1><p>The latest public pastes.</p></header>
        <div class="grid">${tiles}</div>
      </div>`).firstElementChild;
    page.docTitle = 'Recent · QuickPaste';
    return page;
  }

  // ───────── View: my pastes ─────────

  function viewMine(list) {
    if (!list.length) {
      const empty = emptyState('tray', 'No pastes yet', 'Pastes you create while signed in will show up here, ready to edit and share.', true);
      empty.docTitle = 'My Pastes · QuickPaste';
      return empty;
    }

    const rowHtml = (p, i) => {
      const pills = [];
      if (p.visibility === 'unlisted') pills.push(`<span class="pill">${icon('lock')}Unlisted</span>`);
      if (p.has_password) pills.push(`<span class="pill">${icon('key')}Password</span>`);
      if (p.burn_after_read) pills.push(`<span class="pill orange">${icon('flame')}Burn</span>`);
      if (p.expired) pills.push(`<span class="pill red">${icon('timer')}Expired</span>`);
      else if (p.expires_at) pills.push(`<span class="pill">${icon('timer')}${esc(relativeTime(p.expires_at))}</span>`);
      const details = [LANG_NAME[p.language] || p.language || 'Plain Text', relativeTime(p.created_at), plural(p.views || 0, 'view')];
      return `
        <li class="mine-row reveal" style="--d:${Math.min(i, 12) + 1}" data-id="${esc(p.id)}">
          <a class="mine-main" href="#/${esc(p.id)}">
            ${langBadge(p.language)}
            <span class="mine-text">
              <strong>${esc(p.title || 'Untitled')}</strong>
              <small>${details.map(esc).join(' · ')}</small>
              ${pills.length ? `<span class="pills">${pills.join('')}</span>` : ''}
            </span>
          </a>
          <div class="mine-actions">
            <button class="btn icon-only ghost" type="button" data-act="share" title="Share" aria-label="Share">${icon('share')}</button>
            <a class="btn icon-only ghost" href="#/edit/${esc(p.id)}" title="Edit" aria-label="Edit">${icon('pencil')}</a>
            <button class="btn icon-only ghost danger" type="button" data-act="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>
          </div>
        </li>`;
    };

    const page = html(`
      <div class="page page-mine">
        <header class="page-head split">
          <div class="reveal">
            <h1>My Pastes</h1>
            <p class="count"></p>
          </div>
          <a class="btn primary reveal" style="--d:1" href="#/">${icon('plus')}<span>New Paste</span></a>
        </header>
        <ul class="mine-list card">${list.map(rowHtml).join('')}</ul>
      </div>`).firstElementChild;

    const count = $('.count', page);
    const updateCount = () => {
      count.textContent = `${plural(list.length, 'paste')} · ${currentUser?.email || ''}`;
    };
    updateCount();

    $('.mine-list', page).addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const row = btn.closest('.mine-row');
      const p = list.find((x) => x.id === row.dataset.id);
      if (btn.dataset.act === 'share') return sharePaste(p);
      if (btn.dataset.act === 'delete' && (await deletePaste(p))) {
        list.splice(list.indexOf(p), 1);
        updateCount();
        const h = row.offsetHeight;
        await settle(row.animate(
          [{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px' }],
          { duration: reduceMotion.matches ? 1 : 340, easing: 'cubic-bezier(.22,1,.36,1)' },
        ), 400);
        row.remove();
        if (!list.length) navigate();
      }
    });

    page.docTitle = 'My Pastes · QuickPaste';
    return page;
  }

  // ───────── View: sign in / create account ─────────

  function viewAuth({ returnTo = '#/mine', note = '' } = {}) {
    let mode = 'signin';
    const copy = {
      signin: { title: 'Sign in to QuickPaste', button: 'Sign In', fine: 'New here? Choose Create Account above.' },
      signup: { title: 'Create your account', button: 'Create Account', fine: `Use at least ${MIN_PASSWORD} characters for your password.` },
    };

    const page = html(`
      <div class="page auth-page">
        <div class="auth-card card reveal">
          <img class="auth-icon" src="assets/icon.svg" alt="" width="60" height="60">
          <h1 class="auth-title">${copy.signin.title}</h1>
          <p class="auth-sub">${esc(note || 'Keep your pastes in one place — edit, share and manage them anytime.')}</p>
          <div class="segmented" role="radiogroup" aria-label="Account" style="--n:2;--i:0">
            <button type="button" role="radio" aria-checked="true" data-value="signin">Sign In</button>
            <button type="button" role="radio" aria-checked="false" data-value="signup">Create Account</button>
          </div>
          <form class="auth-form" novalidate>
            <div class="field-group">
              <input type="email" name="email" placeholder="Email" autocomplete="email" autocapitalize="off" spellcheck="false" aria-label="Email" required>
              <input type="password" name="password" placeholder="Password" autocomplete="current-password" aria-label="Password" required>
            </div>
            <button class="btn primary block" type="submit"><span class="label">${copy.signin.button}</span><span class="spinner"></span></button>
          </form>
          <p class="fine">${copy.signin.fine}</p>
        </div>
      </div>`).firstElementChild;

    const card = $('.auth-card', page);
    const seg = $('.segmented', page);
    const form = $('form', page);
    const { email, password } = form.elements;
    const submitBtn = $('button[type=submit]', form);
    const swapText = (el, text) => {
      if (el.textContent === text) return;
      el.animate?.([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      el.textContent = text;
    };

    function setMode(next) {
      mode = next;
      [...seg.querySelectorAll('button')].forEach((b, i) => {
        const on = b.dataset.value === next;
        b.setAttribute('aria-checked', String(on));
        if (on) seg.style.setProperty('--i', i);
      });
      swapText($('.auth-title', page), copy[mode].title);
      swapText($('.label', submitBtn), copy[mode].button);
      swapText($('.fine', page), copy[mode].fine);
      password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    }
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.value); });

    const fail = (message, field) => {
      shake(form);
      toast(message, 'error');
      field?.focus();
    };

    function showCheckEmail(address) {
      card.innerHTML = `
        <div class="glyph">${icon('mail')}</div>
        <h1 class="auth-title">Check your inbox</h1>
        <p class="auth-sub">We sent a confirmation link to <strong>${esc(address)}</strong>. Open it to finish creating your account.</p>
        <button class="btn block back" type="button">Back to Sign In</button>`;
      card.animate?.([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
      $('.back', card).addEventListener('click', () => navigate());
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;
      const address = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return fail('Enter a valid email address', email);
      if (password.value.length < MIN_PASSWORD) {
        return fail(mode === 'signup' ? `Password must be at least ${MIN_PASSWORD} characters` : 'Enter your password', password);
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
      try {
        if (mode === 'signin') {
          const user = await api.auth.signIn(address, password.value);
          setUser(user);
          toast('Signed in');
          location.hash = returnTo;
        } else {
          const res = await api.auth.signUp(address, password.value);
          if (res.needsConfirmation) return showCheckEmail(address);
          setUser(res.user);
          toast('Account created');
          location.hash = returnTo;
        }
      } catch (err) {
        fail(err.message || 'Something went wrong');
      } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
    });

    page.docTitle = 'Sign In · QuickPaste';
    page.onMount = () => { if (matchMedia('(hover: hover)').matches) email.focus({ preventScroll: true }); };
    return page;
  }

  // ───────── View: password prompt ─────────

  const notFoundState = () =>
    emptyState('question', 'Paste not found', 'This paste doesn’t exist, has expired, or was burned after reading.', true);

  function viewLocked(id) {
    const page = html(`
      <div class="page empty unlock">
        <div class="glyph reveal">${icon('lock')}</div>
        <h1 class="reveal" style="--d:1">Password required</h1>
        <p class="reveal" style="--d:2">This paste is protected. Enter the password to view it.</p>
        <form class="unlock-form reveal" style="--d:3" novalidate>
          <input type="password" name="pw" placeholder="Password" autocomplete="current-password" aria-label="Password" required>
          <button class="btn primary" type="submit"><span class="label">Unlock</span><span class="spinner"></span></button>
        </form>
      </div>`).firstElementChild;

    const form = $('form', page);
    const input = form.elements.pw;
    const btn = $('button', form);
    const fail = (message) => {
      shake(form);
      toast(message, 'error');
      input.select();
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      if (!input.value) return fail('Enter the password');
      btn.disabled = true;
      btn.classList.add('loading');
      const token = navToken;
      try {
        const p = await api.get(id, input.value);
        if (token !== navToken) return; // user navigated away
        if (!p) return swap(notFoundState(), { name: 'paste' });
        if (p.locked) return fail('Incorrect password');
        cache.set(id, p);
        await swap(viewPaste(p), { name: 'paste' });
      } catch (err) {
        toast(err.message || 'Something went wrong', 'error');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });

    page.docTitle = 'Password required · QuickPaste';
    page.onMount = () => input.focus({ preventScroll: true });
    return page;
  }

  function emptyState(glyph, heading, text, withButton) {
    const page = html(`
      <div class="page empty">
        <div class="glyph reveal">${icon(glyph)}</div>
        <h1 class="reveal" style="--d:1">${esc(heading)}</h1>
        <p class="reveal" style="--d:2">${esc(text)}</p>
        ${withButton ? `<a class="btn primary reveal" style="--d:3" href="#/">${icon('plus')}<span>New Paste</span></a>` : ''}
      </div>`).firstElementChild;
    page.docTitle = `${heading} · QuickPaste`;
    return page;
  }

  // ───────── Navigation bar: account menu ─────────

  function renderAccount() {
    const host = $('#account');
    $('[data-nav=mine]').hidden = !currentUser;
    if (!currentUser) {
      host.innerHTML = '<a class="btn small primary" href="#/login">Sign In</a>';
      return;
    }
    const email = currentUser.email || 'Account';
    const initial = esc(email.trim()[0]?.toUpperCase() || '?');
    host.innerHTML = `
      <button class="avatar" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu" title="${esc(email)}">${initial}</button>
      <div class="menu" role="menu">
        <div class="menu-head">
          <span class="avatar large" aria-hidden="true">${initial}</span>
          <span class="menu-who"><small>Signed in as</small><strong>${esc(email)}</strong></span>
        </div>
        <a role="menuitem" href="#/mine">${icon('tray')}<span>My Pastes</span></a>
        <a role="menuitem" href="#/">${icon('plus')}<span>New Paste</span></a>
        <button role="menuitem" type="button" data-act="signout">${icon('logout')}<span>Sign Out</span></button>
      </div>`;

    const button = $('.avatar', host);
    const menu = $('.menu', host);
    const setOpen = (open) => {
      menu.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      if (open) {
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', onKey);
      } else {
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', onKey);
      }
    };
    const outside = (e) => { if (!host.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); button.focus(); } };

    button.addEventListener('click', () => setOpen(!menu.classList.contains('open')));
    menu.addEventListener('click', async (e) => {
      const item = e.target.closest('[role=menuitem]');
      if (!item) return;
      setOpen(false);
      if (item.dataset.act === 'signout') {
        try {
          await api.auth.signOut();
        } catch { /* sign out locally regardless */ }
        if (['mine', 'edit'].includes(parseRoute().name)) location.hash = '#/';
        setUser(null);
        toast('Signed out');
      }
    });
  }

  // ───────── Router ─────────

  const main = $('#view');
  let navToken = 0;

  function parseRoute() {
    const [first, second] = location.hash.replace(/^#\/?/, '').split(/[/?]/);
    if (!first || first === 'new') return { name: 'new' };
    if (first === 'recent') return { name: 'recent' };
    if (first === 'login') return { name: 'login' };
    if (first === 'mine') return { name: 'mine' };
    if (first === 'edit' && second) return { name: 'edit', id: decodeURIComponent(second) };
    return { name: 'paste', id: decodeURIComponent(first) };
  }

  async function navigate() {
    const token = ++navToken;
    const route = parseRoute();
    let page;
    const slow = setTimeout(() => document.body.classList.add('is-loading'), 120);
    try {
      if (libMissing) {
        page = emptyState('warn', 'Couldn’t load QuickPaste', 'A required script failed to load. Check your connection and refresh the page.', false);
      } else if (route.name === 'paste') {
        let p = cache.get(route.id);
        if (!p) {
          p = await api.get(route.id);
          if (p && !p.locked) cache.set(route.id, p);
        }
        page = !p ? notFoundState() : p.locked ? viewLocked(route.id) : viewPaste(p);
      } else if (route.name === 'recent') {
        page = viewRecent((await api.recent()) || []);
      } else if (route.name === 'login') {
        if (currentUser) {
          history.replaceState(null, '', '#/mine');
          clearTimeout(slow);
          return navigate();
        }
        page = viewAuth();
      } else if (route.name === 'mine') {
        page = currentUser
          ? viewMine((await api.mine()) || [])
          : viewAuth({ returnTo: '#/mine', note: 'Sign in to see and manage your pastes.' });
      } else if (route.name === 'edit') {
        if (!currentUser) {
          page = viewAuth({ returnTo: location.hash, note: 'Sign in to edit your paste.' });
        } else {
          const p = await api.getOwn(route.id);
          page = p ? viewComposer(p)
            : emptyState('lock', 'Can’t edit this paste', 'It doesn’t exist, or it wasn’t created with your account.', true);
        }
      } else {
        page = viewComposer();
      }
    } catch (err) {
      page = emptyState('warn', 'Something went wrong', err.message || 'Please try again in a moment.', true);
    } finally {
      clearTimeout(slow);
      if (token === navToken) document.body.classList.remove('is-loading');
    }
    if (token !== navToken) return;
    await swap(page, route);
  }

  let swapToken = 0;
  async function swap(page, route) {
    const token = ++swapToken;
    const old = main.firstElementChild;
    if (old && !reduceMotion.matches && old.animate) {
      await settle(old.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.99)' }],
        { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
      ), 250);
    }
    if (token !== swapToken) return; // a newer page replaced this one mid-animation
    main.replaceChildren(page);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = page.docTitle || 'QuickPaste';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.name));
    page.onMount?.();
  }

  // ───────── Boot ─────────

  async function boot() {
    if (!isConfigured) {
      $('.nav-left').insertAdjacentHTML('beforeend', '<span class="demo-badge" title="Fill in config.js to connect Supabase. Pastes and accounts are only saved in this browser.">Demo</span>');
    }
    if (!libMissing) {
      const { user, notice } = await api.auth.init(setUser);
      currentUser = user;
      if (notice) toast(notice.text, notice.type);
    }
    renderAccount();
    booted = true;
    window.addEventListener('hashchange', navigate);
    navigate();
  }
  boot();
})();
