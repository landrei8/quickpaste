# Third-party libraries

These files are hosted here instead of loading them from a CDN, so the whole site
comes from this repository only. `index.html` also pins them with Subresource
Integrity hashes, so the browser refuses to run them if even one byte changes.

| File | Version | License | Verified against |
|---|---|---|---|
| `highlight-11.9.0.min.js` | highlight.js 11.9.0 | BSD-3-Clause (header in file) | official release repo `github.com/highlightjs/cdn-release`, tag `11.9.0`, `build/highlight.min.js`: byte-identical |
| `supabase-js-2.45.4.js` | @supabase/supabase-js 2.45.4 (`dist/umd/supabase.js`) | MIT (`supabase-js-LICENSE.txt`) | npm registry tarball, whose sha512 matched the registry's published `dist.integrity`: byte-identical |

## Hashes

```
highlight-11.9.0.min.js
  sha256  837a6fa5b0c736b52bbde2b2b6190f305da3fc9ed41681db5321507057b5c846
  sha384  F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp  (base64, used for SRI)

supabase-js-2.45.4.js
  sha256  8596965fe918e656600a1b568d3a168f5c0d3d22a600886bb6f44a6555db01e7
  sha384  0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o  (base64, used for SRI)
```

## Updating a library

1. Download the new version from its official source, and compare it with a second
   source (for example the npm tarball, or the project's GitHub release).
2. Save it here with the version in the file name.
3. Compute the SRI hash: `openssl dgst -sha384 -binary FILE | openssl base64 -A`
4. Update the `src` and `integrity="sha384-…"` attributes in `index.html`, and this file.
