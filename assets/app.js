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

  // Encryption ("the link is the key"): see supabase/schema.sql for the design.
  const LINK_ITERATIONS = 300000;     // PBKDF2-SHA256 over the link
  const PASSWORD_ITERATIONS = 600000; // PBKDF2-SHA256 over a paste password (OWASP 2023)
  const VAULT_ITERATIONS = 600000;    // PBKDF2-SHA256 over the account password
  const LINK_RE = /^[a-z0-9][a-z0-9_-]{2,39}$/;
  const RESERVED_LINKS = new Set(['new', 'recent', 'login', 'mine', 'edit', 'admin', 'about', 'api', 'raw',
    'help', 'settings', 'account', 'report', 'privacy', 'terms', 'p']);
  const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 symbols → 5 bits each, no bias
  const ID_LENGTH = 12;                                    // 60 random bits
  const LOOKUP_RE = /^[0-9a-f]{64}$/;
  const hasCrypto = !!(window.crypto && crypto.subtle);

  // Files: limits match the Storage bucket limits in supabase/schema.sql.
  const MB = 1024 * 1024;
  const USER_FILE_MAX = 25 * MB;
  const GUEST_FILE_MAX = 5 * MB;
  const GCM_OVERHEAD = 28; // 12-byte IV + 16-byte tag added to every encrypted file
  const FILE_EXPIRATIONS = [['', 'Never'], ['3600', '1 Hour'], ['86400', '1 Day'], ['604800', '1 Week'], ['2592000', '1 Month']];
  // Guests can't choose: admins pick one of these lifetimes for every guest file.
  const GUEST_TTLS = [[30, '30 minutes'], [60, '1 hour'], [1440, '1 day']];
  const guestTtlLabel = (minutes) => (GUEST_TTLS.find(([m]) => m === minutes) || GUEST_TTLS[1])[1];
  const CLEANUP_KEY = 'quickpaste:last-cleanup';
  const CLEANUP_EVERY = 10 * 60 * 1000; // each browser helps clean up at most every 10 minutes

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
  const VISIBILITY = {
    public: { label: 'Public', icon: 'globe' },
    unlisted: { label: 'Unlisted', icon: 'link' },
    private: { label: 'Private', icon: 'lock' },
  };
  const REPORT_REASONS = [
    ['spam', 'Spam or advertising'],
    ['malware', 'Malware or phishing'],
    ['illegal', 'Illegal content'],
    ['personal', 'Someone’s personal information'],
    ['other', 'Something else'],
  ];
  const REASON_NAME = Object.fromEntries(REPORT_REASONS);

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
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    flame: '<path d="M12 21c-3.9 0-7-2.7-7-6.4 0-2.7 1.5-4.7 3.1-6.1.3 1.6 1 2.8 2.2 3.4C10.1 8.5 11.7 5.3 14 3c.3 3 1.6 4.6 3 6.2 1.3 1.5 2 3.1 2 5.3 0 3.8-3.1 6.5-7 6.5z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 2.5h4"/>',
    lines: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    tray: '<path d="M3.5 13.5 6 5.5h12l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
    key: '<circle cx="8" cy="15.5" r="4.5"/><path d="m11.2 12.3 8.3-8.3M16.5 7l2.5 2.5M14 9.5l2 2"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    logout: '<path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7"/><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5"/>',
    person: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6"/>',
    users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M15.5 5.6a3.3 3.3 0 0 1 0 5.8M17.5 14.7c1.8.6 3 2.3 3.5 4.8"/>',
    flag: '<path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11"/>',
    gauge: '<path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4"/>',
    upload: '<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
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
  const isLegacyRow = (rowId) => !LOOKUP_RE.test(rowId || '');

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

  const pasteUrl = (link) => `${location.origin}${location.pathname}#/${link}`;

  async function sharePaste(p) {
    const url = pasteUrl(p.link ?? p.id);
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

  function langBadge(lang, locked = false) {
    if (locked) return `<span class="lang-badge" style="--c:#8e8e93">${icon('lock')}</span>`;
    const ext = (LANG_TO_EXT[lang] || 'txt').toUpperCase().slice(0, 4);
    const hash = [...(lang || 'plaintext')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const color = lang && lang !== 'plaintext' ? BADGE_COLORS[hash % BADGE_COLORS.length] : '#8e8e93';
    return `<span class="lang-badge" style="--c:${color}">${esc(ext)}</span>`;
  }

  function codeBlock(content, lang) {
    const lines = lineCount(content);
    const el = html(`
      <div class="code card">
        <div class="code-gutter" aria-hidden="true"><pre></pre></div>
        <div class="code-scroll"><pre><code class="hljs"></code></pre></div>
      </div>`).firstElementChild;
    $('.code-gutter pre', el).textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    const code = $('code', el);
    if (window.hljs && lang !== 'plaintext' && hljs.getLanguage(lang) && content.length <= HIGHLIGHT_LIMIT) {
      code.innerHTML = hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
    } else {
      code.textContent = content;
    }
    return el;
  }

  // ───────── Crypto ─────────

  const te = new TextEncoder();
  const td = new TextDecoder();
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  function concatBytes(...parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  }
  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  // PBKDF2 (slow, resists guessing) → HKDF key from which independent values are expanded.
  async function stretch(secret, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
    return crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits']);
  }
  async function expand(master, label) {
    const info = te.encode(label);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, master, 256));
  }
  async function aesKey(...parts) {
    const material = parts.length === 1 ? parts[0] : new Uint8Array(await crypto.subtle.digest('SHA-256', concatBytes(...parts)));
    return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function seal(key, bytes, aad) {
    const iv = randomBytes(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, bytes);
    return toB64(concatBytes(iv, new Uint8Array(ct)));
  }
  async function unseal(key, blob, aad) {
    const bytes = fromB64(blob);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: te.encode(aad) }, key, bytes.slice(12));
    return new Uint8Array(pt);
  }
  const sealJson = (key, obj, aad) => seal(key, te.encode(JSON.stringify(obj)), aad);
  const unsealJson = async (key, blob, aad) => JSON.parse(td.decode(await unseal(key, blob, aad)));

  // link → { lookup (stored as the row id), key (never leaves the browser) }
  const linkCache = new Map();
  function linkSecrets(link) {
    if (!linkCache.has(link)) {
      const job = (async () => {
        const master = await stretch(link, te.encode('quickpaste/v2/link'), LINK_ITERATIONS);
        return { lookup: toHex(await expand(master, 'lookup')), key: await expand(master, 'key') };
      })();
      job.catch(() => linkCache.delete(link));
      linkCache.set(link, job);
    }
    return linkCache.get(link);
  }
  // paste password + per-paste salt → { auth (sent, bcrypt-hashed by the server), key (never sent) }
  async function passwordSecrets(password, salt) {
    const master = await stretch(password, concatBytes(te.encode('quickpaste/v2/password'), salt), PASSWORD_ITERATIONS);
    return { auth: toHex(await expand(master, 'auth')), key: await expand(master, 'key') };
  }

  // Reports: the link (and password) are encrypted for every admin's ECDH P-256 public
  // key. A random key encrypts the payload; it's wrapped for each admin with
  // ECDH(one-time key, admin key) → HKDF → AES-GCM. AAD binds it to the reported paste.
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  async function ecdhWrapKey(privateKey, publicKey, keyId) {
    const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
    const master = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits']);
    return aesKey(await expand(master, `quickpaste/v2/report:${keyId}`));
  }
  async function sealForAdmins(payload, keys, pasteId) {
    if (!keys?.length) return null;
    const contentKey = randomBytes(32);
    const eph = await crypto.subtle.generateKey(ECDH, false, ['deriveBits']);
    const wrapped = {};
    for (const k of keys) {
      const pub = await crypto.subtle.importKey('spki', fromB64(k.public_key), ECDH, false, []);
      wrapped[k.key_id] = await seal(await ecdhWrapKey(eph.privateKey, pub, k.key_id), contentKey, `report-key:${pasteId}`);
    }
    return {
      v: 1,
      eph: toB64(new Uint8Array(await crypto.subtle.exportKey('spki', eph.publicKey))),
      ct: await sealJson(await aesKey(contentKey), payload, `report:${pasteId}`),
      keys: wrapped,
    };
  }
  // me: { key_id, privateKey }. Returns the payload, or null if it isn't for this admin.
  async function openForAdmin(sealed, me, pasteId) {
    const wrapped = sealed?.keys?.[me.key_id];
    if (!wrapped) return null;
    try {
      const eph = await crypto.subtle.importKey('spki', fromB64(sealed.eph), ECDH, false, []);
      const contentKey = await unseal(await ecdhWrapKey(me.privateKey, eph, me.key_id), wrapped, `report-key:${pasteId}`);
      return await unsealJson(await aesKey(contentKey), sealed.ct, `report:${pasteId}`);
    } catch {
      return null;
    }
  }

  const normLink = (s) => String(s || '').trim().toLowerCase();
  const newLink = () => Array.from(randomBytes(ID_LENGTH), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
  function linkProblem(link) {
    if (link.length < 3) return 'At least 3 characters';
    if (!LINK_RE.test(link)) return 'Letters, numbers, - and _ only';
    if (RESERVED_LINKS.has(link)) return 'That word is reserved';
    return null;
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

  // A sheet with arbitrary content. Returns { el, close }.
  function openModal(contentHtml, { wide = false, onClose } = {}) {
    const el = html(`
      <div class="dialog-backdrop">
        <div class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${contentHtml}</div>
      </div>`).firstElementChild;
    const previous = document.activeElement;
    document.body.appendChild(el);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => el.classList.add('open'));

    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      el.classList.remove('open');
      setTimeout(() => {
        el.remove();
        if (!document.querySelector('.dialog-backdrop')) document.body.classList.remove('modal-open');
      }, 260);
      previous?.focus?.({ preventScroll: true });
      onClose?.(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Tab') { // keep focus inside the dialog
        const focusable = [...el.querySelectorAll('button, input, textarea, select, a[href]')].filter((n) => !n.disabled && n.offsetParent);
        if (!focusable.length) return;
        const i = focusable.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); focusable[focusable.length - 1].focus(); }
        if (!e.shiftKey && i === focusable.length - 1) { e.preventDefault(); focusable[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => { if (e.target === el) close(false); });
    return { el, close };
  }

  function confirmDialog({ title, message, confirmLabel = 'OK', destructive = false }) {
    return new Promise((resolve) => {
      const { el, close } = openModal(`
        <h2>${esc(title)}</h2>
        <p>${esc(message)}</p>
        <div class="dialog-actions">
          <button class="btn" type="button" data-v="0">Cancel</button>
          <button class="btn ${destructive ? 'destructive' : 'primary'}" type="button" data-v="1">${esc(confirmLabel)}</button>
        </div>`, { onClose: (v) => resolve(v === true) });
      $('[data-v="0"]', el).focus();
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (b) close(b.dataset.v === '1');
      });
    });
  }

  // ───────── Backends ─────────
  // Both expose the same interface; the Supabase one calls the SQL functions in
  // supabase/schema.sql, the demo one imitates them in this browser.

  function friendlyError(message = '') {
    if (/failed to fetch|networkerror|load failed/i.test(message)) return 'Can’t reach the server. Check your connection.';
    if (/invalid login credentials/i.test(message)) return 'Incorrect email or password';
    if (/email not confirmed/i.test(message)) return 'Confirm your email first — check your inbox';
    if (/already registered|already exists/i.test(message)) return 'An account with this email already exists';
    if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a moment and try again.';
    if (/could not find the function/i.test(message)) return 'The database needs updating — run supabase/schema.sql again';
    if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message)) return 'That file is too large';
    if (/row-level security|violates.*policy|unauthorized/i.test(message)) return 'Upload refused by the server — please try again';
    if (/bucket not found/i.test(message)) return 'File storage isn’t set up — run supabase/schema.sql again';
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
    const bodyArgs = (b) => ({
      p_id: b.id, p_public_slug: b.publicSlug, p_title: b.title, p_content: b.content, p_language: b.language,
      p_enc: b.enc, p_enc_salt: b.encSalt, p_size: b.size, p_visibility: b.visibility,
    });

    return {
      create: (b) => rpc('create_paste', {
        ...bodyArgs(b), p_expires_in: b.expiresIn, p_burn: b.burn, p_auth: b.auth,
        p_is_custom: b.isCustom, p_owner_note: b.ownerNote,
      }),
      get: (id, auth) => rpc('get_paste', { p_id: id, p_auth: auth || null }),
      linkAvailable: (id) => rpc('link_available', { p_id: id }),
      recent: () => rpc('recent_pastes', { p_limit: 30 }),
      reportKeys: () => rpc('report_keys'),
      report: (r) => rpc('report_paste', {
        p_id: r.id, p_sealed: r.sealed || null, p_reason: r.reason, p_details: r.details || null,
      }),
      siteSettings: () => rpc('site_settings'),
      myAccount: () => rpc('my_account'),
      getVault: () => rpc('get_vault'),
      createVault: (wrapped, salt) => rpc('create_vault', { p_wrapped_key: wrapped, p_salt: salt }),
      mine: () => rpc('my_pastes'),
      getOwn: (id) => rpc('get_own_paste', { p_id: id }),
      update: (b) => rpc('update_paste', {
        ...bodyArgs(b), p_burn: b.burn, p_change_expiry: b.changeExpiry, p_expires_in: b.expiresIn,
        p_password_mode: b.passwordMode, p_auth: b.auth, p_owner_note: b.ownerNote,
      }),
      remove: (id) => rpc('delete_paste', { p_id: id }),

      files: {
        async upload(bucket, path, blob) {
          const { error } = await client.storage.from(bucket).upload(path, blob, { contentType: 'application/octet-stream', upsert: false });
          if (error) throw new Error(friendlyError(error.message));
        },
        async download(bucket, path) {
          const { data, error } = await client.storage.from(bucket).download(path);
          if (error) throw new Error(friendlyError(error.message));
          return data;
        },
        async removeObjects(bucket, paths) {
          if (!paths.length) return;
          const { error } = await client.storage.from(bucket).remove(paths);
          if (error) throw new Error(friendlyError(error.message));
        },
        reserve: (id, size, encMeta, note, expiresIn) => rpc('reserve_file', {
          p_id: id, p_size: size, p_enc_meta: encMeta, p_owner_note: note, p_expires_in: expiresIn,
        }),
        finish: (id) => rpc('finish_file', { p_id: id }),
        cancel: (id) => rpc('cancel_file', { p_id: id }),
        get: (id) => rpc('get_file', { p_id: id }),
        expiredGuest: () => rpc('expired_guest_files', { p_limit: 50 }),
        purgeGuestRows: () => rpc('purge_expired_guest_rows'),
        mine: () => rpc('my_files'),
        setShared: (id, shared) => rpc('set_file_shared', { p_id: id, p_shared: shared }),
        remove: (id) => rpc('delete_file', { p_id: id }),
      },

      admin: {
        overview: () => rpc('admin_overview'),
        files: (query) => rpc('admin_files', { p_query: query || null, p_limit: 200 }),
        deleteFile: (id) => rpc('admin_delete_file', { p_id: id }),
        cleanupCandidates: () => rpc('admin_cleanup_candidates'),
        userFilePaths: (id) => rpc('admin_user_file_paths', { p_user_id: id }),
        setUserStorage: (id, mb) => rpc('admin_set_user_storage', { p_user_id: id, p_quota_mb: mb }),
        setStorageSetting: (key, mb) => rpc('admin_set_storage_setting', { p_key: key, p_mb: mb }),
        setGuestTtl: (minutes) => rpc('admin_set_guest_ttl', { p_minutes: minutes }),
        reports: (status) => rpc('admin_reports', { p_status: status }),
        setReportStatus: (id, status) => rpc('admin_set_report_status', { p_id: id, p_status: status }),
        myKey: () => rpc('admin_my_key'),
        setKey: (k) => rpc('admin_set_key', { p_key_id: k.key_id, p_public_key: k.public_key, p_wrapped_private: k.wrapped_private }),
        sealReport: (id, sealed) => rpc('admin_seal_report', { p_id: id, p_sealed: sealed }),

        pastes: (query) => rpc('admin_pastes', { p_query: query || null, p_limit: 200, p_offset: 0 }),
        getPaste: (id) => rpc('admin_get_paste', { p_id: id }),
        setVisibility: (id, visibility) => rpc('admin_set_visibility', { p_id: id, p_visibility: visibility }),
        deletePaste: (id) => rpc('admin_delete_paste', { p_id: id }),
        users: (query) => rpc('admin_users', { p_query: query || null, p_limit: 200, p_offset: 0 }),
        deleteUser: (id) => rpc('admin_delete_user', { p_user_id: id }),
        setUserLimit: (id, limit) => rpc('admin_set_user_limit', { p_user_id: id, p_limit: limit }),
        setDefaultLimit: (limit) => rpc('admin_set_default_limit', { p_limit: limit }),
      },

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
  // The first account created becomes an admin so the dashboard can be tried out.
  function createDemoBackend() {
    const K = {
      pastes: 'quickpaste:demo3-pastes', users: 'quickpaste:demo3-users', session: 'quickpaste:demo3-session',
      admins: 'quickpaste:demo3-admins', settings: 'quickpaste:demo3-settings', limits: 'quickpaste:demo3-limits',
      vaults: 'quickpaste:demo3-vaults', reports: 'quickpaste:demo3-reports',
      files: 'quickpaste:demo3-files', objects: 'quickpaste:demo3-objects',
      adminKeys: 'quickpaste:demo3-admin-keys', rates: 'quickpaste:demo3-rates',
    };
    // File bytes live in IndexedDB (too big for localStorage); object metadata in localStorage.
    const blobs = (() => {
      let db;
      const open = () => (db ||= new Promise((resolve, reject) => {
        const req = indexedDB.open('quickpaste-demo', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('blobs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }));
      const run = async (mode, fn) => {
        const store = (await open()).transaction('blobs', mode).objectStore('blobs');
        return new Promise((resolve, reject) => {
          const req = fn(store);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      };
      return {
        put: (key, value) => run('readwrite', (s) => s.put(value, key)),
        get: (key) => run('readonly', (s) => s.get(key)),
        del: (key) => run('readwrite', (s) => s.delete(key)),
      };
    })();
    const read = (k, fallback) => { try { return JSON.parse(storage.get(k)) ?? fallback; } catch { return fallback; } };
    const write = (k, v) => storage.set(k, JSON.stringify(v));
    const hash = async (text) => toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(`demo:${text}`))));
    let user = read(K.session, null);
    let notify = () => {};
    const setSession = (u) => {
      user = u;
      if (u) write(K.session, u); else storage.del(K.session);
      notify(u);
    };

    const uid = () => user?.id ?? null;
    const isAdmin = () => !!user && read(K.admins, []).includes(user.id);
    const requireAdmin = () => { if (!isAdmin()) throw new Error('Admins only'); };
    const SETTINGS = { custom_link_limit: 5, storage_quota_mb: 25, admin_storage_quota_mb: 50, guest_pool_mb: 200, guest_file_ttl_minutes: 60 };
    const settings = () => ({ ...SETTINGS, ...read(K.settings, {}) });
    const defaultLimit = () => settings().custom_link_limit;
    const linkLimit = (id) => read(K.limits, {})[id]?.links ?? defaultLimit();
    const storageQuota = (id) => (read(K.limits, {})[id]?.storage
      ?? (read(K.admins, []).includes(id) ? settings().admin_storage_quota_mb : settings().storage_quota_mb)) * MB;
    const objects = () => read(K.objects, {});
    // Mirrors qp_bytes_used(): each row counts max(reserved, stored), plus bytes without a row.
    const bytesUsed = (bucket, owner) => {
      const objs = objects();
      const rows = Object.values(read(K.files, {})).filter((f) => f.bucket === bucket && (f.owner_id || null) === owner);
      const hourAgo = Date.now() - 3600000;
      const fromRows = rows.reduce((sum, f) => {
        const o = objs[`${bucket}/${f.object_path}`];
        if (f.pending && !o && new Date(f.created_at).getTime() < hourAgo) return sum;
        return sum + Math.max(f.size, o?.size || 0);
      }, 0);
      const folder = `${bucket}/${owner || 'guest'}/`;
      const orphans = Object.entries(objs)
        .filter(([key]) => key.startsWith(folder) && !rows.some((f) => `${bucket}/${f.object_path}` === key))
        .reduce((sum, [, o]) => sum + o.size, 0);
      return fromRows + orphans;
    };
    const storageUsed = (id) => bytesUsed('files', id);
    const guestPoolUsed = () => bytesUsed('guest-files', null);
    // Mirrors the rate limits in schema.sql (this browser is the only client).
    const rateHits = (action, subject, secs) => {
      const r = read(K.rates, {})[`${action}:${subject}`];
      return r && r.start > Date.now() - secs * 1000 ? r.hits : 0;
    };
    const rateHit = (action, subject, secs) => {
      const rates = read(K.rates, {});
      const key = `${action}:${subject}`;
      const r = rates[key] && rates[key].start > Date.now() - secs * 1000 ? rates[key] : { start: Date.now(), hits: 0 };
      r.hits += 1;
      rates[key] = r;
      write(K.rates, rates);
      return r.hits;
    };
    const rateLimit = (action, max, secs) => {
      if (rateHits(action, 'me', secs) >= max) throw new Error(friendlyError('Rate limit reached'));
      rateHit(action, 'me', secs);
    };
    const setLimit = (id, field, value) => {
      const limits = read(K.limits, {});
      limits[id] = { ...limits[id], [field]: value };
      if (limits[id].links == null && limits[id].storage == null) delete limits[id];
      write(K.limits, limits);
    };
    const fileJson = (f) => {
      const { owner_id, owner_note, ...rest } = f;
      return { ...rest, is_owner: !!user && owner_id === user.id, guest: !owner_id, expired: isExpired(f) };
    };
    // Mirrors qp_guest_object_removable(): expired, or abandoned for over an hour.
    const guestRemovable = (path) => {
      const f = Object.values(read(K.files, {})).find((x) => x.bucket === 'guest-files' && x.object_path === path);
      if (f && isExpired(f)) return true;
      if (f && !f.pending) return false;
      const o = objects()[`guest-files/${path}`];
      return !!o && new Date(o.created_at).getTime() < Date.now() - 3600000;
    };
    const removeObject = async (key) => {
      const all = objects();
      delete all[key];
      write(K.objects, all);
      await blobs.del(key);
    };
    const usersById = () => Object.fromEntries(Object.values(read(K.users, {})).map((u) => [u.id, u]));
    const toJson = (p) => {
      const { password_hash, owner_id, owner_note, ...rest } = p;
      return { ...rest, has_password: !!password_hash, is_owner: !!user && owner_id === user.id, encrypted: p.enc != null };
    };
    const expiry = (secs) => (secs ? new Date(Date.now() + secs * 1000).toISOString() : null);
    const checkInput = (b) => {
      if ((b.content == null) === (b.enc == null)) throw new Error('Send either plain or encrypted content');
      if (!(b.size >= 1 && b.size <= MAX_CHARS)) throw new Error('Paste is too large (max 500 KB)');
      if (!VISIBILITY[b.visibility]) throw new Error('Invalid visibility');
    };

    return {
      async create(b) {
        rateLimit('create', 30, 600);
        checkInput(b);
        if (!LOOKUP_RE.test(b.id)) throw new Error('Invalid paste id');
        if (b.content != null && (b.visibility !== 'public' || b.auth)) throw new Error('Only public pastes without a password can be stored unencrypted');
        if (b.visibility === 'public' && b.auth) throw new Error('Pastes with a password can’t be public — choose Unlisted');
        if (b.visibility === 'public' ? !LINK_RE.test(b.publicSlug || '') : b.publicSlug) throw new Error('Invalid link');
        if (b.visibility === 'private' && !uid()) throw new Error('Sign in to create private pastes');
        const all = read(K.pastes, {});
        if (b.isCustom) {
          if (!uid()) throw new Error('Sign in to choose a custom link');
          const used = Object.values(all).filter((p) => p.owner_id === uid() && p.is_custom).length;
          if (used >= linkLimit(uid())) throw new Error(`You’ve used all ${linkLimit(uid())} of your custom links`);
        }
        if (all[b.id] || (b.publicSlug && Object.values(all).some((p) => p.public_slug === b.publicSlug))) {
          throw new Error('That link is already taken');
        }
        all[b.id] = {
          id: b.id, public_slug: b.publicSlug, title: b.content == null ? '' : b.title, content: b.content,
          language: b.content == null ? 'plaintext' : b.language, enc: b.enc, enc_salt: b.auth ? b.encSalt : null,
          size: b.size, visibility: b.visibility, burn_after_read: !!b.burn, views: 0,
          created_at: new Date().toISOString(), updated_at: null, expires_at: expiry(b.expiresIn),
          password_hash: b.auth ? await hash(b.auth) : null, is_custom: !!b.isCustom,
          owner_id: uid(), owner_note: uid() ? b.ownerNote : null,
        };
        write(K.pastes, all);
        return b.id;
      },
      async get(id, auth) {
        const all = read(K.pastes, {});
        const p = all[id];
        if (!p) {
          if (rateHit('miss', 'me', 600) > 120) throw new Error(friendlyError('Rate limit reached'));
          return null;
        }
        if (p.owner_id && p.owner_id === uid()) return toJson(p);
        if (p.visibility === 'private' || isExpired(p)) return null;
        if (p.password_hash && auth && (rateHits('password', 'me', 600) >= 10 || rateHits('password-paste', id, 3600) >= 30)) {
          throw new Error('Too many wrong passwords. Wait a few minutes and try again.');
        }
        if (p.password_hash && (!auth || (await hash(auth)) !== p.password_hash)) {
          if (auth) { rateHit('password', 'me', 600); rateHit('password-paste', id, 3600); }
          return { id, locked: true, wrong_password: !!auth, enc_salt: p.enc_salt, encrypted: p.enc != null };
        }
        if (p.burn_after_read) delete all[id]; else p.views += 1;
        write(K.pastes, all);
        return toJson(p);
      },
      async linkAvailable(id) {
        rateLimit('check', 120, 600);
        return !read(K.pastes, {})[id];
      },
      async recent() {
        return Object.values(read(K.pastes, {}))
          .filter((p) => !isExpired(p) && p.visibility === 'public' && !p.burn_after_read
            && (p.public_slug || !LOOKUP_RE.test(p.id)))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 30)
          .map((p) => ({
            id: p.public_slug || p.id, title: p.enc ? null : p.title, language: p.enc ? null : p.language,
            created_at: p.created_at, size: p.size, locked: !!(p.password_hash || p.enc),
            preview: p.password_hash || p.enc ? null : p.content.slice(0, 400),
          }));
      },
      async reportKeys() {
        const admins = read(K.admins, []);
        return Object.entries(read(K.adminKeys, {}))
          .filter(([id]) => admins.includes(id)).map(([, k]) => ({ key_id: k.key_id, public_key: k.public_key }));
      },
      async report(r) {
        rateLimit('report', 5, 600);
        if (!REASON_NAME[r.reason]) throw new Error('Choose a reason');
        const reports = read(K.reports, []);
        const exists = !!read(K.pastes, {})[r.id];
        reports.push({
          id: (reports.at(-1)?.id || 0) + 1, paste_id: exists ? r.id : null, sealed: exists ? r.sealed || null : null,
          link: null, password: null,
          reason: r.reason, details: r.details || null, reporter_id: uid(), status: 'open',
          created_at: new Date().toISOString(), resolved_at: null,
        });
        write(K.reports, reports);
      },
      async siteSettings() {
        return { guest_file_ttl_minutes: settings().guest_file_ttl_minutes };
      },
      async myAccount() {
        if (!user) return null;
        const used = Object.values(read(K.pastes, {})).filter((p) => p.owner_id === uid() && p.is_custom).length;
        return {
          is_admin: isAdmin(), custom_used: used, custom_limit: linkLimit(uid()), has_vault: !!read(K.vaults, {})[uid()],
          storage_used: storageUsed(uid()), storage_quota: storageQuota(uid()),
        };
      },
      async getVault() {
        return read(K.vaults, {})[uid()] || null;
      },
      async createVault(wrapped, salt) {
        const vaults = read(K.vaults, {});
        if (vaults[uid()]) return false;
        vaults[uid()] = { wrapped_key: wrapped, salt };
        write(K.vaults, vaults);
        return true;
      },
      async mine() {
        if (!user) return [];
        return Object.values(read(K.pastes, {}))
          .filter((p) => p.owner_id === uid())
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((p) => ({
            id: p.id, public_slug: p.public_slug, owner_note: p.owner_note, is_custom: p.is_custom,
            visibility: p.visibility, burn_after_read: p.burn_after_read, views: p.views, created_at: p.created_at,
            updated_at: p.updated_at, expires_at: p.expires_at, title: p.enc ? null : p.title,
            language: p.enc ? null : p.language, size: p.size, has_password: !!p.password_hash,
            encrypted: p.enc != null, expired: isExpired(p),
          }));
      },
      async getOwn(id) {
        const p = read(K.pastes, {})[id];
        return p && p.owner_id === uid() ? { ...toJson(p), owner_note: p.owner_note } : null;
      },
      async update(b) {
        if (!uid()) throw new Error('Sign in to edit pastes');
        const all = read(K.pastes, {});
        const rec = all[b.id];
        if (!rec || rec.owner_id !== uid()) throw new Error('Paste not found');
        checkInput(b);
        if (b.passwordMode === 'set' && !b.auth) throw new Error('Enter a new password');
        const finalPw = b.passwordMode === 'set' ? true : b.passwordMode === 'remove' ? false : !!rec.password_hash;
        if (b.content != null && (b.visibility !== 'public' || finalPw)) throw new Error('Only public pastes without a password can be stored unencrypted');
        if (b.visibility === 'public' && finalPw && LOOKUP_RE.test(b.id)) throw new Error('Pastes with a password can’t be public — choose Unlisted');

        if (b.visibility === 'public' && !LINK_RE.test(b.publicSlug || '')) throw new Error('Invalid link');
        Object.assign(rec, {
          public_slug: b.visibility === 'public' ? b.publicSlug : null,
          title: b.content == null ? '' : b.title, content: b.content,
          language: b.content == null ? 'plaintext' : b.language, enc: b.enc,
          enc_salt: finalPw && b.enc ? b.encSalt : null, size: b.size, visibility: b.visibility,
          burn_after_read: !!b.burn, updated_at: new Date().toISOString(),
          owner_note: b.ownerNote ?? rec.owner_note,
        });
        if (b.changeExpiry) rec.expires_at = expiry(b.expiresIn);
        if (b.passwordMode === 'set') rec.password_hash = await hash(b.auth);
        if (b.passwordMode === 'remove') rec.password_hash = null;
        write(K.pastes, all);
        return toJson(rec);
      },
      async remove(id) {
        const all = read(K.pastes, {});
        if (!all[id] || all[id].owner_id !== uid()) return false;
        delete all[id];
        write(K.pastes, all);
        return true;
      },

      // Mirrors the Storage policies and file functions in schema.sql.
      files: {
        async upload(bucket, path, blob) {
          const max = bucket === 'files' ? USER_FILE_MAX : GUEST_FILE_MAX;
          if (blob.size > max) throw new Error('That file is too large');
          // Mirrors qp_upload_allowed(): only a fresh reservation of this exact path and size.
          const reserved = Object.values(read(K.files, {})).find((f) => f.bucket === bucket && f.object_path === path
            && f.pending && (f.owner_id || null) === uid() && new Date(f.created_at).getTime() > Date.now() - 3600000);
          if (!reserved || blob.size > reserved.size) throw new Error(friendlyError('new row violates row-level security policy'));
          const key = `${bucket}/${path}`;
          const all = objects();
          if (all[key]) throw new Error('That file already exists');
          await blobs.put(key, blob);
          all[key] = { size: blob.size, created_at: new Date().toISOString() };
          write(K.objects, all);
        },
        async download(bucket, path) {
          const key = `${bucket}/${path}`;
          const f = Object.values(read(K.files, {})).find((x) => x.bucket === bucket && x.object_path === path);
          const mine = bucket === 'files' && uid() && path.startsWith(`${uid()}/`);
          if (!mine && !(f && f.shared && !isExpired(f))) throw new Error('Object not found');
          const blob = await blobs.get(key);
          if (!blob) throw new Error('Object not found');
          return blob;
        },
        async removeObjects(bucket, paths) {
          for (const path of paths) {
            const mine = bucket === 'files' && uid() && path.startsWith(`${uid()}/`);
            if (!mine && !isAdmin() && !(bucket === 'guest-files' && guestRemovable(path))) throw new Error('Not allowed');
            await removeObject(`${bucket}/${path}`);
          }
        },
        async expiredGuest() {
          return Object.keys(objects()).filter((k) => k.startsWith('guest-files/'))
            .map((k) => k.slice('guest-files/'.length)).filter(guestRemovable).slice(0, 50);
        },
        async purgeGuestRows() {
          const all = read(K.files, {});
          let n = 0;
          for (const [id, f] of Object.entries(all)) {
            if (f.bucket === 'guest-files' && isExpired(f) && !objects()[`guest-files/${f.object_path}`]) { delete all[id]; n++; }
          }
          write(K.files, all);
          return n;
        },
        // Mirrors reserve_file(), finish_file() and cancel_file().
        async reserve(id, size, encMeta, note, expiresIn) {
          if (!LOOKUP_RE.test(id)) throw new Error('Invalid file id');
          if (uid()) rateLimit('upload', 100, 3600); else rateLimit('upload-guest', 20, 3600);
          if (!uid()) expiresIn = settings().guest_file_ttl_minutes * 60; // guests don't choose
          const bucket = uid() ? 'files' : 'guest-files';
          if (!(size >= 1 && size <= (uid() ? USER_FILE_MAX : GUEST_FILE_MAX))) throw new Error('That file is too large');
          const quota = uid() ? storageQuota(uid()) : settings().guest_pool_mb * MB;
          if (bytesUsed(bucket, uid()) + size > quota) {
            throw new Error(uid() ? 'Not enough storage space for this file' : 'Guest storage is full right now. Sign in to upload.');
          }
          const all = read(K.files, {});
          if (all[id]) throw new Error('That file already exists');
          all[id] = {
            id, owner_id: uid(), bucket, object_path: uid() ? `${uid()}/${id}` : `guest/${id}`, enc_meta: encMeta,
            owner_note: uid() ? note : null, size, shared: !uid(), downloads: 0, created_at: new Date().toISOString(),
            updated_at: null, expires_at: expiry(expiresIn), pending: true,
          };
          write(K.files, all);
          return fileJson(all[id]);
        },
        async finish(id) {
          const all = read(K.files, {});
          const f = all[id];
          if (!f || !f.pending || (f.owner_id || null) !== uid()) throw new Error('Upload not found');
          const object = objects()[`${f.bucket}/${f.object_path}`];
          if (!object) throw new Error('Upload the file first');
          if (object.size > f.size) {
            Object.assign(f, { size: object.size, pending: false, shared: false, expires_at: new Date().toISOString() });
            write(K.files, all);
            return null;
          }
          Object.assign(f, { size: object.size, pending: false, created_at: new Date().toISOString() });
          write(K.files, all);
          return fileJson(f);
        },
        async cancel(id) {
          const all = read(K.files, {});
          const f = all[id];
          if (!f || !f.pending || (f.owner_id || null) !== uid() || objects()[`${f.bucket}/${f.object_path}`]) return false;
          delete all[id];
          write(K.files, all);
          return true;
        },
        async get(id) {
          const all = read(K.files, {});
          const f = all[id];
          if (!f || f.pending) return null;
          if (f.owner_id && f.owner_id === uid()) return fileJson(f);
          if (!f.shared || isExpired(f)) return null;
          f.downloads += 1;
          write(K.files, all);
          return fileJson(f);
        },
        async mine() {
          if (!user) return null;
          const files = Object.values(read(K.files, {}))
            .filter((f) => f.owner_id === uid() && !f.pending)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((f) => ({ ...fileJson(f), owner_note: f.owner_note }));
          return { used: storageUsed(uid()), quota: storageQuota(uid()), files };
        },
        async setShared(id, shared) {
          const all = read(K.files, {});
          const f = all[id];
          if (!f || f.owner_id !== uid() || f.pending) throw new Error('File not found');
          f.shared = !!shared;

          write(K.files, all);
          return fileJson(f);
        },
        async remove(id) {
          const all = read(K.files, {});
          if (!all[id] || all[id].owner_id !== uid()) return false;
          delete all[id];
          write(K.files, all);
          return true;
        },
      },

      admin: {
        async overview() {
          requireAdmin();
          const pastes = Object.values(read(K.pastes, {}));
          const files = Object.values(read(K.files, {})).filter((f) => !f.pending);
          const s = settings();
          return {
            pastes: pastes.length, encrypted: pastes.filter((p) => p.enc).length,
            users: Object.keys(read(K.users, {})).length,
            open_reports: read(K.reports, []).filter((r) => r.status === 'open').length,
            files: files.length, storage_bytes: files.reduce((sum, f) => sum + f.size, 0),
            guest_pool_used: guestPoolUsed(), default_limit: s.custom_link_limit, guest_file_ttl_minutes: s.guest_file_ttl_minutes,
            storage_quota_mb: s.storage_quota_mb, admin_storage_quota_mb: s.admin_storage_quota_mb, guest_pool_mb: s.guest_pool_mb,
            rate_limit_active: true,
          };
        },
        async files(query) {
          requireAdmin();
          const q = (query || '').trim().toLowerCase();
          const users = usersById();
          return Object.values(read(K.files, {})).filter((f) => !f.pending)
            .map((f) => ({ ...fileJson(f), owner_email: users[f.owner_id]?.email || null }))
            .filter((f) => !q || f.id === q || (f.owner_email || '').toLowerCase().includes(q))
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
        },
        async deleteFile(id) {
          requireAdmin();
          const all = read(K.files, {});
          delete all[id];
          write(K.files, all);
          return true;
        },
        async cleanupCandidates() {
          requireAdmin();
          const files = Object.values(read(K.files, {}));
          const expired = files.filter(isExpired).map((f) => ({ bucket: f.bucket, path: f.object_path, file_id: f.id }));
          const hourAgo = Date.now() - 3600000;
          const orphans = Object.entries(objects())
            .filter(([key, o]) => new Date(o.created_at).getTime() < hourAgo
              && !files.some((f) => !f.pending && `${f.bucket}/${f.object_path}` === key))
            .map(([key]) => ({ bucket: key.split('/')[0], path: key.split('/').slice(1).join('/'), file_id: null }));
          return [...expired, ...orphans];
        },
        async userFilePaths(id) {
          requireAdmin();
          return Object.keys(objects()).filter((k) => k.startsWith(`files/${id}/`)).map((k) => k.slice('files/'.length));
        },
        async setUserStorage(id, mb) {
          requireAdmin();
          setLimit(id, 'storage', mb);
        },
        async setGuestTtl(minutes) {
          requireAdmin();
          if (![30, 60, 1440].includes(minutes)) throw new Error('Choose 30 minutes, 1 hour or 1 day');
          write(K.settings, { ...read(K.settings, {}), guest_file_ttl_minutes: minutes });
        },
        async setStorageSetting(key, mb) {
          requireAdmin();
          if (!['storage_quota_mb', 'admin_storage_quota_mb', 'guest_pool_mb'].includes(key)) throw new Error('Unknown setting');
          write(K.settings, { ...read(K.settings, {}), [key]: mb });
        },
        async reports(status) {
          requireAdmin();
          const pastes = read(K.pastes, {});
          const users = usersById();
          return read(K.reports, [])
            .filter((r) => status === 'all' || r.status === status)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((r) => {
              const p = r.paste_id ? pastes[r.paste_id] : null;
              return {
                ...r, reporter_email: users[r.reporter_id]?.email || null, paste_exists: !!p,
                visibility: p?.visibility, views: p?.views, encrypted: !!p?.enc,
                title: p && !p.enc ? p.title : null, owner_email: users[p?.owner_id]?.email || null,
              };
            });
        },
        async setReportStatus(id, status) {
          requireAdmin();
          const reports = read(K.reports, []);
          const r = reports.find((x) => x.id === id);
          if (r) { r.status = status; r.resolved_at = status === 'open' ? null : new Date().toISOString(); }
          if (r && status !== 'open') Object.assign(r, { sealed: null, link: null, password: null }); // closed: keep no link
          write(K.reports, reports);
        },
        async myKey() {
          requireAdmin();
          return read(K.adminKeys, {})[uid()] || null;
        },
        async setKey(k) {
          requireAdmin();
          write(K.adminKeys, { ...read(K.adminKeys, {}), [uid()]: { key_id: k.key_id, public_key: k.public_key, wrapped_private: k.wrapped_private } });
        },
        async sealReport(id, sealed) {
          requireAdmin();
          const reports = read(K.reports, []);
          const r = reports.find((x) => x.id === id && x.status === 'open');
          if (r) Object.assign(r, { sealed, link: null, password: null });
          write(K.reports, reports);
        },
        async pastes(query) {
          requireAdmin();
          const q = (query || '').trim().toLowerCase();
          const users = usersById();
          const reports = read(K.reports, []);
          return Object.values(read(K.pastes, {}))
            .filter((p) => !q || p.id === q || (p.public_slug || '').includes(q)
              || (!p.enc && (p.title || '').toLowerCase().includes(q))
              || (users[p.owner_id]?.email || '').toLowerCase().includes(q))
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((p) => ({
              id: p.id, public_slug: p.public_slug, visibility: p.visibility, burn_after_read: p.burn_after_read,
              views: p.views, created_at: p.created_at, expires_at: p.expires_at, title: p.enc ? null : p.title,
              language: p.enc ? null : p.language, size: p.size, encrypted: !!p.enc, has_password: !!p.password_hash,
              is_custom: p.is_custom, expired: isExpired(p), owner_email: users[p.owner_id]?.email || null,
              open_reports: reports.filter((r) => r.paste_id === p.id && r.status === 'open').length,
            }));
        },
        async getPaste(id) {
          requireAdmin();
          const p = read(K.pastes, {})[id];
          return p ? toJson(p) : null;
        },
        async setVisibility(id, visibility) {
          requireAdmin();
          const all = read(K.pastes, {});
          const p = all[id];
          if (!p) throw new Error('Paste not found');
          if (visibility === 'public' && !p.public_slug && LOOKUP_RE.test(p.id)) {
            throw new Error('This paste’s link is secret, so it can’t be listed publicly');
          }
          p.visibility = visibility;
          write(K.pastes, all);
        },
        async deletePaste(id) {
          requireAdmin();
          const all = read(K.pastes, {});
          delete all[id];
          write(K.pastes, all);
          const reports = read(K.reports, []);
          reports.forEach((r) => { if (r.paste_id === id) Object.assign(r, { paste_id: null, sealed: null, link: null, password: null }); });

          write(K.reports, reports);
          return true;
        },
        async users(query) {
          requireAdmin();
          const q = (query || '').trim().toLowerCase();
          const pastes = Object.values(read(K.pastes, {}));
          const files = Object.values(read(K.files, {}));
          const admins = read(K.admins, []);
          const limits = read(K.limits, {});
          return Object.values(read(K.users, {}))
            .filter((u) => !q || u.email.toLowerCase().includes(q))
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((u) => ({
              id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
              pastes: pastes.filter((p) => p.owner_id === u.id).length,
              custom_used: pastes.filter((p) => p.owner_id === u.id && p.is_custom).length,
              custom_limit_override: limits[u.id]?.links ?? null, custom_limit: linkLimit(u.id),
              files: files.filter((f) => f.owner_id === u.id).length,
              storage_used: storageUsed(u.id), storage_quota: storageQuota(u.id),
              storage_quota_override: limits[u.id]?.storage ?? null,
              is_admin: admins.includes(u.id), is_me: u.id === uid(),
            }));
        },
        async deleteUser(id) {
          requireAdmin();
          if (id === uid()) throw new Error('You can’t delete your own account here');
          if (read(K.admins, []).includes(id)) throw new Error('Remove their admin rights first');
          const users = read(K.users, {});
          for (const [key, u] of Object.entries(users)) if (u.id === id) delete users[key];
          write(K.users, users);
          const all = read(K.pastes, {});
          for (const [key, p] of Object.entries(all)) if (p.owner_id === id) delete all[key];
          write(K.pastes, all);
          const files = read(K.files, {});
          for (const [key, f] of Object.entries(files)) if (f.owner_id === id) delete files[key];
          write(K.files, files);
        },
        async setUserLimit(id, limit) {
          requireAdmin();
          setLimit(id, 'links', limit);
        },
        async setDefaultLimit(limit) {
          requireAdmin();
          write(K.settings, { ...read(K.settings, {}), custom_link_limit: limit });
        },
      },

      auth: {
        async init(onChange) {
          notify = onChange;
          return { user, notice: null };
        },
        async signIn(email, password) {
          const users = read(K.users, {});
          const u = users[email.toLowerCase()];
          if (!u || u.hash !== (await hash(password))) throw new Error('Incorrect email or password');
          u.last_sign_in_at = new Date().toISOString();
          write(K.users, users);
          const session = { id: u.id, email: u.email };
          setSession(session);
          return session;
        },
        async signUp(email, password) {
          const users = read(K.users, {});
          const key = email.toLowerCase();
          if (users[key]) throw new Error('An account with this email already exists');
          const id = crypto.randomUUID?.() || toHex(randomBytes(16));
          const now = new Date().toISOString();
          users[key] = { id, email, hash: await hash(password), created_at: now, last_sign_in_at: now };
          if (!Object.keys(users).some((k) => k !== key)) write(K.admins, [id]); // first account → admin
          write(K.users, users);
          const session = { id, email };
          setSession(session);
          return { user: session, needsConfirmation: false };
        },
        async signOut() {
          setSession(null);
        },
      },
    };
  }

  const libMissing = isConfigured && !window.supabase?.createClient;
  const api = isConfigured && !libMissing ? createSupabaseBackend() : createDemoBackend();

  // ───────── State ─────────

  let currentUser = null;
  let site = { guest_file_ttl_minutes: 60 }; // public settings, loaded at startup
  let account = null;   // { is_admin, custom_used, custom_limit, has_vault }
  let vaultKey = null;  // AES key that encrypts this user's list of links (owner_note)
  let adminKey = null;  // admins: { key_id, privateKey } for reading reports
  let booted = false;
  // Pastes opened this session, by link — lets a creator view a burn-after-read
  // paste without destroying it, and avoids re-fetching on back/forward.
  const cache = new Map();
  let prefill = null;

  async function setUser(user) {
    const previous = currentUser;
    const changed = (user?.id ?? null) !== (previous?.id ?? null);
    currentUser = user;
    if (changed) {
      cache.clear();
      if (previous) storage.del(vaultSlot(previous.id));
      vaultKey = null;
      adminKey = null;
      account = null;
      if (user) {
        await restoreVault(user.id);
        await refreshAccount();
      }
    }
    renderAccount();
    if (changed && booted && ['mine', 'edit', 'admin', 'files'].includes(parseRoute().name)) navigate();
  }

  async function refreshAccount() {
    account = currentUser ? await api.myAccount().catch(() => null) : null;
    renderAccount();
    if (account?.is_admin) ensureAdminKey().catch(() => {}); // so reports can be encrypted for this admin

  }

  // ───────── Vault: the user's links, encrypted with a key only they can unwrap ─────────

  const vaultSlot = (uid) => `quickpaste:vault:${uid}`;
  const vaultWrapKey = async (password, salt) => aesKey(await expand(await stretch(password, salt, VAULT_ITERATIONS), 'vault'));

  async function restoreVault(uid) {
    vaultKey = null;
    const raw = storage.get(vaultSlot(uid));
    if (raw && hasCrypto) {
      try { vaultKey = await aesKey(fromB64(raw)); } catch { /* corrupt — ask for the password again */ }
    }
  }

  // Unwraps the vault with the account password (creating it on first use).
  async function unlockVault(password) {
    const uid = currentUser.id;
    let vault = await api.getVault();
    let raw;
    if (!vault) {
      raw = randomBytes(32);
      const salt = randomBytes(16);
      const wrapped = await seal(await vaultWrapKey(password, salt), raw, `vault:${uid}`);
      if (!(await api.createVault(wrapped, toB64(salt)))) vault = await api.getVault(); // created elsewhere meanwhile
    }
    if (vault) {
      try {
        raw = await unseal(await vaultWrapKey(password, fromB64(vault.salt)), vault.wrapped_key, `vault:${uid}`);
      } catch {
        throw new Error('Incorrect password');
      }
    }
    storage.set(vaultSlot(uid), toB64(raw));
    vaultKey = await aesKey(raw);
    if (account?.is_admin) ensureAdminKey().catch(() => {});

  }

  // Admins: load (or create) the key pair that reports are encrypted for. The
  // private half is stored encrypted with the vault key, so it needs the vault.
  async function ensureAdminKey() {
    if (adminKey || !hasCrypto || !vaultKey || !account?.is_admin) return adminKey;
    const aad = `admin-key:${currentUser.id}`;
    const mine = await api.admin.myKey();
    if (mine) {
      try {
        const pkcs8 = await unseal(vaultKey, mine.wrapped_private, aad);
        adminKey = { key_id: mine.key_id, privateKey: await crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']) };
        return adminKey;
      } catch { /* the vault was recreated (password reset): make a new key pair below */ }
    }
    const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const keyId = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', spki))).slice(0, 32);
    await api.admin.setKey({ key_id: keyId, public_key: toB64(spki), wrapped_private: await seal(vaultKey, pkcs8, aad) });
    adminKey = { key_id: keyId, privateKey: await crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']) };
    return adminKey;
  }

  const sealNote = async (note) =>
 (currentUser && vaultKey ? sealJson(vaultKey, note, `note:${currentUser.id}`) : null);
  async function openNote(blob) {
    if (!blob || !vaultKey || !currentUser) return null;
    try { return await unsealJson(vaultKey, blob, `note:${currentUser.id}`); } catch { return null; }
  }

  // ───────── Paste service ─────────

  const needPassword = () => Object.assign(new Error('Password required'), { needPassword: true });

  // Server row → paste for the UI. `link` is what appears after #/.
  async function decodeRow(row, link, password = null) {
    const base = { ...row, id: link, link, rowId: row.id, password: password || null };
    delete base.enc;
    if (!row.encrypted) return { ...base, encrypted: false };
    const { key } = await linkSecrets(link);
    let pwKey = null;
    if (row.has_password) {
      if (!password) throw needPassword();
      pwKey = (await passwordSecrets(password, fromB64(row.enc_salt))).key;
    }
    let body;
    try {
      body = await unsealJson(await aesKey(...(pwKey ? [key, pwKey] : [key])), row.enc, row.id);
    } catch {
      throw new Error(password ? 'Incorrect password' : 'This paste couldn’t be decrypted');
    }
    return { ...base, encrypted: true, title: body.title || '', content: body.content, language: body.language || 'plaintext' };
  }

  // Resolve a link from the address bar:
  //   { status: 'ok', paste } | { status: 'locked', … } | { status: 'missing' }
  async function openLink(raw, password = null, locked = null) {
    const link = normLink(raw);

    const tryEncrypted = async () => {
      if (!hasCrypto || !LINK_RE.test(link)) return null;
      const { lookup } = await linkSecrets(link);
      const auth = password && locked?.encSalt ? (await passwordSecrets(password, fromB64(locked.encSalt))).auth : null;
      const row = await api.get(lookup, auth);
      if (!row) return null;
      if (row.locked) return { status: 'locked', kind: 'new', link, rowId: lookup, encSalt: row.enc_salt, wrong: row.wrong_password };
      try {
        return { status: 'ok', paste: await decodeRow(row, link, password) };
      } catch (err) {
        if (!err.needPassword) throw err;
        // An owner opening their own password paste: the password is in their vault note.
        const note = row.is_owner ? await openNote((await api.getOwn(row.id).catch(() => null))?.owner_note) : null;
        if (note?.password) return { status: 'ok', paste: await decodeRow(row, link, note.password) };
        return { status: 'locked', kind: 'owner', link, rowId: row.id, ownerRow: row };
      }
    };
    // Pastes from before encryption: short id, checked by the server as-is.
    const tryOlder = async () => {
      const row = await api.get(raw, password);
      if (!row) return null;
      if (row.locked) return { status: 'locked', kind: 'old', link: raw, rowId: raw, wrong: row.wrong_password };
      return { status: 'ok', paste: { ...row, id: raw, link: raw, rowId: raw, encrypted: false, password } };
    };

    if (locked) return (await (locked.kind === 'old' ? tryOlder() : tryEncrypted())) || { status: 'missing' };
    const order = /[A-Z]/.test(raw) ? [tryOlder, tryEncrypted] : [tryEncrypted, tryOlder];
    for (const attempt of order) {
      const result = await attempt();
      if (result) return result;
    }
    return { status: 'missing' };
  }

  // Encrypt (or, for public pastes without a password, don't) for storage.
  async function buildBody(link, input, keepSalt = null) {
    const { lookup, key } = await linkSecrets(link);
    const plain = input.visibility === 'public' && !input.password;
    const body = {
      id: lookup, publicSlug: input.visibility === 'public' ? link : null, size: input.content.length,
      visibility: input.visibility, title: null, content: null, language: null, enc: null, encSalt: null, auth: null,
    };
    if (plain) {
      Object.assign(body, { title: input.title, content: input.content, language: input.language });
    } else {
      let pwKey = null;
      if (input.password) {
        const salt = keepSalt ? fromB64(keepSalt) : randomBytes(16);
        const secrets = await passwordSecrets(input.password, salt);
        Object.assign(body, { encSalt: toB64(salt), auth: secrets.auth });
        pwKey = secrets.key;
      }
      const payload = { title: input.title, content: input.content, language: input.language };
      body.enc = await sealJson(await aesKey(...(pwKey ? [key, pwKey] : [key])), payload, lookup);
    }
    body.ownerNote = await sealNote({ link, title: input.title, language: input.language, password: input.password || null });
    return body;
  }

  async function createPaste(input) {
    const custom = !!input.customLink;
    for (let attempt = 0; attempt < 3; attempt++) {
      const link = custom ? normLink(input.customLink) : newLink();
      const body = await buildBody(link, input);
      try {
        await api.create({ ...body, expiresIn: input.expiresIn, burn: input.burn, isCustom: custom });
        return { link, body };
      } catch (err) {
        if (!custom && /already taken/i.test(err.message)) continue; // astronomically unlikely
        throw err;
      }
    }
    throw new Error('Couldn’t create a unique link — please try again');
  }

  // existing: decrypted paste; input: new values; returns the saved paste for the UI.
  async function savePaste(existing, input) {
    const { passwordMode } = input;
    let finalPassword = passwordMode === 'set' ? input.password : passwordMode === 'remove' ? null : existing.password;
    let row;
    if (isLegacyRow(existing.rowId)) {
      // Older pastes keep their short, server-known id, so they stay unencrypted.
      finalPassword = null;
      row = await api.update({
        id: existing.rowId, publicSlug: null, title: input.title, content: input.content, language: input.language,
        enc: null, encSalt: null, size: input.content.length, visibility: input.visibility, burn: input.burn,
        changeExpiry: input.changeExpiry, expiresIn: input.expiresIn, passwordMode,
        auth: passwordMode === 'set' ? input.password : null, ownerNote: null,
      });
    } else {
      if (passwordMode === 'keep' && existing.has_password && !existing.password) throw new Error('Unlock this paste first');
      const body = await buildBody(existing.link, { ...input, password: finalPassword }, passwordMode === 'keep' ? existing.enc_salt : null);
      row = await api.update({
        ...body, burn: input.burn, changeExpiry: input.changeExpiry, expiresIn: input.expiresIn, passwordMode,
        auth: passwordMode === 'set' ? body.auth : null,
      });
    }
    const saved = {
      ...row, id: existing.link, link: existing.link, rowId: existing.rowId, is_owner: true,
      title: input.title, content: input.content, language: input.language, password: finalPassword,
    };
    delete saved.enc;
    return saved;
  }

  async function loadMine() {
    const rows = (await api.mine()) || [];
    return Promise.all(rows.map(async (r) => {
      const legacy = isLegacyRow(r.id);
      const note = legacy ? null : await openNote(r.owner_note);
      return {
        ...r, rowId: r.id, legacy,
        link: legacy ? r.id : note?.link || r.public_slug || null,
        title: note?.title ?? r.title ?? '',
        language: note?.language || r.language || 'plaintext',
        password: note?.password || null,
      };
    }));
  }

  // For the editor: your own paste by link, decrypted. Throws needPassword if the
  // password isn't in your vault.
  async function loadOwn(raw) {
    const link = normLink(raw);
    let row = null;
    let viaLink = raw;
    if (hasCrypto && LINK_RE.test(link) && !/[A-Z]/.test(raw)) {
      row = await api.getOwn((await linkSecrets(link)).lookup);
      viaLink = link;
    }
    if (!row) {
      row = await api.getOwn(raw);
      viaLink = raw;
    }
    if (!row) return null;
    const note = await openNote(row.owner_note);
    try {
      return await decodeRow(row, viaLink, note?.password || null);
    } catch (err) {
      if (err.needPassword) Object.assign(err, { row, link: viaLink });
      throw err;
    }
  }

  // ───────── File service ─────────
  // Same scheme as pastes: a random link → lookup id + AES key. The bytes are
  // encrypted with that key (AAD = lookup id) before upload; name and type go
  // into enc_meta, encrypted with the same key.

  const fileMax = () => (currentUser ? USER_FILE_MAX : GUEST_FILE_MAX);

  async function uploadFile(file, expiresIn) {
    const guest = !currentUser;
    if (file.size + GCM_OVERHEAD > fileMax()) throw new Error(`Larger than ${formatBytes(fileMax())}`);
    if (!file.size) throw new Error('This file is empty');
    if (!guest && !vaultKey) throw new Error('Unlock your account first');
    const link = newLink();
    const { lookup, key } = await linkSecrets(link);
    const aes = await aesKey(key);
    const iv = randomBytes(12);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: te.encode(lookup) }, aes, await file.arrayBuffer(),
    );
    const blob = new Blob([iv, ciphertext], { type: 'application/octet-stream' });
    const meta = { name: file.name, type: file.type || 'application/octet-stream', size: file.size };
    const encMeta = await sealJson(aes, meta, `${lookup}:meta`);
    const note = guest ? null : await sealNote({ link, ...meta });
    // Reserve the space first (checked atomically by the server), then upload exactly that, then confirm.
    const reserved = await api.files.reserve(lookup, blob.size, encMeta, note, expiresIn);
    try {
      await api.files.upload(reserved.bucket, reserved.object_path, blob);
    } catch (err) {
      await api.files.cancel(lookup).catch(() => {});
      throw err;
    }
    const row = await api.files.finish(lookup);
    if (!row) throw new Error('The upload didn’t match its reservation — please try again');
    return { ...row, link, meta };
  }

  // Open a file by link: returns its row plus decrypted name/type, or null.
  async function openFile(link) {
    const { lookup, key } = await linkSecrets(normLink(link));
    const row = await api.files.get(lookup);
    if (!row) return null;
    const aes = await aesKey(key);
    let meta;
    try {
      meta = await unsealJson(aes, row.enc_meta, `${lookup}:meta`);
    } catch {
      throw new Error('This file couldn’t be decrypted');
    }
    return { ...row, link: normLink(link), meta, aes };
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name || 'download' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function downloadFile(f) {
    const blob = await api.files.download(f.bucket, f.object_path);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: te.encode(f.id) }, f.aes, bytes.slice(12),
      );
    } catch {
      throw new Error('This file couldn’t be decrypted');
    }
    saveBlob(new Blob([plain], { type: f.meta.type }), f.meta.name);
  }

  async function loadMyFiles() {
    const data = (await api.files.mine()) || { used: 0, quota: 0, files: [] };
    data.files = await Promise.all(data.files.map(async (f) => {
      const note = await openNote(f.owner_note);
      return { ...f, link: note?.link || null, meta: note ? { name: note.name, type: note.type, size: note.size } : null };
    }));
    return data;
  }

  async function deleteMyFile(f) {
    const ok = await confirmDialog({
      title: `Delete “${f.meta?.name || 'this file'}”?`,
      message: 'It will be removed from your storage and its link will stop working. This can’t be undone.',
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return false;
    try {
      await api.files.removeObjects(f.bucket, [f.object_path]);
      await api.files.remove(f.id);
      refreshAccount();
      toast('File deleted');
      return true;
    } catch (err) {
      toast(err.message || 'Couldn’t delete the file', 'error');
      return false;
    }
  }

  // Every visitor's browser quietly helps delete expired guest files (at most every
  // 10 minutes). The Storage rules only allow removing files that have already
  // expired or were abandoned mid-upload, so nothing live can be touched.
  async function autoCleanup() {
    try {
      if (Date.now() - Number(storage.get(CLEANUP_KEY) || 0) < CLEANUP_EVERY) return;
      storage.set(CLEANUP_KEY, String(Date.now()));
      const paths = (await api.files.expiredGuest()) || [];
      if (paths.length) await api.files.removeObjects('guest-files', paths);
      await api.files.purgeGuestRows();
    } catch { /* best effort — the next visitor tries again */ }
  }

  const fileExt = (name = '') => (name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE');
  const fileBadge = (name, locked = false) => (locked
    ? `<span class="lang-badge" style="--c:#8e8e93">${icon('lock')}</span>`
    : `<span class="lang-badge" style="--c:#5e5ce6">${esc(fileExt(name))}</span>`);

  // ───────── Language detection ─────────

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
    const legacy = editing && isLegacyRow(existing.rowId);
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

    const linkLeft = account ? Math.max(0, account.custom_limit - account.custom_used) : 0;
    const customRow = editing ? '' : `
      <div class="row link-row">
        <div class="row-label">
          <span class="row-icon" style="background:#ff2d55">${icon('link')}</span>
          <span class="row-text">Custom link<small class="link-hint"></small></span>
        </div>
        <div class="link-field">
          <span class="link-prefix">#/</span>
          <input name="custom" placeholder="random" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false"
            aria-label="Custom link" ${!currentUser || !linkLeft ? 'disabled' : ''}>
          <span class="link-status" aria-hidden="true"></span>
        </div>
      </div>`;

    const header = editing
      ? `<header class="page-head">
           <p class="eyebrow reveal">Editing</p>
           <h1 class="reveal" style="--d:1">${esc(existing.title || 'Untitled')}</h1>
           <p class="reveal" style="--d:1">Changes are saved to the same link: <a href="#/${esc(existing.link)}">#/${esc(existing.link)}</a></p>
         </header>`
      : `<section class="hero">
           <h1 class="reveal">Paste it. <span class="gradient-text">Share it.</span></h1>
           <p class="reveal" style="--d:1">Encrypted in your browser before it’s saved. Only people with the link can read it.</p>
         </section>`;

    const accountNote = editing ? '' : currentUser
      ? `<p class="create-note">${icon('person')}<span>Saved to your account · <a href="#/mine">My Pastes</a></span></p>`
      : `<p class="create-note"><span><a href="#/login">Sign in</a> for custom links, private pastes and editing later.</span></p>`;

    const actions = editing
      ? `<div class="create-bar edit-bar reveal" style="--d:4">
           <a class="btn large" href="#/${esc(existing.link)}">Cancel</a>
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
          ${customRow}
          <div class="row">
            <div class="row-label">
              <span class="row-icon" style="background:#5e5ce6">${icon('eye')}</span>
              <span class="row-text">Visibility<small>Who can find and open it</small></span>
            </div>
            <div class="segmented" role="radiogroup" aria-label="Visibility" style="--n:3;--i:1">
              <button type="button" role="radio" aria-checked="false" data-value="public">Public</button>
              <button type="button" role="radio" aria-checked="true" data-value="unlisted">Unlisted</button>
              <button type="button" role="radio" aria-checked="false" data-value="private" ${currentUser ? '' : 'disabled title="Sign in to create private pastes"'}>Private</button>
            </div>
          </div>
          <div class="row">
            <div class="row-label">
              <span class="row-icon" style="background:#0a84ff">${icon('timer')}</span>
              <span class="row-text">Expires<small>Paste is deleted after this time</small></span>
            </div>
            <label class="select"><select name="expires" aria-label="Expiration">${expOptions}</select></label>
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
              <span class="row-text">Password<small>${editing && existing.has_password ? 'Leave empty to keep the current one' : 'Also needed to decrypt it'}</small></span>
            </div>
            <div class="password-field">
              <input type="password" name="password" placeholder="${editing && existing.has_password ? 'Unchanged' : 'None'}" maxlength="200" autocomplete="new-password" aria-label="Password">
              <button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${icon('eye')}</button>
              ${editing && existing.has_password ? '<button type="button" class="pw-remove">Remove</button>' : ''}
            </div>
          </div>
        </div>
        <p class="enc-status reveal" style="--d:3" aria-live="polite"></p>

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
    const encStatus = $('.enc-status', page);
    const custom = $('input[name=custom]', page);
    const linkHint = $('.link-hint', page);
    const linkStatus = $('.link-status', page);
    let visibility = 'unlisted';
    let detected = 'plaintext';
    let removePassword = false;
    let linkState = { value: '', ok: true, message: '' };

    // Encryption status line under the options
    function updateEncStatus() {
      const hasPw = removePassword ? false : !!password.value || (editing && existing.has_password);
      let kind = 'secure';
      let text;
      if (!hasCrypto) {
        kind = 'warn';
        text = 'Encryption isn’t available here — open QuickPaste over HTTPS.';
      } else if (legacy) {
        kind = 'warn';
        text = 'This paste was created before encryption, so it’s stored unencrypted. Duplicate it to get an encrypted copy with a new link.';
      } else if (visibility === 'public' && !hasPw) {
        kind = 'open';
        text = 'Public pastes are listed in Recent and stored unencrypted with their link, so anyone (including site admins) can read them.';
      } else if (visibility === 'public') {
        text = 'Pastes with a password aren’t listed in Recent, so their link stays secret. It will be saved as Unlisted: end-to-end encrypted with the link and the password.';
      } else if (visibility === 'private') {
        text = 'End-to-end encrypted, and only you can open it.';
      } else {
        text = 'End-to-end encrypted. Only people with the link can read it — not even the site admins.';
      }
      if (editing && !legacy && existing.visibility === 'public' && (visibility !== 'public' || hasPw)) {

        text += ' This link was public before, so it may already be known — duplicate it for a fresh link.';
      }
      encStatus.className = `enc-status ${kind}`;
      encStatus.innerHTML = `${icon(kind === 'secure' ? 'shield' : kind === 'open' ? 'globe' : 'warn')}<span>${esc(text)}</span>`;
    }

    pwToggle.addEventListener('click', () => {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      pwToggle.setAttribute('aria-pressed', String(show));
      pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    password.addEventListener('input', updateEncStatus);
    pwRemove?.addEventListener('click', () => {
      removePassword = !removePassword;
      password.value = '';
      password.disabled = removePassword;
      password.placeholder = removePassword ? 'Will be removed' : 'Unchanged';
      pwRemove.textContent = removePassword ? 'Undo' : 'Remove';
      pwRemove.closest('.password-field').classList.toggle('removing', removePassword);
      updateEncStatus();
    });

    // Custom link: validate as you type and check availability by its lookup id only
    function setLinkHint(message, kind = '') {
      if (!linkHint) return;
      linkHint.textContent = message;
      linkHint.className = `link-hint ${kind}`;
    }
    function defaultLinkHint() {
      if (!currentUser) return setLinkHint('Sign in to choose your own link');
      if (!linkLeft) return setLinkHint(`You’ve used all ${account?.custom_limit ?? 0} custom links`, 'bad');
      setLinkHint(`${linkLeft} of ${account.custom_limit} left · easy words are easy to guess`);
    }
    let linkTimer;
    let linkCheck = 0;
    custom?.addEventListener('input', () => {
      clearTimeout(linkTimer);
      const value = normLink(custom.value);
      linkStatus.className = 'link-status';
      const check = ++linkCheck;
      if (!value) { linkState = { value: '', ok: true }; defaultLinkHint(); return; }
      const problem = linkProblem(value);
      if (problem) { linkState = { value, ok: false, message: problem }; setLinkHint(problem, 'bad'); linkStatus.classList.add('bad'); return; }
      linkState = { value, ok: false, pending: true, message: 'Checking…' };
      setLinkHint('Checking…');
      linkStatus.classList.add('busy');
      linkTimer = setTimeout(async () => {
        try {
          const { lookup } = await linkSecrets(value);
          const free = await api.linkAvailable(lookup);
          if (check !== linkCheck) return;
          linkState = { value, ok: free, message: free ? '' : 'That link is already taken' };
          setLinkHint(free ? `#/${value} is available` : 'That link is already taken', free ? 'good' : 'bad');
          linkStatus.className = `link-status ${free ? 'good' : 'bad'}`;
        } catch {
          if (check === linkCheck) { linkState = { value, ok: true }; setLinkHint(''); linkStatus.className = 'link-status'; }
        }
      }, 450);
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
      if (v === 'private' && !currentUser) v = 'unlisted';
      visibility = v;
      [...seg.querySelectorAll('button')].forEach((b, i) => {
        const on = b.dataset.value === v;
        b.setAttribute('aria-checked', String(on));
        if (on) seg.style.setProperty('--i', i);
      });
      updateEncStatus();
    }
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !b.disabled) { setVisibility(b.dataset.value); saveDraft(); }
    });
    seg.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const options = [...seg.querySelectorAll('button:not([disabled])')].map((b) => b.dataset.value);
      const i = options.indexOf(visibility);
      setVisibility(options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length]);
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
    setVisibility(draft.visibility || 'unlisted');
    burn.checked = !!draft.burn;
    defaultLinkHint();
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

    function reject(message, el = form) {
      shake(el);
      toast(message, 'error');
      if (el === form) ta.focus(); else el.querySelector('input')?.focus();
    }

    let busy = false;
    async function submit() {
      if (busy) return;
      const content = ta.value;
      if (!hasCrypto) return reject('Encryption isn’t available here — open QuickPaste over HTTPS');
      if (!content.trim()) return reject('Add some content first');
      if (content.length > MAX_CHARS) return reject('Paste is too large (max 500 KB)');
      if (custom && linkState.value && !linkState.ok) {
        return reject(linkState.pending ? 'Still checking your custom link…' : linkState.message, custom.closest('.row'));
      }
      if (currentUser && !vaultKey && !legacy) {
        toast('Unlock your account first so this paste is saved to My Pastes', 'error');
        location.hash = '#/mine';
        return;
      }
      if (password.value && password.value.length < 4) return reject('Use at least 4 characters for the password', password.closest('.row'));

      busy = true;
      createBtn.disabled = true;
      createBtn.classList.add('loading');

      const lang = language.value === 'auto' ? detectLanguage(content) : language.value;
      const keepExpiry = expires.value === 'keep';
      const expiresIn = expires.value && !keepExpiry ? Number(expires.value) : null;
      // A password paste is never listed: its link would have to be stored on the server.
      const hasPw = !removePassword && (!!password.value || (editing && existing.has_password));
      const finalVisibility = visibility === 'public' && hasPw && !legacy ? 'unlisted' : visibility;
      const input = {
        title: title.value.trim(), content, language: lang, visibility: finalVisibility, expiresIn,
        burn: burn.checked, password: password.value,
      };

      try {
        if (editing) {
          const saved = await savePaste(existing, {
            ...input, changeExpiry: !keepExpiry,
            passwordMode: removePassword ? 'remove' : input.password ? 'set' : 'keep',
          });
          cache.set(saved.link, saved);
          location.hash = `#/${saved.link}`;
          toast('Changes saved');
        } else {
          const { link, body } = await createPaste({ ...input, customLink: linkState.value || null });
          cache.set(link, {
            id: link, link, rowId: body.id, title: input.title, content, language: lang, visibility: finalVisibility,

            burn_after_read: input.burn, has_password: !!input.password, password: input.password || null,
            encrypted: !!body.enc, views: 0, own: true, is_owner: !!currentUser, is_custom: !!linkState.value,
            created_at: new Date().toISOString(),
            expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
          });
          clearTimeout(draftTimer);
          storage.del(DRAFT_KEY);
          if (linkState.value) refreshAccount();
          const copied = await copyText(pasteUrl(link)).catch(() => false);
          location.hash = `#/${link}`;
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
      await api.remove(p.rowId);
      if (p.link) cache.delete(p.link);
      if (p.is_custom) refreshAccount();
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
    const vis = VISIBILITY[p.visibility] || VISIBILITY.public;

    const meta = [
      `<span>${icon('clock')}<time datetime="${esc(p.created_at)}" title="${esc(new Date(p.created_at).toLocaleString())}">${esc(relativeTime(p.created_at))}</time></span>`,
      `<span>${icon('lines')}${plural(lines, 'line')} · ${formatBytes(byteLength(p.content))}</span>`,
      `<span>${icon(vis.icon)}${vis.label}</span>`,
    ];
    if (p.encrypted) meta.push(`<span class="secure">${icon('shield')}End-to-end encrypted</span>`);
    else if (owner) meta.push(`<span>${icon('unlock')}Not encrypted</span>`);
    if (p.has_password) meta.push(`<span>${icon('key')}Password</span>`);
    if (owner ? !p.own : !p.own && !p.burn_after_read) meta.push(`<span>${icon('eye')}${plural(p.views || 0, 'view')}</span>`);
    if (p.expires_at) meta.push(`<span>${icon('timer')}${isExpired(p) ? 'Expired' : `Expires ${esc(relativeTime(p.expires_at))}`}</span>`);

    const banners = [];
    const banner = (kind, glyph, heading, text) =>
      `<div class="banner ${kind} reveal" style="--d:2">${icon(glyph)}<div><strong>${heading}</strong>${text}</div></div>`;
    if (owner && isExpired(p)) {
      banners.push(banner('info', 'timer', 'This paste has expired', 'Only you can see it. Edit it and choose a new expiry to share it again.'));
    }
    if (p.burn_after_read) {
      if (owner) banners.push(banner('burn', 'flame', 'Burn after reading is on', 'The first person to open this link will see it — then it’s gone for good. You can view it here while signed in without burning it.'));
      else if (p.own) banners.push(banner('burn', 'flame', 'Burn after reading is on', 'The first person to open this link will see it — then it’s gone for good. Don’t open it yourself.'));
      else banners.push(banner('burn', 'flame', 'This paste has now been destroyed', 'It was set to burn after reading. Copy anything you need before leaving this page.'));
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
            ${owner ? `<a class="btn" data-act="edit" href="#/edit/${esc(p.link)}">${icon('pencil')}<span>Edit</span></a>` : ''}
            <button class="btn" data-act="copy">${icon('copy')}<span>Copy</span></button>
            <button class="btn icon-only" data-act="share" title="Share" aria-label="Share">${icon('share')}</button>
            <button class="btn icon-only" data-act="raw" title="View raw" aria-label="View raw">${icon('doc')}</button>
            <button class="btn icon-only" data-act="download" title="Download" aria-label="Download">${icon('download')}</button>
            <button class="btn icon-only" data-act="fork" title="Duplicate as new paste" aria-label="Duplicate as new paste">${icon('duplicate')}</button>
            ${owner || p.own ? '' : `<button class="btn icon-only" data-act="report" title="Report" aria-label="Report">${icon('flag')}</button>`}
          </div>
        </header>
        ${banners.join('')}
      </article>`).firstElementChild;
    const code = codeBlock(p.content, lang);
    code.classList.add('reveal');
    code.style.setProperty('--d', 2);
    page.appendChild(code);

    const filename = () => {
      const base = (p.title || p.link).replace(/[^\w.\- ]+/g, '').trim() || p.link;
      const ext = LANG_TO_EXT[lang] || 'txt';
      return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${ext}`;
    };

    $('.toolbar', page).addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      switch (btn.dataset.act) {
        case 'link':
          toast((await copyText(pasteUrl(p.link))) ? 'Link copied' : 'Couldn’t copy link');
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
          prefill = { title: p.title, content: p.content, language: lang, visibility: p.visibility === 'public' ? 'public' : 'unlisted' };
          location.hash = '#/';
          break;
        case 'report':
          openReport(p);
          break;
      }
    });

    page.docTitle = `${name} · QuickPaste`;
    return page;
  }

  function openReport(p) {
    const reasons = REPORT_REASONS.map(([v, l], i) => `
      <label class="choice"><input type="radio" name="reason" value="${v}" ${i === 0 ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('');
    const { el, close } = openModal(`
      <form class="report-form" novalidate>
        <div class="dialog-icon">${icon('flag')}</div>
        <h2>Report this paste</h2>
        <p>Your report includes this paste’s link, encrypted in your browser so only the site admins can open it. It’s deleted once the report is handled.</p>
        <fieldset class="choices">${reasons}</fieldset>
        <textarea name="details" rows="3" maxlength="1000" placeholder="Anything else admins should know? (optional)"></textarea>
        ${p.has_password ? '<label class="check"><input type="checkbox" name="includePassword"><span>Include the password so admins can read it (also encrypted)</span></label>' : ''}
        <div class="dialog-actions">
          <button class="btn" type="button" data-v="0">Cancel</button>
          <button class="btn destructive" type="submit"><span class="label">Report</span><span class="spinner"></span></button>
        </div>
      </form>`);
    const form = $('form', el);
    $('[data-v="0"]', el).addEventListener('click', () => close(false));
    $('input[name=reason]', el).focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      btn.classList.add('loading');
      try {
        const keys = hasCrypto ? await api.reportKeys() : [];
        const secret = { link: p.link, password: form.elements.includePassword?.checked ? p.password : null };
        await api.report({
          id: p.rowId, sealed: await sealForAdmins(secret, keys, p.rowId),
          reason: form.elements.reason.value, details: form.elements.details.value,
        });

        close(true);
        toast('Thanks — the admins will take a look');
      } catch (err) {
        toast(err.message || 'Couldn’t send the report', 'error');
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });
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
            <span class="tag">${p.locked && !p.language ? `${icon('shield')}Encrypted` : esc(LANG_NAME[p.language] || p.language || 'Plain Text')}</span>
            <time datetime="${esc(p.created_at)}">${esc(relativeTime(p.created_at))}</time>
          </div>
          <h3>${esc(p.title || (p.locked ? 'Protected paste' : 'Untitled'))}</h3>
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

  function viewUnlockVault(next = async () => viewMine(await loadMine()), copy = {}) {
    return viewPasswordPrompt({
      glyph: 'unlock',
      heading: copy.heading || 'Unlock your pastes',
      text: copy.text || 'Your links are encrypted with your account password, so even we can’t see them. Enter it to unlock them on this device.',

      label: 'Unlock',
      autocomplete: 'current-password',
      async onSubmit(pw) {
        await api.auth.signIn(currentUser.email, pw); // verifies the password
        await unlockVault(pw);
        toast('Unlocked');
        return next();
      },
    });
  }

  function viewMine(list) {
    if (!list.length) {
      const empty = emptyState('tray', 'No pastes yet', 'Pastes you create while signed in will show up here, ready to edit and share.', true);
      empty.docTitle = 'My Pastes · QuickPaste';
      return empty;
    }

    const rowHtml = (p, i) => {
      const pills = [];
      if (p.encrypted) pills.push(`<span class="pill green">${icon('shield')}Encrypted</span>`);
      else pills.push(`<span class="pill">${icon('unlock')}Not encrypted</span>`);
      if (p.is_custom) pills.push(`<span class="pill blue">${icon('link')}Custom link</span>`);
      if (p.visibility !== 'public') pills.push(`<span class="pill">${icon(VISIBILITY[p.visibility].icon)}${VISIBILITY[p.visibility].label}</span>`);
      if (p.has_password) pills.push(`<span class="pill">${icon('key')}Password</span>`);
      if (p.burn_after_read) pills.push(`<span class="pill orange">${icon('flame')}Burn</span>`);
      if (p.expired) pills.push(`<span class="pill red">${icon('timer')}Expired</span>`);
      else if (p.expires_at) pills.push(`<span class="pill">${icon('timer')}${esc(relativeTime(p.expires_at))}</span>`);
      const details = [p.link ? `#/${p.link}` : 'Link unavailable', relativeTime(p.created_at), plural(p.views || 0, 'view')];
      const main = `
        ${langBadge(p.language, !p.link)}
        <span class="mine-text">
          <strong>${esc(p.title || (p.link ? 'Untitled' : 'Locked paste'))}</strong>
          <small>${details.map(esc).join(' · ')}</small>
          <span class="pills">${pills.join('')}</span>
        </span>`;
      return `
        <li class="mine-row reveal" style="--d:${Math.min(i, 12) + 1}" data-row="${esc(p.rowId)}">
          ${p.link ? `<a class="mine-main" href="#/${esc(p.link)}">${main}</a>` : `<div class="mine-main">${main}</div>`}
          <div class="mine-actions">
            ${p.link ? `<button class="btn icon-only ghost" type="button" data-act="share" title="Share" aria-label="Share">${icon('share')}</button>
            <a class="btn icon-only ghost" href="#/edit/${esc(p.link)}" title="Edit" aria-label="Edit">${icon('pencil')}</a>` : ''}
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
      const links = account ? ` · ${account.custom_used} of ${account.custom_limit} custom links used` : '';
      count.textContent = `${plural(list.length, 'paste')}${links}`;
    };
    updateCount();

    $('.mine-list', page).addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const row = btn.closest('.mine-row');
      const p = list.find((x) => x.rowId === row.dataset.row);
      if (btn.dataset.act === 'share') return sharePaste(p);
      if (btn.dataset.act === 'delete' && (await deletePaste(p))) {
        list.splice(list.indexOf(p), 1);
        if (p.is_custom && account) account.custom_used = Math.max(0, account.custom_used - 1);
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

  // ───────── View: files ─────────

  // data: { used, quota, files } for signed-in users, null for guests.
  function viewFiles(data) {
    const guest = !currentUser;
    const expOptions = FILE_EXPIRATIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    const guestTtl = guestTtlLabel(site.guest_file_ttl_minutes);
    const page = html(`
      <div class="page page-files">
        <header class="page-head">
          <h1 class="reveal">Files</h1>
          <p class="reveal" style="--d:1">${guest
            ? 'Share a file with an encrypted link — no account needed.'
            : 'Your encrypted cloud. Files stay private until you share their link.'}</p>
        </header>
        ${data ? `
          <div class="storage card reveal" style="--d:1">
            <div class="storage-top"><strong class="storage-used"></strong><span class="storage-of"></span></div>
            <div class="storage-bar"><span></span></div>
          </div>` : ''}
        <label class="dropzone card reveal" style="--d:2">
          <input type="file" multiple hidden>
          <span class="dz-icon">${icon('upload')}</span>
          <strong>Drop files here or click to choose</strong>
          <small>Up to ${formatBytes(fileMax())} each · encrypted in your browser before upload</small>
        </label>
        ${guest ? `
          <p class="upload-options guest-ttl reveal" style="--d:2">${icon('timer')}<span>Deleted automatically after <strong>${guestTtl}</strong></span></p>
          <p class="create-note"><span>Guest uploads are limited to ${formatBytes(GUEST_FILE_MAX)}. <a href="#/login">Sign in</a> for private storage you control.</span></p>` : `
          <div class="upload-options reveal" style="--d:2">
            <span>Expires</span>
            <label class="select small"><select name="expires" aria-label="Expiration">${expOptions}</select></label>
          </div>`}
        <ul class="upload-queue"></ul>
        ${data ? '<h2 class="section-label reveal" style="--d:3">Your files</h2><ul class="mine-list card file-list reveal" style="--d:3"></ul>' : ''}
      </div>`).firstElementChild;

    const input = $('input[type=file]', page);
    const zone = $('.dropzone', page);
    const queue = $('.upload-queue', page);
    const expires = $('select[name=expires]', page);
    const list = $('.file-list', page);

    function renderUsage() {
      if (!data) return;
      const pct = data.quota ? Math.min(100, (data.used / data.quota) * 100) : 100;
      $('.storage-used', page).textContent = formatBytes(data.used);
      $('.storage-of', page).textContent = `of ${formatBytes(data.quota)} used`;
      const bar = $('.storage-bar span', page);
      bar.style.width = `${pct}%`;
      bar.classList.toggle('full', pct >= 90);
    }

    const fileRow = (f) => {
      const name = f.meta?.name || 'Locked file';
      const pills = [f.shared
        ? `<span class="pill blue">${icon('link')}Shared</span>`
        : `<span class="pill">${icon('lock')}Private</span>`];
      if (f.expired) pills.push(`<span class="pill red">${icon('timer')}Expired</span>`);
      else if (f.expires_at) pills.push(`<span class="pill">${icon('timer')}${esc(relativeTime(f.expires_at))}</span>`);
      const details = [formatBytes(f.meta?.size ?? f.size), relativeTime(f.created_at), plural(f.downloads || 0, 'view')];
      const main = `
        ${fileBadge(name, !f.link)}
        <span class="mine-text">
          <strong>${esc(name)}</strong>
          <small>${details.map(esc).join(' · ')}</small>
          <span class="pills">${pills.join('')}</span>
        </span>`;
      return `
        <li class="mine-row" data-id="${esc(f.id)}">
          ${f.link ? `<a class="mine-main" href="#/f/${esc(f.link)}">${main}</a>` : `<div class="mine-main">${main}</div>`}
          <div class="mine-actions">
            ${f.link ? `
              <button class="btn icon-only ghost" type="button" data-act="download" title="Download" aria-label="Download">${icon('download')}</button>
              <button class="btn icon-only ghost ${f.shared ? 'on' : ''}" type="button" data-act="share" title="${f.shared ? 'Stop sharing' : 'Share link'}" aria-label="${f.shared ? 'Stop sharing' : 'Share link'}" aria-pressed="${f.shared}">${icon('link')}</button>` : ''}
            <button class="btn icon-only ghost danger" type="button" data-act="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>
          </div>
        </li>`;
    };
    function renderList() {
      if (!list) return;
      list.innerHTML = data.files.length
        ? data.files.map(fileRow).join('')
        : `<li class="admin-empty">${icon('folder')}<span>No files yet — drop something above.</span></li>`;
    }

    list?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const f = data.files.find((x) => x.id === btn.closest('.mine-row').dataset.id);
      if (btn.dataset.act === 'download') {
        btn.disabled = true;
        try { await downloadFile(await openFile(f.link)); } catch (err) { toast(err.message, 'error'); }
        btn.disabled = false;
      }
      if (btn.dataset.act === 'share') {
        try {
          const row = await api.files.setShared(f.id, !f.shared);
          f.shared = row.shared;
          if (f.shared) {
            const copied = await copyText(fileUrl(f.link));
            toast(copied ? 'Sharing on — link copied' : 'Sharing on');
          } else {
            toast('Sharing off — only you can open it');
          }
          renderList();
        } catch (err) {
          toast(err.message, 'error');
        }
      }
      if (btn.dataset.act === 'delete' && (await deleteMyFile(f))) {
        data.files.splice(data.files.indexOf(f), 1);
        data.used = Math.max(0, data.used - f.size);
        renderList();
        renderUsage();
      }
    });

    async function handle(files) {
      for (const file of files) {
        const item = html(`
          <li class="upload-item">
            ${fileBadge(file.name)}
            <span class="mine-text"><strong>${esc(file.name)}</strong><small class="status">Encrypting…</small></span>
            <span class="spinner dark"></span>
          </li>`).firstElementChild;
        queue.prepend(item);
        const status = $('.status', item);
        try {
          status.textContent = `Encrypting and uploading ${formatBytes(file.size)}…`;
          const expiresIn = expires?.value ? Number(expires.value) : null; // guests: set by the server
          const f = await uploadFile(file, expiresIn);
          item.classList.add('done');
          $('.spinner', item).remove();
          status.innerHTML = `Uploaded · <a href="#/f/${esc(f.link)}">#/f/${esc(f.link)}</a>`;
          item.insertAdjacentHTML('beforeend', `<button class="btn small" type="button">${icon('link')}<span>Copy link</span></button>`);
          $('button', item).addEventListener('click', async () => toast((await copyText(fileUrl(f.link))) ? 'Link copied' : 'Couldn’t copy'));
          if (data) {
            data.files.unshift({ ...f, meta: f.meta });
            data.used += f.size;
            renderList();
            renderUsage();
            refreshAccount();
          }
        } catch (err) {
          item.classList.add('failed');
          $('.spinner', item)?.remove();
          status.textContent = err.message || 'Upload failed';
        }
      }
    }

    input.addEventListener('change', () => { handle([...input.files]); input.value = ''; });
    let depth = 0;
    zone.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; zone.classList.add('dragging'); } });
    zone.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; zone.classList.remove('dragging'); } });
    zone.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      zone.classList.remove('dragging');
      handle([...(e.dataTransfer?.files || [])]);
    });

    renderUsage();
    renderList();
    page.docTitle = 'Files · QuickPaste';
    return page;
  }

  const fileUrl = (link) => `${location.origin}${location.pathname}#/f/${link}`;

  function viewFile(f) {
    const owner = !!f.is_owner;
    const meta = [
      `<span>${icon('doc')}${esc(formatBytes(f.meta.size ?? f.size))}</span>`,
      `<span class="secure">${icon('shield')}End-to-end encrypted</span>`,
      `<span>${icon('clock')}${esc(relativeTime(f.created_at))}</span>`,
    ];
    if (f.expires_at) meta.push(`<span>${icon('timer')}${f.expired ? 'Expired' : `Expires ${esc(relativeTime(f.expires_at))}`}</span>`);
    if (owner) meta.push(`<span>${icon('eye')}${plural(f.downloads || 0, 'view')}</span>`);

    const page = html(`
      <div class="page page-file">
        <div class="file-card card reveal">
          <div class="file-glyph">${esc(fileExt(f.meta.name))}</div>
          <h1>${esc(f.meta.name)}</h1>
          <div class="meta">${meta.join('')}</div>
          ${owner && !f.shared ? `<div class="banner info">${icon('lock')}<div>Only you can open this link. Turn on sharing to let others download it.</div></div>` : ''}
          <div class="file-actions">
            <button class="btn primary large" type="button" data-act="download"><span class="label">${icon('download')} Download</span><span class="spinner"></span></button>
            <div class="file-secondary">
              <button class="btn" type="button" data-act="copy">${icon('link')}<span>Copy Link</span></button>
              ${owner ? `<button class="btn" type="button" data-act="share">${icon(f.shared ? 'lock' : 'share')}<span>${f.shared ? 'Stop Sharing' : 'Share'}</span></button>
                <button class="btn icon-only danger-soft" type="button" data-act="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>` : ''}
            </div>
          </div>
          <p class="fine">Decrypted in your browser — ${owner ? 'the server only ever sees scrambled bytes.' : 'the server never sees this file.'}</p>
        </div>
      </div>`).firstElementChild;

    $('.file-actions', page).addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'download') {
        btn.disabled = true;
        btn.classList.add('loading');
        try { await downloadFile(f); } catch (err) { toast(err.message, 'error'); }
        btn.disabled = false;
        btn.classList.remove('loading');
      }
      if (btn.dataset.act === 'copy') toast((await copyText(fileUrl(f.link))) ? 'Link copied' : 'Couldn’t copy link');
      if (btn.dataset.act === 'share') {
        try {
          const row = await api.files.setShared(f.id, !f.shared);
          toast(row.shared ? 'Sharing on — anyone with the link can download it' : 'Sharing off — only you can open it');
          navigate();
        } catch (err) {
          toast(err.message, 'error');
        }
      }
      if (btn.dataset.act === 'delete' && (await deleteMyFile(f))) location.hash = '#/files';
    });

    page.docTitle = `${f.meta.name} · QuickPaste`;
    return page;
  }

  // ───────── View: admin dashboard ─────────

  const ADMIN_TABS = [['reports', 'Reports'], ['pastes', 'Pastes'], ['files', 'Files'], ['users', 'Users'], ['settings', 'Settings']];

  function viewAdmin(tab, stats) {
    const index = ADMIN_TABS.findIndex(([k]) => k === tab);
    const tile = (label, value, glyph, color) => `
      <div class="stat card"><span class="stat-icon" style="--c:${color}">${icon(glyph)}</span>
        <span class="stat-text"><strong>${Number(value || 0).toLocaleString()}</strong><small>${label}</small></span></div>`;
    const page = html(`
      <div class="page page-admin">
        <header class="page-head">
          <p class="eyebrow reveal">Admin</p>
          <h1 class="reveal" style="--d:1">Dashboard</h1>
        </header>
        <div class="stats reveal" style="--d:1">
          ${tile('Open reports', stats.open_reports, 'flag', '#ff3b30')}
          ${tile('Pastes', stats.pastes, 'doc', '#0a84ff')}
          ${tile(`Files · ${formatBytes(stats.storage_bytes || 0)}`, stats.files, 'folder', '#34c759')}
          ${tile('Users', stats.users, 'users', '#5e5ce6')}
        </div>
        <nav class="segmented admin-tabs reveal" style="--d:2;--n:${ADMIN_TABS.length};--i:${index}" aria-label="Admin sections">
          ${ADMIN_TABS.map(([k, l]) => `<a href="#/admin/${k}" aria-current="${k === tab ? 'page' : 'false'}">${l}</a>`).join('')}
        </nav>
        <section class="admin-panel reveal" style="--d:3"></section>
      </div>`).firstElementChild;

    const panel = $('.admin-panel', page);
    const renderers = { reports: adminReports, pastes: adminPastes, files: adminFiles, users: adminUsers, settings: adminSettings };
    const refreshStats = async () => {
      try {
        const s = await api.admin.overview();
        const values = [s.open_reports, s.pastes, s.files, s.users];
        page.querySelectorAll('.stat strong').forEach((n, i) => { n.textContent = Number(values[i] || 0).toLocaleString(); });
        page.querySelectorAll('.stat small')[2].textContent = `Files · ${formatBytes(s.storage_bytes || 0)}`;
      } catch { /* keep old numbers */ }
    };
    renderers[tab](panel, { refreshStats, stats });
    page.docTitle = 'Admin · QuickPaste';
    return page;
  }

  async function adminAction(fn, success) {
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (err) {
      toast(err.message || 'Something went wrong', 'error');
      return false;
    }
  }

  const confirmDeletePaste = () => confirmDialog({
    title: 'Delete this paste?', message: 'It will be removed for everyone. This can’t be undone.',
    confirmLabel: 'Delete', destructive: true,
  });

  function adminReports(panel, ctx) {
    let status = 'open';
    panel.innerHTML = `
      <div class="panel-bar">
        <div class="segmented small" style="--n:2;--i:0" role="radiogroup" aria-label="Report status">
          <button type="button" role="radio" aria-checked="true" data-value="open">Open</button>
          <button type="button" role="radio" aria-checked="false" data-value="all">All</button>
        </div>
      </div>
      <ul class="admin-list card"></ul>`;
    const list = $('.admin-list', panel);
    const seg = $('.segmented', panel);
    let reports = [];

    async function load() {
      try {
        reports = await api.admin.reports(status);
      } catch (err) {
        list.innerHTML = `<li class="admin-empty">${esc(err.message)}</li>`;
        return;
      }
      if (!reports.length) {
        list.innerHTML = `<li class="admin-empty">${icon('check')}<span>${status === 'open' ? 'No open reports. All clear!' : 'No reports yet.'}</span></li>`;
        return;
      }
      await decryptReports(reports);
      list.innerHTML = reports.map((r) => {
        const what = !r.paste_exists ? 'Paste no longer exists' : r.title || (r.encrypted ? 'Encrypted paste' : 'Untitled');
        const who = [`Reported ${relativeTime(r.created_at)}`, r.reporter_email ? `by ${r.reporter_email}` : 'anonymously'];
        if (r.owner_email) who.push(`owner ${r.owner_email}`);
        const vis = VISIBILITY[r.visibility];
        return `
          <li class="admin-item report" data-id="${r.id}">
            <div class="admin-item-main">
              <span class="pills">
                <span class="pill red">${icon('flag')}${esc(REASON_NAME[r.reason] || r.reason)}</span>
                ${r.status !== 'open' ? `<span class="pill">${esc(r.status[0].toUpperCase() + r.status.slice(1))}</span>` : ''}
                ${r.paste_exists && vis ? `<span class="pill">${icon(vis.icon)}${vis.label}</span>` : ''}
                ${r.encrypted ? `<span class="pill green">${icon('shield')}Encrypted</span>` : ''}
              </span>
              <strong>${esc(what)}</strong>
              <small>${esc(who.join(' · '))}${r.secret?.link ? ` · <code>#/${esc(r.secret.link)}</code>` : ''}</small>
              ${r.status === 'open' && r.paste_exists && !r.secret ? `<small class="report-note">${icon('lock')}${esc(
                r.sealed ? 'The link is encrypted for another admin’s key. It becomes readable here once that admin opens the dashboard.'
                  : 'This report has no link, so an encrypted paste can’t be read.')}</small>` : ''}
              ${r.details ? `<p class="report-details">${esc(r.details)}</p>` : ''}
            </div>
            <div class="admin-actions">
              ${r.paste_exists ? `<button class="btn small" type="button" data-act="review">${icon('eye')}<span>Review</span></button>` : ''}
              ${r.paste_exists && r.visibility !== 'private' ? `<button class="btn small" type="button" data-act="hide">${icon('lock')}<span>Make private</span></button>` : ''}
              ${r.paste_exists ? `<button class="btn small danger-soft" type="button" data-act="delete">${icon('trash')}<span>Delete</span></button>` : ''}
              ${r.status === 'open'
                ? `<button class="btn small" type="button" data-act="resolved">${icon('check')}<span>Resolve</span></button>
                   <button class="btn small ghost" type="button" data-act="dismissed">Dismiss</button>`
                : '<button class="btn small ghost" type="button" data-act="open">Reopen</button>'}
            </div>
          </li>`;
      }).join('');
    }

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const r = reports.find((x) => String(x.id) === btn.closest('.admin-item').dataset.id);
      const act = btn.dataset.act;
      const done = () => { load(); ctx.refreshStats(); };
      if (act === 'review') return reviewPaste(r.paste_id, { link: r.secret?.link, password: r.secret?.password, onChange: done });
      let ok = false;
      if (act === 'hide') ok = await adminAction(() => api.admin.setVisibility(r.paste_id, 'private'), 'Paste is now private');
      if (act === 'delete') {
        if (!(await confirmDeletePaste())) return;
        ok = await adminAction(async () => {
          await api.admin.deletePaste(r.paste_id);
          if (r.status === 'open') await api.admin.setReportStatus(r.id, 'resolved');
        }, 'Paste deleted');
      }
      if (['resolved', 'dismissed', 'open'].includes(act)) {
        ok = await adminAction(() => api.admin.setReportStatus(r.id, act), act === 'open' ? 'Report reopened' : `Report ${act}`);
      }
      if (ok) done();
    });

    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      status = b.dataset.value;
      [...seg.children].forEach((n, i) => {
        n.setAttribute('aria-checked', String(n === b));
        if (n === b) seg.style.setProperty('--i', i);
      });
      load();
    });
    load();
  }

  // Decrypt each report's link with this admin's key. Reports from older versions
  // (plain-text link) and reports sealed before another admin joined are re-encrypted
  // for every current admin key, which also wipes the plain text from the database.
  async function decryptReports(reports) {
    const me = await ensureAdminKey().catch(() => null);
    const keys = me ? await api.reportKeys().catch(() => []) : [];
    for (const r of reports) {
      r.secret = (me && r.sealed ? await openForAdmin(r.sealed, me, r.paste_id) : null)
        || (r.link ? { link: r.link, password: r.password || null } : null);
      const missingKey = keys.some((k) => !r.sealed?.keys?.[k.key_id]);
      if (r.secret && r.status === 'open' && r.paste_id && keys.length && (r.link || r.password || missingKey)) {
        sealForAdmins(r.secret, keys, r.paste_id)
          .then((sealed) => api.admin.sealReport(r.id, sealed))
          .catch(() => { /* try again next time */ });
      }
    }
  }

  // Admin review: plain pastes show directly; encrypted ones only with the link (and password) from a report.
  async function reviewPaste(rowId, { link = null, password = null, onChange } = {}) {
    let row;
    try { row = await api.admin.getPaste(rowId); } catch (err) { toast(err.message, 'error'); return; }
    if (!row) { toast('That paste no longer exists', 'error'); onChange?.(); return; }
    let paste = null;
    let problem = '';
    try {
      if (!row.encrypted) paste = row;
      else if (!link) problem = 'This paste is end-to-end encrypted. Admins can only read encrypted pastes that were reported with their link.';
      else paste = await decodeRow(row, normLink(link), password);
    } catch (err) {
      problem = err.needPassword
        ? 'This paste has a password and the report didn’t include it, so it can’t be decrypted.'
        : 'The reported link didn’t decrypt this paste.';
    }
    const vis = VISIBILITY[row.visibility] || VISIBILITY.public;
    const { el, close } = openModal(`
      <div class="review">
        <div class="review-head">
          <div>
            <p class="eyebrow">${esc(paste ? LANG_NAME[paste.language] || paste.language || 'Plain Text' : 'Encrypted')}</p>
            <h2>${esc(paste?.title || 'Untitled')}</h2>
            <div class="meta">
              <span>${icon(vis.icon)}${vis.label}</span>
              <span>${icon('clock')}${esc(relativeTime(row.created_at))}</span>
              <span>${icon('eye')}${plural(row.views || 0, 'view')}</span>
              ${row.encrypted ? `<span class="secure">${icon('shield')}Encrypted</span>` : ''}
            </div>
          </div>
          <button class="btn icon-only ghost close" type="button" aria-label="Close">${icon('x')}</button>
        </div>
        <div class="review-body">${problem ? `<div class="banner info">${icon('lock')}<div>${esc(problem)}</div></div>` : ''}</div>
        <div class="review-actions">
          <label class="select"><select name="visibility" aria-label="Visibility">
            ${Object.entries(VISIBILITY).map(([k, v]) => `<option value="${k}" ${k === row.visibility ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select></label>
          <button class="btn destructive" type="button" data-act="delete">${icon('trash')}<span>Delete Paste</span></button>
        </div>
      </div>`, { wide: true });
    if (paste) $('.review-body', el).appendChild(codeBlock(paste.content, paste.language || 'plaintext'));
    $('.close', el).addEventListener('click', () => close(false));
    $('select[name=visibility]', el).addEventListener('change', async (e) => {
      const value = e.target.value;
      if (await adminAction(() => api.admin.setVisibility(rowId, value), `Paste is now ${VISIBILITY[value].label.toLowerCase()}`)) {
        row.visibility = value;
        onChange?.();
      } else {
        e.target.value = row.visibility;
      }
    });
    $('[data-act=delete]', el).addEventListener('click', async () => {
      if (!(await confirmDeletePaste())) return;
      if (await adminAction(() => api.admin.deletePaste(rowId), 'Paste deleted')) { close(true); onChange?.(); }
    });
  }

  function adminPastes(panel, ctx) {
    panel.innerHTML = `
      <div class="panel-bar">
        <input class="search" type="search" placeholder="Search by title, public link, owner email or id" aria-label="Search pastes">
      </div>
      <ul class="admin-list card"></ul>`;
    const list = $('.admin-list', panel);
    const search = $('.search', panel);

    async function load() {
      let rows;
      try {
        rows = await api.admin.pastes(search.value.trim());
      } catch (err) {
        list.innerHTML = `<li class="admin-empty">${esc(err.message)}</li>`;
        return;
      }
      if (!rows.length) {
        list.innerHTML = `<li class="admin-empty">${icon('tray')}<span>No pastes found.</span></li>`;
        return;
      }
      list.innerHTML = rows.map((p) => {
        const pills = [p.encrypted ? `<span class="pill green">${icon('shield')}Encrypted</span>` : `<span class="pill">${icon('unlock')}Readable</span>`];
        if (p.is_custom) pills.push(`<span class="pill blue">${icon('link')}Custom</span>`);
        if (p.has_password) pills.push(`<span class="pill">${icon('key')}Password</span>`);
        if (p.burn_after_read) pills.push(`<span class="pill orange">${icon('flame')}Burn</span>`);
        if (p.expired) pills.push(`<span class="pill red">${icon('timer')}Expired</span>`);
        if (p.open_reports) pills.push(`<span class="pill red">${icon('flag')}${plural(p.open_reports, 'report')}</span>`);
        const name = p.title || (p.encrypted ? 'Encrypted paste' : 'Untitled');
        const sub = [p.owner_email || 'Anonymous', relativeTime(p.created_at), plural(p.views || 0, 'view'), formatBytes(p.size || 0)];
        const link = p.public_slug || (isLegacyRow(p.id) ? p.id : null);
        return `
          <li class="admin-item" data-id="${esc(p.id)}">
            ${langBadge(p.language, p.encrypted)}
            <div class="admin-item-main">
              <strong>${esc(name)}</strong>
              <small>${esc(sub.join(' · '))}${link ? ` · <code>#/${esc(link)}</code>` : ''}</small>
              <span class="pills">${pills.join('')}</span>
            </div>
            <div class="admin-actions">
              ${p.encrypted ? '' : `<button class="btn small" type="button" data-act="review">${icon('eye')}<span>View</span></button>`}
              <label class="select small"><select data-act="visibility" aria-label="Visibility">
                ${Object.entries(VISIBILITY).map(([k, v]) => `<option value="${k}" ${k === p.visibility ? 'selected' : ''}>${v.label}</option>`).join('')}
              </select></label>
              <button class="btn icon-only ghost danger" type="button" data-act="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>
            </div>
          </li>`;
      }).join('');
    }

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.closest('.admin-item').dataset.id;
      const done = () => { load(); ctx.refreshStats(); };
      if (btn.dataset.act === 'review') return reviewPaste(id, { onChange: done });
      if (btn.dataset.act === 'delete' && (await confirmDeletePaste())) {
        if (await adminAction(() => api.admin.deletePaste(id), 'Paste deleted')) done();
      }
    });
    list.addEventListener('change', async (e) => {
      const select = e.target.closest('select[data-act=visibility]');
      if (!select) return;
      const id = select.closest('.admin-item').dataset.id;
      const ok = await adminAction(() => api.admin.setVisibility(id, select.value), `Paste is now ${VISIBILITY[select.value].label.toLowerCase()}`);
      if (!ok) load();
    });
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
    load();
  }

  function adminFiles(panel, ctx) {
    panel.innerHTML = `
      <div class="panel-bar">
        <input class="search" type="search" placeholder="Search by owner email or id" aria-label="Search files">
        <button class="btn small" type="button" data-act="cleanup" title="Remove expired files and abandoned uploads">${icon('trash')}<span>Clean up</span></button>
      </div>
      <p class="panel-note">${icon('shield')}<span>File names and contents are encrypted — admins see only size, owner and dates.
        Guest pool: ${formatBytes(ctx.stats.guest_pool_used || 0)} of ${formatBytes((ctx.stats.guest_pool_mb ?? 200) * MB)} used.</span></p>
      <ul class="admin-list card"></ul>`;
    const list = $('.admin-list', panel);
    const search = $('.search', panel);
    let rows = [];

    async function load() {
      try {
        rows = await api.admin.files(search.value.trim());
      } catch (err) {
        list.innerHTML = `<li class="admin-empty">${esc(err.message)}</li>`;
        return;
      }
      if (!rows.length) {
        list.innerHTML = `<li class="admin-empty">${icon('folder')}<span>No files found.</span></li>`;
        return;
      }
      list.innerHTML = rows.map((f) => {
        const pills = [f.shared ? `<span class="pill blue">${icon('link')}Shared</span>` : `<span class="pill">${icon('lock')}Private</span>`];
        if (f.guest) pills.push(`<span class="pill orange">${icon('person')}Guest</span>`);
        if (f.expired) pills.push(`<span class="pill red">${icon('timer')}Expired</span>`);
        else if (f.expires_at) pills.push(`<span class="pill">${icon('timer')}${esc(relativeTime(f.expires_at))}</span>`);
        const sub = [f.owner_email || 'Guest', formatBytes(f.size), relativeTime(f.created_at), plural(f.downloads || 0, 'view')];
        return `
          <li class="admin-item" data-id="${esc(f.id)}">
            ${fileBadge('', true)}
            <div class="admin-item-main">
              <strong>Encrypted file</strong>
              <small>${esc(sub.join(' · '))}</small>
              <span class="pills">${pills.join('')}</span>
            </div>
            <div class="admin-actions">
              <button class="btn icon-only ghost danger" type="button" data-act="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>
            </div>
          </li>`;
      }).join('');
    }

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act=delete]');
      if (!btn) return;
      const f = rows.find((x) => x.id === btn.closest('.admin-item').dataset.id);
      const ok = await confirmDialog({
        title: 'Delete this file?', message: 'It will be removed from storage for everyone. This can’t be undone.',
        confirmLabel: 'Delete', destructive: true,
      });
      if (!ok) return;
      if (await adminAction(async () => {
        await api.files.removeObjects(f.bucket, [f.object_path]);
        await api.admin.deleteFile(f.id);
      }, 'File deleted')) { load(); ctx.refreshStats(); }
    });

    $('[data-act=cleanup]', panel).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      await adminAction(async () => {
        const items = await api.admin.cleanupCandidates();
        const byBucket = {};
        for (const it of items) (byBucket[it.bucket] ||= []).push(it.path);
        for (const [bucket, paths] of Object.entries(byBucket)) await api.files.removeObjects(bucket, paths);
        for (const it of items) if (it.file_id) await api.admin.deleteFile(it.file_id);
        toast(items.length ? `Removed ${plural(items.length, 'file')}` : 'Nothing to clean up');
      });
      btn.disabled = false;
      load();
      ctx.refreshStats();
    });

    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
    load();
  }

  function adminUsers(panel, ctx) {
    panel.innerHTML = `
      <div class="panel-bar">
        <input class="search" type="search" placeholder="Search by email" aria-label="Search users">
      </div>
      <ul class="admin-list card"></ul>`;
    const list = $('.admin-list', panel);
    const search = $('.search', panel);
    let users = [];

    async function load() {
      try {
        users = await api.admin.users(search.value.trim());
      } catch (err) {
        list.innerHTML = `<li class="admin-empty">${esc(err.message)}</li>`;
        return;
      }
      if (!users.length) {
        list.innerHTML = `<li class="admin-empty">${icon('users')}<span>No users found.</span></li>`;
        return;
      }
      list.innerHTML = users.map((u) => {
        const sub = [
          `Joined ${relativeTime(u.created_at)}`,
          u.last_sign_in_at ? `last sign-in ${relativeTime(u.last_sign_in_at)}` : 'never signed in',
          plural(u.pastes, 'paste'),
        ];
        return `
          <li class="admin-item" data-id="${esc(u.id)}">
            <span class="avatar" aria-hidden="true">${esc((u.email || '?')[0].toUpperCase())}</span>
            <div class="admin-item-main">
              <strong>${esc(u.email)}</strong>
              <small>${esc(sub.join(' · '))}</small>
              <span class="pills">
                ${u.is_admin ? `<span class="pill blue">${icon('shield')}Admin</span>` : ''}
                ${u.is_me ? '<span class="pill">You</span>' : ''}
                <span class="pill">${icon('link')}${u.custom_used} of ${u.custom_limit} custom links${u.custom_limit_override == null ? ' (default)' : ''}</span>
                <span class="pill">${icon('folder')}${formatBytes(u.storage_used || 0)} of ${formatBytes(u.storage_quota || 0)}${u.storage_quota_override == null ? ' (default)' : ''}</span>
              </span>
            </div>
            <div class="admin-actions">
              <div class="limit-group">
                <label class="limit-field" title="Custom link limit">
                  <span>Links</span>
                  <input type="number" name="links" min="0" max="10000" step="1" value="${u.custom_limit}" aria-label="Custom link limit for ${esc(u.email)}">
                </label>
                <button class="btn small" type="button" data-act="limit">Save</button>
                ${u.custom_limit_override != null ? '<button class="btn small ghost" type="button" data-act="reset">Default</button>' : ''}
              </div>
              <div class="limit-group">
                <label class="limit-field" title="Storage limit in MB">
                  <span>MB</span>
                  <input type="number" name="storage" min="0" max="100000" step="1" value="${Math.round((u.storage_quota || 0) / MB)}" aria-label="Storage limit in MB for ${esc(u.email)}">
                </label>
                <button class="btn small" type="button" data-act="storage">Save</button>
                ${u.storage_quota_override != null ? '<button class="btn small ghost" type="button" data-act="storage-reset">Default</button>' : ''}
              </div>
              <button class="btn icon-only ghost danger" type="button" data-act="delete" title="${u.is_me || u.is_admin ? 'Admins can’t be deleted here' : 'Delete user'}" aria-label="Delete user" ${u.is_me || u.is_admin ? 'disabled' : ''}>${icon('trash')}</button>
            </div>
          </li>`;
      }).join('');
    }

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const item = btn.closest('.admin-item');
      const u = users.find((x) => x.id === item.dataset.id);
      if (btn.dataset.act === 'storage') {
        const value = Number($('input[name=storage]', item).value);
        if (!Number.isInteger(value) || value < 0 || value > 100000) return toast('Enter a number of MB from 0 to 100,000', 'error');
        if (await adminAction(() => api.admin.setUserStorage(u.id, value), `${u.email} can now store ${value} MB`)) {
          load();
          if (u.is_me) refreshAccount();
        }
      }
      if (btn.dataset.act === 'storage-reset') {
        if (await adminAction(() => api.admin.setUserStorage(u.id, null), `${u.email} is back to the default storage`)) {
          load();
          if (u.is_me) refreshAccount();
        }
      }
      if (btn.dataset.act === 'limit') {
        const value = Number($('input[name=links]', item).value);
        if (!Number.isInteger(value) || value < 0 || value > 10000) return toast('Enter a number from 0 to 10,000', 'error');
        if (await adminAction(() => api.admin.setUserLimit(u.id, value), `${u.email} can now use ${plural(value, 'custom link')}`)) {
          load();
          if (u.is_me) refreshAccount();
        }
      }
      if (btn.dataset.act === 'reset') {
        if (await adminAction(() => api.admin.setUserLimit(u.id, null), `${u.email} is back to the default limit`)) {
          load();
          if (u.is_me) refreshAccount();
        }
      }
      if (btn.dataset.act === 'delete') {
        const ok = await confirmDialog({
          title: `Delete ${u.email}?`,
          message: `Their account, ${plural(u.pastes, 'paste')} and ${plural(u.files || 0, 'file')} will be deleted. This can’t be undone.`,
          confirmLabel: 'Delete User', destructive: true,
        });
        const removeAll = async () => {
          // Storage bytes aren't deleted by the database cascade, so remove them first.
          await api.files.removeObjects('files', (await api.admin.userFilePaths(u.id)) || []);
          await api.admin.deleteUser(u.id);
        };
        if (ok && (await adminAction(removeAll, 'User deleted'))) { load(); ctx.refreshStats(); }
      }
    });
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
    load();
  }

  function adminSettings(panel, ctx) {
    panel.innerHTML = `
      <h2 class="section-label">Custom links</h2>
      <div class="group card">
        <div class="row">
          <div class="row-label">
            <span class="row-icon" style="background:#ff2d55">${icon('link')}</span>
            <span class="row-text">Default limit<small>Custom links each account can create, unless you set a personal limit under Users</small></span>
          </div>
          <div class="limit-inline">
            <input type="number" min="0" max="10000" step="1" value="${Number(ctx.stats.default_limit ?? 5)}" aria-label="Default custom link limit">
            <button class="btn small primary" type="button">Save</button>
          </div>
        </div>
      </div>
      <h2 class="section-label">File storage</h2>
      <div class="group card storage-settings">
        ${[
          ['storage_quota_mb', 'Registered users', 'Total storage per account, unless you set a personal limit under Users', '#34c759', 'person'],
          ['admin_storage_quota_mb', 'Admins', 'Total storage per admin account', '#0a84ff', 'shield'],
          ['guest_pool_mb', 'Guest pool', `Shared by all guest uploads (max ${formatBytes(GUEST_FILE_MAX)} each, always expire)`, '#ff9500', 'users'],
        ].map(([key, label, hint, color, glyph]) => `
          <div class="row">
            <div class="row-label">
              <span class="row-icon" style="background:${color}">${icon(glyph)}</span>
              <span class="row-text">${label}<small>${hint}</small></span>
            </div>
            <div class="limit-inline">
              <input type="number" min="0" max="100000" step="1" data-key="${key}" value="${Number(ctx.stats[key] ?? 0)}" aria-label="${label} storage in MB">
              <span class="unit">MB</span>
              <button class="btn small primary" type="button" data-save="${key}">Save</button>
            </div>
          </div>`).join('')}
        <div class="row">
          <div class="row-label">
            <span class="row-icon" style="background:#ff3b30">${icon('timer')}</span>
            <span class="row-text">Guest file lifetime<small>Guest files are deleted automatically after this time</small></span>
          </div>
          <div class="segmented guest-ttl-picker" role="radiogroup" aria-label="Guest file lifetime"
            style="--n:${GUEST_TTLS.length};--i:${Math.max(0, GUEST_TTLS.findIndex(([m]) => m === ctx.stats.guest_file_ttl_minutes))}">
            ${GUEST_TTLS.map(([m, l]) => `<button type="button" role="radio" aria-checked="${m === ctx.stats.guest_file_ttl_minutes}" data-ttl="${m}">${l.replace(' minutes', ' min')}</button>`).join('')}
          </div>
        </div>
      </div>
      <h2 class="section-label">Admins</h2>
      <div class="group card info-card">
        <p>To make someone an admin, run this in the Supabase SQL Editor:</p>
        <pre><code>insert into public.admins (user_id)
select id from auth.users where email = 'them@example.com';</code></pre>
        <p>Admins can’t read encrypted pastes unless someone reports one with its link. Reported links are encrypted for each admin’s key, which is created the first time that admin unlocks their account, so a new admin can read older reports once an existing admin opens the dashboard.</p>
      </div>
      <h2 class="section-label">Rate limiting</h2>
      <div class="group card info-card">
        <p>${ctx.stats.rate_limit_active
          ? `${icon('check')} Active. Visitors are limited per IP address (stored only as a salted hash): wrong paste passwords, new pastes, reports, uploads and lookups of links that don’t exist.`
          : `${icon('warn')} Limited. The server couldn’t see visitors’ IP addresses, so only the per-paste password limit applies.`}</p>
      </div>`;

    const ttlPicker = $('.guest-ttl-picker', panel);
    ttlPicker.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ttl]');
      if (!b || b.getAttribute('aria-checked') === 'true') return;
      const minutes = Number(b.dataset.ttl);
      if (!(await adminAction(() => api.admin.setGuestTtl(minutes), `Guest files are now deleted after ${guestTtlLabel(minutes)}`))) return;
      site.guest_file_ttl_minutes = minutes;
      [...ttlPicker.children].forEach((n, i) => {
        n.setAttribute('aria-checked', String(n === b));
        if (n === b) ttlPicker.style.setProperty('--i', i);
      });
    });
    $('.storage-settings', panel).addEventListener('click', async (e) => {
      const key = e.target.closest('[data-save]')?.dataset.save;
      if (!key) return;
      const value = Number($(`input[data-key=${key}]`, panel).value);
      if (!Number.isInteger(value) || value < 0 || value > 100000) return toast('Enter a number of MB from 0 to 100,000', 'error');
      if (await adminAction(() => api.admin.setStorageSetting(key, value), `Saved — ${value} MB`)) refreshAccount();
    });
    $('.limit-inline button', panel).addEventListener('click', async () => {
      const value = Number($('.limit-inline input', panel).value);
      if (!Number.isInteger(value) || value < 0 || value > 10000) return toast('Enter a number from 0 to 10,000', 'error');
      if (await adminAction(() => api.admin.setDefaultLimit(value), `Default limit is now ${value}`)) refreshAccount();
    });
  }

  // ───────── View: sign in / create account ─────────

  function viewAuth({ returnTo = '#/mine', note = '' } = {}) {
    let mode = 'signin';
    const copy = {
      signin: { title: 'Sign in to QuickPaste', button: 'Sign In', fine: 'New here? Choose Create Account above.' },
      signup: { title: 'Create your account', button: 'Create Account', fine: `Use at least ${MIN_PASSWORD} characters. Your password also unlocks your encrypted list of pastes, so keep it safe.` },
    };

    const page = html(`
      <div class="page auth-page">
        <div class="auth-card card reveal">
          <img class="auth-icon" src="assets/icon.svg" alt="" width="60" height="60">
          <h1 class="auth-title">${copy.signin.title}</h1>
          <p class="auth-sub">${esc(note || 'Custom links, private pastes, and one place to edit, share and manage them.')}</p>
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
        <p class="auth-sub">We sent a confirmation link to <strong>${esc(address)}</strong>. Open it to finish creating your account, then sign in.</p>
        <button class="btn block back" type="button">Back to Sign In</button>`;
      card.animate?.([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
      $('.back', card).addEventListener('click', () => navigate());
    }

    async function afterSignIn(user, pw, message) {
      await setUser(user);
      try {
        if (hasCrypto) await unlockVault(pw);
      } catch {
        toast('Signed in, but your saved links couldn’t be unlocked', 'error');
      }
      toast(message);
      if (location.hash === returnTo) navigate(); else location.hash = returnTo;
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
          await afterSignIn(await api.auth.signIn(address, password.value), password.value, 'Signed in');
        } else {
          const res = await api.auth.signUp(address, password.value);
          if (res.needsConfirmation) return showCheckEmail(address);
          await afterSignIn(res.user, password.value, 'Account created');
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

  // ───────── Password prompts ─────────

  const notFoundState = () =>
    emptyState('question', 'Paste not found', 'This paste doesn’t exist, has expired, is private, or was burned after reading.', true);

  // onSubmit(password) resolves to the next page, or throws an Error to show.
  function viewPasswordPrompt({ glyph = 'lock', heading, text, label = 'Unlock', autocomplete = 'off', onSubmit }) {
    const page = html(`
      <div class="page empty unlock">
        <div class="glyph reveal">${icon(glyph)}</div>
        <h1 class="reveal" style="--d:1">${esc(heading)}</h1>
        <p class="reveal" style="--d:2">${esc(text)}</p>
        <form class="unlock-form reveal" style="--d:3" novalidate>
          <input type="password" name="pw" placeholder="Password" autocomplete="${autocomplete}" aria-label="Password" required>
          <button class="btn primary" type="submit"><span class="label">${esc(label)}</span><span class="spinner"></span></button>
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
        const next = await onSubmit(input.value);
        if (token !== navToken) return; // user navigated away
        await swap(next, parseRoute());
      } catch (err) {
        fail(err.message || 'Something went wrong');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });

    page.docTitle = `${heading} · QuickPaste`;
    page.onMount = () => input.focus({ preventScroll: true });
    return page;
  }

  function viewLocked(raw, locked) {
    return viewPasswordPrompt({
      heading: 'Password required',
      text: locked.kind === 'old'
        ? 'This paste is protected. Enter the password to view it.'
        : 'This paste is encrypted with a password. Enter it to decrypt it in your browser.',
      async onSubmit(pw) {
        if (locked.ownerRow) {
          const paste = await decodeRow(locked.ownerRow, locked.link, pw);
          cache.set(raw, paste);
          return viewPaste(paste);
        }
        const result = await openLink(raw, pw, locked);
        if (result.status === 'missing') return notFoundState();
        if (result.status === 'locked') throw new Error(result.wrong ? 'Incorrect password' : 'Enter the password');
        cache.set(raw, result.paste);
        return viewPaste(result.paste);
      },
    });
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
    $('[data-nav=admin]').hidden = !account?.is_admin;
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
        <a role="menuitem" href="#/files">${icon('folder')}<span>My Files</span></a>
        <a role="menuitem" href="#/">${icon('plus')}<span>New Paste</span></a>
        ${account?.is_admin ? `<a role="menuitem" href="#/admin">${icon('gauge')}<span>Admin</span></a>` : ''}
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
        storage.del(vaultSlot(currentUser.id));
        vaultKey = null;
        try {
          await api.auth.signOut();
        } catch { /* sign out locally regardless */ }
        if (['mine', 'edit', 'admin'].includes(parseRoute().name)) location.hash = '#/';
        await setUser(null);
        toast('Signed out');
      }
    });
  }

  // ───────── Router ─────────

  const main = $('#view');
  let navToken = 0;

  function parseRoute() {
    const [first, second] = location.hash.replace(/^#\/?/, '').split(/[/?]/)
      .map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
    if (!first || first === 'new') return { name: 'new' };
    if (first === 'recent') return { name: 'recent' };
    if (first === 'login') return { name: 'login' };
    if (first === 'mine') return { name: 'mine' };
    if (first === 'admin') return { name: 'admin', tab: ADMIN_TABS.some(([k]) => k === second) ? second : 'reports' };
    if (first === 'edit' && second) return { name: 'edit', id: second };
    if (first === 'files') return { name: 'files' };
    if (first === 'f' && second) return { name: 'file', id: second };
    return { name: 'paste', id: first };
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
        const cached = cache.get(route.id);
        if (cached) {
          page = viewPaste(cached);
        } else {
          const result = await openLink(route.id);
          if (result.status === 'ok') cache.set(route.id, result.paste);
          page = result.status === 'ok' ? viewPaste(result.paste)
            : result.status === 'locked' ? viewLocked(route.id, result)
              : notFoundState();
        }
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
        if (!currentUser) page = viewAuth({ returnTo: '#/mine', note: 'Sign in to see and manage your pastes.' });
        else if (hasCrypto && !vaultKey) page = viewUnlockVault();
        else page = viewMine(await loadMine());
      } else if (route.name === 'edit') {
        if (!currentUser) {
          page = viewAuth({ returnTo: location.hash, note: 'Sign in to edit your paste.' });
        } else {
          try {
            const paste = await loadOwn(route.id);
            page = paste ? viewComposer(paste)
              : emptyState('lock', 'Can’t edit this paste', 'It doesn’t exist, or it wasn’t created with your account.', true);
          } catch (err) {
            if (!err.needPassword) throw err;
            page = viewPasswordPrompt({
              heading: 'Enter the paste’s password',
              text: 'This paste is encrypted with a password. Enter it to edit the paste.',
              onSubmit: async (pw) => viewComposer(await decodeRow(err.row, err.link, pw)),
            });
          }
        }
      } else if (route.name === 'files') {
        if (!hasCrypto) page = emptyState('warn', 'Encryption unavailable', 'Open QuickPaste over HTTPS to upload files.', false);
        else if (!currentUser) page = viewFiles(null);
        else if (!vaultKey) page = viewUnlockVault(async () => viewFiles(await loadMyFiles()));
        else page = viewFiles(await loadMyFiles());
      } else if (route.name === 'file') {
        const f = hasCrypto && LINK_RE.test(normLink(route.id)) ? await openFile(route.id) : null;
        page = f ? viewFile(f)
          : emptyState('question', 'File not found', 'This file doesn’t exist, has expired, or its owner hasn’t shared it.', false);
      } else if (route.name === 'admin') {
        if (!currentUser) page = viewAuth({ returnTo: location.hash, note: 'Sign in with an admin account.' });
        else if (!account?.is_admin) page = emptyState('lock', 'Admins only', 'Your account doesn’t have access to the admin dashboard.', true);
        else if (hasCrypto && !vaultKey) {
          page = viewUnlockVault(async () => viewAdmin(route.tab, await api.admin.overview()), {
            heading: 'Unlock the dashboard',
            text: 'Reports are encrypted for your admin key, which is protected by your account password. Enter it to unlock them on this device.',
          });
        } else page = viewAdmin(route.tab, await api.admin.overview());
      } else {
        if (currentUser) await refreshAccount();
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
    if (!hasCrypto) toast('Encryption needs HTTPS — open QuickPaste over https://', 'error');
    if (!libMissing) {
      site = { ...site, ...((await api.siteSettings().catch(() => null)) || {}) };
      const { user, notice } = await api.auth.init((u) => setUser(u));
      currentUser = user;
      if (user) {
        await restoreVault(user.id);
        await refreshAccount();
      }
      if (notice) toast(notice.text, notice.type);
    }
    renderAccount();
    booted = true;
    window.addEventListener('hashchange', navigate);
    navigate();
    if (!libMissing && hasCrypto) setTimeout(autoCleanup, 4000);
  }
  boot();
})();
