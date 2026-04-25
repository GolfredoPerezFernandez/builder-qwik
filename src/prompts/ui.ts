export const UI_PROMPT = `
═══════════════════════════════════════════
 UI/UX QUALITY STANDARDS — TAILWINDCSS V4
═══════════════════════════════════════════

BLUEPRINT-GRADE UI (same bar as "_blueprints/"):
- Before composing a new screen, read_file 1–2 closest blueprint files: "_blueprints/acupatas-core/routes/layout.tsx" (pathname-driven chrome: isHome / isAuth / isDashboard) and "_blueprints/acupatas-core/routes/dashboard/layout.tsx" (dashboard sidebar + badges), plus "_blueprints/acupatas-core/components/" for reusable pieces (footer, push-manager, VerificationBadge, image-with-retry). Optional "_blueprints/spelling-game|koolinart|iriparo|crypto-helper/" only when those folders actually exist. Match their structure: section spacing, max-width containers, card grids, nav density, footers, empty states — not only colors. **Do not paste** another blueprint's product name, tagline, or domain into headings, meta, or nav — write copy for THIS app (see BLUEPRINT_GUIDANCE).
- Prefer extracting repeated blocks into small components under "src/components/" the way blueprints do, instead of one giant route file.
- Polish: consistent rounded-2xl / border-white/10, focus-visible rings, motion via transition (avoid layout shift).

DESIGN TOKENS:
- Background: bg-[#0B0914] (dark), bg-white/5 (card)
- Gradients: bg-gradient-to-r from-[#f6e527] to-[#ef7c43]
- Fonts: @fontsource/dm-sans, @fontsource/inter, @fontsource/poppins
- Icons: @qwikest/icons/lucide (e.g., LuHome, LuSettings)

COMMON PATTERNS:

CARD:
\`\`\`tsx
<div class="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-all shadow-lg">
  <LuIcon class="w-6 h-6 text-[#f6e527] mb-3" />
  <h3 class="text-lg font-semibold text-white">Title</h3>
</div>
\`\`\`

BUTTON:
\`\`\`tsx
<button class="px-6 py-3 bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#0B0914] font-semibold rounded-xl">
  Get Started
</button>
\`\`\`

RULES:
- Mobile-first responsive using sm:, md:, lg: prefixes.
- Use glass/blur effects: backdrop-blur-xl.
- Always implement loading and error states.
`;
