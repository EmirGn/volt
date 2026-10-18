# Volt

Volt is the design system for a personal fitness app that logs workouts, calories, supplements and daily tasks, and has a coach you can talk your plan through with. It is **polished, minimal and still playful**: quiet greys and black ink do almost all the work, one electric lime marks the moments that matter, and the playfulness comes from huge chunky numbers and soft, round shapes rather than from colour.

## Principles

- **One number per screen.** Every main screen leads with a single huge figure: calories left, workouts this week, the weight on the bar. Everything else is smaller and quieter.
- **One thing at a time.** Under the number, a segmented switch picks what the single card below shows. Don't stack cards.
- **Volt means "done" or "go".** The accent is earned: a ticked task, the active tab, the Add or Start that moves you forward, a new record. If nothing on the screen is done or about to start, the screen has no volt.
- **Ink is the brand.** Primary actions, the selected state, the dock and your own messages are solid ink. Contrast does the work, not colour.
- **Round, flat, calm.** Cards are 30px rounded, everything you tap is a pill or a circle, and nothing has a drop shadow.

## Voice

The app talks like a good training partner: short, plain and specific.

- Sentence case everywhere: "Start workout", "Log breakfast", "This week". Uppercase only for 11px micro-labels (`label` style).
- Lead with the number, then the meaning: "1,060 kcal left", "3/4 workouts this week", "Flat for 3 weeks".
- Buttons start with a verb: Start workout, Complete set 3, Add to plan, Ask Coach.
- The coach is calm and concrete. It gives a reason and a single change ("A normal plateau. Keep the plan and add one lighter bench day."), never hype.
- No exclamation marks, no emoji, no motivational slogans.

## Colour

Five neutrals, one accent. The full list with contrast figures is in the Colors section.

| Token | Use |
| --- | --- |
| `paper` | Screen background, and sunken boxes inside cards |
| `surface` | Cards, the switch track, inputs, round header buttons |
| `ink` | Text, icons, primary buttons, the selected segment, the dock, your chat bubbles |
| `ink-muted` | Captions, metadata, inactive segment labels |
| `line` | Row dividers and empty progress tracks |
| `volt` | Done, active, go. Always with ink on top |

Rules:

- **Volt is a fill, never a text colour.** On paper or surface it is 1.1:1, so it only works with ink on it (`on-volt`, 15:1). Never put a volt dot or line on a light ground by itself to mean something.
- **At most two volt moments per screen**, e.g. the active dock item plus one done tick or Add button.
- On ink, secondary text is `ink-inverse-muted` and inactive icons are `ink-subtle`. Neither may be used on light grounds.
- Status that must be told apart (done vs to-do) differs in **shape and lightness**, not just colour: a filled volt circle with an ink tick vs an empty ring; a struck-through muted label vs an ink label.
- `line-strong` (outline button border, empty checkbox ring) is **1.7:1 and fails** the 3:1 rule for control boundaries. The mockups use it, so it's kept here and flagged. Change it to `#8a8a84` (3.5:1) before shipping.

## Typography

Two families from Google Fonts, both open licence:

- **Bricolage Grotesque** (`display`) for numbers and titles, weight 800, tracked tight (−0.05em at hero size, −0.03em for titles). Its chunky, slightly quirky shapes are where the playfulness lives.
- **Geist** (`sans`) for everything else, weights 400–600.

| Style | Size | For |
| --- | --- | --- |
| `hero` | 116 / 0.9, 800 | The screen's one big number |
| `title` | 26, 800 | Card titles ("Push Day") |
| `stat` | 22, 800 | A headline number inside a card or row |
| `lead` | 16, 600 | Row titles, button labels |
| `body` | 15, 400–500 | Body, list items, chat |
| `caption` | 13, 500 | Subtitles and metadata, in `ink-muted` |
| `label` | 11, 600, +0.08em, uppercase | Weekday abbreviations, tiny badges |

A suffix on a hero number ("/4", "kg × 8") is `ink-muted`, either at full size or at 28px.

## Layout: the Focus screen

Every main screen has the same anatomy, from top to bottom, on a 390pt-wide phone:

1. **Header row.** A 15px/600 page label on the left ("Sat, 17 Oct", "Train") and one 44px round `surface` icon button on the right.
2. **Hero.** The `HeroNumber`, centred, with one line of muted caption under it and optionally a row of chips (macros, streak, week dots).
3. **Switch.** A `SegmentedControl` with two or three options.
4. **One card.** A `Card` that shows the selected option's content as hairline-divided rows, often ending in one full-width button.
5. **Dock.** The floating ink `Dock`, centred 26px above the bottom edge.

