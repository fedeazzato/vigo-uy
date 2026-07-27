# Wiki Vigo Uruguay ⚡

Static web app for the **Amantes de la Vigo Uruguay 🇺🇾** community.  
Built with React + TypeScript + Vite. Hosted on GitHub Pages. No backend.

---

## Requirements

- Node.js 18+
- npm 9+

---

## Local development

```bash
# 1. Clone the repo
git clone https://github.com/fedeazzato/vigo-uy.git
cd vigo-uy

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
# → Opens http://localhost:5173/vigo-uy/
```

---

## Deploy to GitHub Pages

```bash
npm run deploy
```

This builds the app and pushes it to the `gh-pages` branch automatically.  
On first deploy, go to **GitHub → Settings → Pages → Source** and select the `gh-pages` branch.

The app will be live at: `https://fedeazzato.github.io/vigo-uy/`

---

## Project structure

```
vigo-uy/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx           # Entry point with HashRouter
    ├── App.tsx            # App routes
    ├── types.ts           # Shared TypeScript interfaces
    ├── index.css          # Global design system
    ├── data/              # ← Edit these files to update content
    │   ├── charging.json  # Home and public charging
    │   ├── routes.json    # Routes and stops
    │   ├── costs.json     # Costs and comparisons
    │   ├── accessories.json
    │   └── tech-faq.json  # Technology and FAQ
    ├── components/
    │   ├── Layout.tsx     # Sidebar + mobile nav
    │   └── UI.tsx         # Reusable UI components
    └── pages/
        ├── ChargingPage.tsx
        ├── RoutesPage.tsx
        ├── CostsPage.tsx
        ├── AccessoriesPage.tsx
        ├── TechPage.tsx
        └── FaqPage.tsx
```

---

## Updating content

All content lives in JSON files under `src/data/`.  
No React code changes needed to add tips, questions, or new routes.

### Add a charging tip

Open `src/data/charging.json` → `homeCharging.tips` → append:
```json
{ "bold": "New tip:", "text": "Tip description." }
```

### Add a route

Open `src/data/routes.json` → `routes` array → append:
```json
{
  "id": "new-route",
  "title": "Montevideo → Destination",
  "distance": "~X km",
  "difficulty": "Fácil",
  "stops": [
    { "name": "Montevideo", "type": "origin" },
    { "name": "Stop", "type": "charge", "note": "Description." },
    { "name": "Destination", "type": "destination" }
  ],
  "tips": ["Tip 1.", "Tip 2."]
}
```
Stop types: `origin`, `destination`, `charge`, `warning`

### Add a FAQ entry

Open `src/data/tech-faq.json` → `faq` array → append:
```json
{ "q": "¿La pregunta?", "a": "La respuesta completa." }
```

---

## Type checking

```bash
npm run type-check
```

---

## Tech stack

| Technology | Purpose |
|---|---|
| React 18 | UI |
| TypeScript 5 | Type safety |
| Vite 5 | Build tool |
| React Router 6 | Navigation (HashRouter for GH Pages) |
| CSS Modules | Scoped styles |
| gh-pages | Automated deploy |
| JSON | Content data source |

---

## License

MIT — see [LICENSE](LICENSE). Free to use, share, and modify.

This covers the project's own source code. Bundled fonts and JS dependencies
carry their own permissive licenses (mostly MIT, plus OFL-1.1 for the Inter
and Space Grotesk fonts), and a handful of vehicle preview photos are
third-party manufacturer images excluded from that grant — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the full breakdown.
