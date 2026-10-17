(() => {
  'use strict';

  // ───────── Config & constants ─────────

  const cfg = window.QUICKPASTE_CONFIG || {};
  const SUPABASE_URL = (cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const SUPABASE_KEY = (cfg.supabaseKey || '').trim();
  const isConfigured = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY && !/YOUR_/.test(SUPABASE_URL + SUPABASE_KEY);

  const MAX_CHARS = 512000;
  const HIGHLIGHT_LIMIT = 200000;
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

  const EXPIRATIONS = [
    ['', 'Never'], ['600', '10 Minutes'], ['3600', '1 Hour'], ['86400', '1 Day'],
    ['604800', '1 Week'], ['2592000', '1 Month'],
  ];

  // SF Symbols–style line icons
  const ICONS = {
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.6"/><path d="M15.5 8.5V6.6A2.6 2.6 0 0 0 12.9 4H6.6A2.6 2.6 0 0 0 4 6.6v6.3a2.6 2.6 0 0 0 2.6 2.6h1.9"/>',
    link: '<path d="M10.2 13.8a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.2 1.2"/><path d="M13.8 10.2a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.2-1.2"/>',
    doc: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>',
    download: '<path d="M12 4v11.5M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
    pencil: '<path d="M4 20h4L19.3 8.7a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
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
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>',
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

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  function relativeTime(date) {
    const diff = (new Date(date).getTime() - Date.now()) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, secs] of units) {
      if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
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

  const pasteUrl = (id) => `${location.origin}${location.pathname}#/${id}`;

  // ───────── Toasts ─────────

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

  // ───────── Data layer ─────────

  const supabaseApi = {
    async rpc(fn, body) {
      const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
      // Legacy anon keys are JWTs and also go in the Authorization header;
      // new "sb_publishable_…" keys must only be sent as `apikey`.
      if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
      let res;
      try {
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
      } catch {
        throw new Error('Can’t reach the server. Check your connection.');
      }
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
      if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
      return data;
    },
    create(p) {
      return this.rpc('create_paste', {
        p_title: p.title, p_content: p.content, p_language: p.language,
        p_visibility: p.visibility, p_expires_in: p.expiresIn, p_burn: p.burn,
      });
    },
    get(id) { return this.rpc('get_paste', { p_id: id }); },
    recent() { return this.rpc('recent_pastes', { p_limit: 30 }); },
  };

  // Used until config.js is filled in, so the site is usable for previews.
  const demoApi = {
    KEY: 'quickpaste:demo-pastes',
    load() { try { return JSON.parse(storage.get(this.KEY)) || {}; } catch { return {}; } },
    save(all) { storage.set(this.KEY, JSON.stringify(all)); },
    alive(p) { return p && (!p.expires_at || new Date(p.expires_at) > new Date()); },
    async create(p) {
      const all = this.load();
      const id = randomId();
      all[id] = {
        id, title: p.title, content: p.content, language: p.language, visibility: p.visibility,
        burn_after_read: p.burn, views: 0, created_at: new Date().toISOString(),
        expires_at: p.expiresIn ? new Date(Date.now() + p.expiresIn * 1000).toISOString() : null,
      };
      this.save(all);
      return id;
    },
    async get(id) {
      const all = this.load();
      const p = all[id];
      if (!this.alive(p)) return null;
      if (p.burn_after_read) delete all[id]; else p.views += 1;
      this.save(all);
      return { ...p };
    },
    async recent() {
      return Object.values(this.load())
        .filter((p) => this.alive(p) && p.visibility === 'public' && !p.burn_after_read)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 30)
        .map((p) => ({ ...p, size: p.content.length, preview: p.content.slice(0, 400) }));
    },
  };

  const api = isConfigured ? supabaseApi : demoApi;

  // Pastes seen this session — lets the creator view a burn-after-read paste
  // without destroying it, and avoids re-fetching on back/forward.
  const cache = new Map();
  let prefill = null;

  function detectLanguage(content) {
    if (!window.hljs) return 'plaintext';
    const subset = LANGUAGES.map(([k]) => k).filter((k) => k !== 'auto' && k !== 'plaintext' && hljs.getLanguage(k));
    const res = hljs.highlightAuto(content.slice(0, 20000), subset);
    return res.relevance >= 5 && res.language ? res.language : 'plaintext';
  }

  // ───────── View: new paste ─────────

  function viewNew() {
    const draft = prefill || (() => { try { return JSON.parse(storage.get(DRAFT_KEY)) || {}; } catch { return {}; } })();
    prefill = null;

    const langOptions = LANGUAGES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    const expOptions = EXPIRATIONS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');

    const frag = html(`
      <div class="page page-new">
        <section class="hero">
          <h1 class="reveal">Paste it. <span class="gradient-text">Share it.</span></h1>
          <p class="reveal" style="--d:1">Drop in code or text and get a clean, shareable link in seconds.</p>
        </section>

        <form class="composer card reveal" style="--d:2" novalidate>
          <div class="composer-head">
            <input class="title-input" name="title" placeholder="Untitled" maxlength="120" autocomplete="off" aria-label="Title">
            <label class="select" title="Syntax">
              <select name="language" aria-label="Syntax highlighting">${langOptions}</select>
            </label>
          </div>
          <div class="editor">
            <div class="gutter" aria-hidden="true"><pre>1</pre></div>
            <textarea name="content" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"
              placeholder="Paste or type anything — or drop a file here." aria-label="Paste content"></textarea>
            <div class="drop-hint">Drop to load file</div>
          </div>
          <div class="composer-foot">
            <span class="stats">0 lines · 0 B</span>
            <span class="hint"><kbd>${isMac ? '⌘' : 'Ctrl'}</kbd><kbd>↵</kbd> to create</span>
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
        </div>

        <div class="create-bar reveal" style="--d:4">
          <button class="btn primary large create" type="button">
            <span class="label">Create Paste</span><span class="spinner"></span>
          </button>
        </div>
      </div>`);

    const page = frag.firstElementChild;
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
    let visibility = 'public';

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
      const size = byteLength(ta.value);
      stats.textContent = `${n.toLocaleString()} ${n === 1 ? 'line' : 'lines'} · ${formatBytes(size)}`;
      stats.style.color = ta.value.length > MAX_CHARS ? 'var(--red)' : '';
    }
    const syncScroll = () => { gutter.style.transform = `translateY(${-ta.scrollTop}px)`; };

    let draftTimer;
    function saveDraft() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => storage.set(DRAFT_KEY, JSON.stringify({
        title: title.value, content: ta.value, language: language.value,
        expires: expires.value, visibility, burn: burn.checked,
      })), 300);
    }

    // Restore draft / fork
    title.value = draft.title || '';
    ta.value = draft.content || '';
    if (draft.language && LANG_NAME[draft.language]) language.value = draft.language;
    if (draft.expires != null && EXPIRATIONS.some(([v]) => v === draft.expires)) expires.value = draft.expires;
    if (draft.visibility) setVisibility(draft.visibility);
    burn.checked = !!draft.burn;
    refresh();

    ta.addEventListener('input', () => { refresh(); saveDraft(); });
    ta.addEventListener('scroll', syncScroll, { passive: true });
    form.addEventListener('change', saveDraft);
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
      if (EXT_TO_LANG[ext]) language.value = EXT_TO_LANG[ext];
      ta.scrollTop = 0;
      refresh(); syncScroll(); saveDraft();
      toast(`Loaded ${file.name}`);
    });

    function reject(message) {
      form.classList.remove('shake');
      void form.offsetWidth; // restart animation
      form.classList.add('shake');
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
      const expiresIn = expires.value ? Number(expires.value) : null;
      const input = { title: title.value.trim(), content, language: lang, visibility, expiresIn, burn: burn.checked };

      try {
        const id = await api.create(input);
        cache.set(id, {
          id, title: input.title, content, language: lang, visibility,
          burn_after_read: input.burn, views: 0, own: true,
          created_at: new Date().toISOString(),
          expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        });
        clearTimeout(draftTimer);
        storage.del(DRAFT_KEY);
        const copied = await copyText(pasteUrl(id)).catch(() => false);
        location.hash = `#/${id}`;
        toast(copied ? 'Paste created — link copied' : 'Paste created');
      } catch (err) {
        toast(err.message || 'Something went wrong', 'error');
      } finally {
        busy = false;
        createBtn.disabled = false;
        createBtn.classList.remove('loading');
      }
    }
    createBtn.addEventListener('click', submit);

    page.onMount = () => { if (matchMedia('(hover: hover)').matches) ta.focus({ preventScroll: true }); syncScroll(); };
    return page;
  }

  // ───────── View: paste ─────────

  function viewPaste(p) {
    const lang = p.language || 'plaintext';
    const langLabel = LANG_NAME[lang] || lang;
    const name = p.title || 'Untitled';
    const lines = lineCount(p.content);

    const meta = [
      `<span>${icon('clock')}<time datetime="${esc(p.created_at)}" title="${esc(new Date(p.created_at).toLocaleString())}">${esc(relativeTime(p.created_at))}</time></span>`,
      `<span>${icon('lines')}${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'} · ${formatBytes(byteLength(p.content))}</span>`,
      `<span>${icon(p.visibility === 'unlisted' ? 'lock' : 'globe')}${p.visibility === 'unlisted' ? 'Unlisted' : 'Public'}</span>`,
    ];
    if (!p.own && !p.burn_after_read) meta.push(`<span>${icon('eye')}${Number(p.views || 0).toLocaleString()} views</span>`);
    if (p.expires_at) meta.push(`<span>${icon('timer')}Expires ${esc(relativeTime(p.expires_at))}</span>`);

    let banner = '';
    if (p.burn_after_read) {
      banner = p.own
        ? `<div class="banner burn reveal" style="--d:2">${icon('flame')}<div><strong>Burn after reading is on</strong>The first person to open this link will see it — then it’s gone for good. Don’t open it yourself.</div></div>`
        : `<div class="banner burn reveal" style="--d:2">${icon('flame')}<div><strong>This paste has now been destroyed</strong>It was set to burn after reading. Copy anything you need before leaving this page.</div></div>`;
    }

    const frag = html(`
      <article class="page page-paste">
        <header class="paste-head">
          <div class="reveal">
            <p class="eyebrow">${esc(langLabel)}</p>
            <h1>${esc(name)}</h1>
            <div class="meta">${meta.join('')}</div>
          </div>
          <div class="toolbar reveal" style="--d:1">
            <button class="btn primary" data-act="link">${icon('link')}<span>Copy Link</span></button>
            <button class="btn" data-act="copy">${icon('copy')}<span>Copy</span></button>
            <button class="btn icon-only" data-act="raw" title="View raw" aria-label="View raw">${icon('doc')}</button>
            <button class="btn icon-only" data-act="download" title="Download" aria-label="Download">${icon('download')}</button>
            <button class="btn icon-only" data-act="fork" title="Edit as new paste" aria-label="Edit as new paste">${icon('pencil')}</button>
          </div>
        </header>
        ${banner}
        <div class="code card reveal" style="--d:2">
          <div class="code-gutter" aria-hidden="true"><pre></pre></div>
          <div class="code-scroll"><pre><code class="hljs"></code></pre></div>
        </div>
      </article>`);

    const page = frag.firstElementChild;
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
          toast((await copyText(pasteUrl(p.id))) ? 'Link copied' : 'Couldn’t copy link', 'success');
          break;
        case 'copy':
          toast((await copyText(p.content)) ? 'Copied to clipboard' : 'Couldn’t copy', 'success');
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
        <pre>${esc((p.preview || '').split('\n').slice(0, 8).join('\n'))}</pre>
      </a>`).join('');
    const page = html(`
      <div class="page page-recent">
        <header class="page-head reveal"><h1>Recent</h1><p>The latest public pastes.</p></header>
        <div class="grid">${tiles}</div>
      </div>`).firstElementChild;
    page.docTitle = 'Recent · QuickPaste';
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

  // ───────── Router ─────────

  const main = $('#view');
  let navToken = 0;

  function parseRoute() {
    const [first] = location.hash.replace(/^#\/?/, '').split(/[/?]/);
    if (!first || first === 'new') return { name: 'new' };
    if (first === 'recent') return { name: 'recent' };
    return { name: 'paste', id: decodeURIComponent(first) };
  }

  async function navigate() {
    const token = ++navToken;
    const route = parseRoute();
    let page;
    const slow = setTimeout(() => document.body.classList.add('is-loading'), 120);
    try {
      if (route.name === 'paste') {
        let p = cache.get(route.id);
        if (!p) {
          p = await api.get(route.id);
          if (p) cache.set(route.id, p);
        }
        page = p ? viewPaste(p)
          : emptyState('question', 'Paste not found', 'This paste doesn’t exist, has expired, or was burned after reading.', true);
      } else if (route.name === 'recent') {
        page = viewRecent((await api.recent()) || []);
      } else {
        page = viewNew();
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

  async function swap(page, route) {
    const old = main.firstElementChild;
    if (old && !reduceMotion.matches && old.animate) {
      await old.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.99)' }],
        { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
      ).finished.catch(() => {});
    }
    main.replaceChildren(page);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = page.docTitle || 'QuickPaste';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.name));
    page.onMount?.();
  }

  // ───────── Boot ─────────

  if (!isConfigured) {
    $('.nav-links').insertAdjacentHTML('beforeend', '<span class="demo-badge" title="Fill in config.js to connect Supabase. Pastes are only saved in this browser.">Demo</span>');
  }
  window.addEventListener('hashchange', navigate);
  navigate();
})();