Spacing: `gutter` (16) on both sides, `screen-top` (28) at the top, `stack` (18) between the blocks, `card-pad` (20) inside cards, and `dock-clear` (110) at the bottom of scrolling content.

Full-screen flows such as an active workout drop the dock and put one large `cta-h` (60) ink button at the bottom ("Complete set 3"), with a back button and a Finish pill in the header.

## Shape

- `radius-card` (30) on every card, `radius-inset` (18) on boxes inside cards, `radius-bubble` (22) on chat bubbles with one `radius-tail` (6) corner on the sender's side.
- Everything tappable is a full pill or circle (`radius-pill`).
- No shadows. Separation comes from paper vs surface and from `line` hairlines. Focus is shown with `focus-ring`.

## Iconography

- Inline SVG, 24×24 grid, 2px stroke (2.2 when active, 2.6 for arrows and ticks inside buttons), round caps and joins, no fills. They use `currentColor`, so they take the colour of their text.
- Sizes: 22 in the dock, 20 in header buttons, 18 inside buttons, 15 inside a tick circle.
- Decorative icons are `aria-hidden`; icon-only buttons must have an `aria-label`.
- The set lives in the `Icon` component: `home`, `dumbbell`, `bowl`, `chat`, `chart`, `user`, `plus`, `minus`, `arrow`, `check`, `back`, `chevron`, `search`, `scan`, `edit`, `bulb`, `send`.
- There is no logo yet. Write the name in Bricolage Grotesque 800 until there is one.

## Motion and haptics

Motion isn't part of these tokens, but keep it consistent: 150–200ms ease-out for segment and tab changes, a quick scale-in when a tick turns volt, and a light haptic on "Complete set" and on ticking a task.

## Components

All components are React and live in `window.Volt`:

- **Actions:** `Button`, `IconButton`
- **Display:** `HeroNumber`, `MacroChip`, `Badge`, `Icon`
- **Navigation:** `SegmentedControl`, `Dock`
- **Layout:** `Card`, `ListRow`
- **Inputs:** `CheckRow`, `Stepper`, `MessageInput`
- **Coach:** `ChatBubble`

Each component's page has its own usage rules.

## Building the app

The app will be native (Expo / React Native, iPhone first, then Android). The web components here are the reference; port the tokens one to one:

- Colours, spacing, radii and sizes become a `theme.ts` with the same names (`theme.color.ink`, `theme.space.gutter`, `theme.radius.card`).
- Load Bricolage Grotesque and Geist with `expo-font` / `@expo-google-fonts`. React Native has no `em`, so tracking becomes `letterSpacing` in points: hero −5.8, title −0.8, label +0.9.
- `radius-pill` becomes `borderRadius: 999`, and the dock floats with `position: 'absolute'` inside the safe area.
- `focus-ring` maps to the platform's own focus handling. Keep every `aria-label` as an `accessibilityLabel`.

## Feedback and the opening

The app never uses the platform's alerts or toasts. Everything lives in `src/components/feedback.tsx` and goes through `useFeedback()`:

- **Sheets** for decisions: a white 30px card that slides up over a 48% ink scrim, an icon in a paper circle, a Bricolage title, a muted line, then one ink pill and one paper pill ("Finish workout" / "Keep going"). A finished action can swap the same sheet to its success state (big volt tick, "Workout saved").
- **Hold to delete** instead of red buttons: the pill fills with ink over one second while held and drains back if let go. Small things (a set, a food entry, a plan item) delete on long press without a sheet. Every delete shows an Undo toast.
- **Toasts** are ink pills above the dock (or above a screen's bottom button): a 40px badge (volt tick = done, dark grey timer = info, paper "!" = error), a title, a muted detail and at most one volt text action such as Undo.
- **Offline** is a quiet white banner under the header on Today and Coach, never a blocking screen.
- **Errors** show the "Hm." screen (`ErrorScreen`, wired as expo-router's `ErrorBoundary`): what was saved, an expandable error log with Copy and Share, then Try again and Go to Today.
- **Notifications** are asked for once on our own screen first, and only cover rest timers and a reminder 15 minutes before a planned workout.

The opening (`Opening.tsx`) runs on every cold launch: the ink curtain with the "V." mark (identical to the native splash) lifts, the last six days fill in, today pops volt and the streak counts up. Tap to skip. A day counts when anything was logged.
