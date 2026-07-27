# Third-party notices

This project is licensed under the MIT License (see [LICENSE](LICENSE)). That
license covers the original source code written for this project. It does
**not** cover the third-party components listed below, which remain under
their own licenses/ownership and are reproduced here to satisfy their
attribution requirements.

This file is regenerated from the production dependency tree
(`npx license-checker --production`). Re-check it whenever a runtime
dependency (anything in `package.json`'s `"dependencies"`, not
`"devDependencies"`) is added, removed, or upgraded.

## Fonts (SIL Open Font License 1.1)

The OFL requires that the copyright notice and license text travel with any
redistribution of the font files, so both are reproduced in full below.

- **Inter** — `@fontsource/inter`
  Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
- **Space Grotesk** — `@fontsource/space-grotesk`
  Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)

<details>
<summary>SIL Open Font License, Version 1.1 (full text)</summary>

```
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

</details>

## JavaScript runtime dependencies (MIT / 0BSD)

Every other package that ends up in the built bundle (`npm run build` →
`dist/`) is MIT or 0BSD licensed. Both permit unrestricted use, modification,
and redistribution as long as the copyright notice is preserved somewhere in
the distribution — satisfied by this file.

| Package | Copyright |
|---|---|
| `react`, `react-dom`, `scheduler` | Copyright (c) Facebook, Inc. and its affiliates. |
| `react-router`, `react-router-dom`, `@remix-run/router` | Copyright (c) React Training LLC 2015-2019, Copyright (c) Remix Software 2020-2021, Copyright (c) Shopify Inc. 2022-2023 |
| `@supabase/supabase-js`, `@supabase/auth-js`, `@supabase/postgrest-js`, `@supabase/realtime-js`, `@supabase/storage-js`, `@supabase/functions-js` | Copyright (c) 2020 Supabase |
| `iceberg-js` | Copyright (c) 2025 Supabase |
| `js-tokens` | Copyright (c) 2014-2018 Simon Lydell |
| `loose-envify` | Copyright (c) 2015 Andres Suarez |
| `tslib` (0BSD — no attribution condition, listed for completeness) | Copyright (c) Microsoft Corporation |

Full license text for each package is the standard MIT (or 0BSD) license and
ships in `node_modules/<package>/LICENSE` when installed from npm; it is not
duplicated here since none of these impose additional conditions beyond
notice preservation.

## Build-only tooling (not distributed)

The following licenses also appear in the dependency tree but only in
`devDependencies` used to build/test the site (bundler, CSS engine, PWA icon
generation, browser-compat data). None of this code is shipped in `dist/`, so
their terms don't attach to the deployed site — listed here only for
transparency:

- `lightningcss` (Vite's CSS transformer) — MPL-2.0
- `sharp` (PWA icon generation) — Apache-2.0 AND LGPL-3.0-or-later (native `libvips` binaries)
- `caniuse-lite`, `mdn-data` (browser compatibility data used by build tooling) — CC-BY-4.0 / CC0-1.0

## Images that are **not** covered by this project's MIT license

- `public/car-blanco.jpg`, `public/car-beige.jpg`, `public/car-gris.jpg`,
  `public/car-negro.jpg`, `public/car-verde.jpg` — vehicle color preview
  photos sourced from the manufacturer's official configurator
  (dongfeng.co.nz). These remain the property of their original owner/source
  and are used here for editorial/informational purposes only; they are
  excluded from the MIT grant in [LICENSE](LICENSE).
