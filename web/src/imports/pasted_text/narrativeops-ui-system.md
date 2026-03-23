Design a complete Figma UI system for NarrativeOps — an enterprise AI content
operations platform. The experience should feel like a premium B2B SaaS product:
clean, spacious, confident, and immediately trustworthy.

─────────────────────────────────────────────
DESIGN SYSTEM
─────────────────────────────────────────────

Colors:
  Background primary:   #0A0A0F  (near-black, very slightly blue-shifted)
  Surface:              #12121A  (cards and side panels)
  Surface elevated:     #1A1A24  (modals, dropdowns, hover states)
  Accent primary:       #6366F1  (indigo-500 — all primary CTAs and active states)
  Accent secondary:     #8B5CF6  (violet-500 — secondary highlights and badges)
  Success:              #10B981  (emerald-500)
  Warning:              #F59E0B  (amber-500)
  Error:                #EF4444  (red-500)
  Text primary:         #F9FAFB
  Text secondary:       #9CA3AF
  Text tertiary:        #6B7280
  Border default:       rgba(255,255,255,0.08)
  Border emphasis:      rgba(99,102,241,0.4)

Typography:
  Font family: Inter (import from Google Fonts)
  H1: 32px / weight 600 / line-height 1.2
  H2: 24px / weight 600 / line-height 1.3
  H3: 18px / weight 500 / line-height 1.4
  Body Large: 16px / weight 400 / line-height 1.6
  Body: 14px / weight 400 / line-height 1.6
  Caption: 12px / weight 400 / line-height 1.5
  Mono: 12px / JetBrains Mono / line-height 1.6

Spacing scale (4px base):
  4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96

Border radius:
  Small: 6px (inputs, badges, small buttons)
  Medium: 10px (cards, panels)
  Large: 16px (modals, large cards)
  Full: 9999px (pills, avatar)

Glassmorphism (use on elevated cards only, not everything):
  background: rgba(255, 255, 255, 0.04)
  border: 1px solid rgba(255, 255, 255, 0.08)
  backdrop-filter: blur(12px)

Component variants to define in Figma:
  Buttons: Primary (indigo fill), Secondary (indigo outline), Ghost, Destructive, Icon-only
  Inputs: Default, Focused (indigo border), Error (red border), Disabled
  Badges: Success, Warning, Error, Info, Neutral — all as rounded pills
  Agent node card: 5 states (Pending, Running with pulse, Success, Warning/Retry, Error)
  Channel tab: Default, Active (indigo underline), with edit badge

─────────────────────────────────────────────
SCREEN 1 — HOME / DASHBOARD
─────────────────────────────────────────────

Layout: 1440px wide, top navigation + content area

Top navigation bar (64px height):
  Left: NarrativeOps wordmark (white, 16px/600)
  Center: nothing
  Right: "New pipeline" button (indigo, primary) + avatar circle (32px)

Hero input section (center of page, top 40% of content area):
  Large rounded card (glassmorphism surface):
    Textarea: placeholder "Describe your content brief..."
              minimum height 120px, auto-expands
    Row below textarea: 3 quick-select chips (Article / Social Campaign / Product Launch)
    Row below chips: Channel toggles — Blog, Twitter, LinkedIn, WhatsApp (icon + label)
    Bottom of card: Language toggle (EN | HI) on left, "Run pipeline" CTA on right

Trending topics row (below the card):
  Label: "Trending in your category" (caption, secondary color)
  5 topic pills showing example topics — horizontal scroll on overflow

Recent pipelines section (below trending):
  Section header: "Recent pipelines" + "View all →" link
  3-column card grid:
    Each pipeline card:
      Top: brief topic text (body, primary, 2 lines max, ellipsis)
      Middle: row of channel icons (small, 16px each)
      Bottom row: compliance badge (green PASS / amber REVISE / red FAIL) + timestamp

─────────────────────────────────────────────
SCREEN 2 — BRIEF CONFIGURATION
─────────────────────────────────────────────

Layout: 2-column (left config 480px, right preview fills remaining)
No top nav — full focus mode. Show back arrow + "NarrativeOps" wordmark only.

Left panel sections (vertical stack, 24px gap between sections):
  Section 1 — Brief
    Label: "Content brief"
    Textarea: large, min 120px, auto-resize, focused indigo border

  Section 2 — Channels
    Label: "Publish to"
    4 toggle cards in 2x2 grid:
      Blog | Twitter | LinkedIn | WhatsApp
      Each: icon (24px) + label + toggle switch on right
      Selected state: indigo border + light indigo background tint

  Section 3 — Language
    Label: "Languages"
    Row of toggle pills: English (default on) | Hindi

  Section 4 — Tone
    Label: "Tone"
    4-segment selector: Authoritative | Accessible | Analytical | Urgent
    Selected segment: indigo fill, white text

  Section 5 — Engagement data (collapsible)
    Collapsed default, expand arrow on right
    When expanded: JSON textarea with mono font + caption explaining Scenario 3

  Bottom of left panel (sticky):
    "Run NarrativeOps pipeline" — full-width primary CTA button

Right panel:
  Static illustration showing the expected output structure:
    5 agent steps as a vertical list with connecting dots
    Below: 4 channel output placeholders (ghost/wireframe style cards)
    Label above: "What you'll get"

─────────────────────────────────────────────
SCREEN 3 — PIPELINE RUNNING (AGENT WORKFLOW)
─────────────────────────────────────────────

Layout: Full-screen focus mode (no navigation except pipeline ID and stop button)
2-column: left 60% = agent graph, right 40% = live log

Top bar:
  Left: "Pipeline" + run ID (mono, caption)
  Center: elapsed time counter (large, mono, updating live)
  Right: "Stop pipeline" button (ghost, red hover)

Left column — Agent pipeline visualization:
  6 agent nodes in vertical sequence (Intake, Trend, Draft, Disclaimer, Compliance, Localization, Format)
  Each node is a card (full width, 72px height):
    Left: status indicator dot (10px circle, color-coded)
    Center: agent icon (20px) + agent name (body, primary)
    Right: status label ("Pending" / "Running..." / "Done" / "Attempt 2/3" / "Failed")
    Running state: entire card has a subtle left-border glow (indigo)
    Progress fill: thin indigo line animates left-to-right while running
  Connecting lines between nodes (dashed, tertiary color when pending, solid when active)
  Compliance node in warning state: amber glow, shows "Attempt 2/3" badge

Right column — Live log panel:
  Fixed height, scrollable, newest entries at bottom (auto-scroll)
  Each log entry: timestamp (mono, tertiary) | agent tag (badge) | message (mono, 12px)
  Color coding: white=info, amber=warning, red=error, green=success
  Scroll follows newest entry automatically

─────────────────────────────────────────────
SCREEN 4 — APPROVAL GATE
─────────────────────────────────────────────

Layout: Full page, 2 columns (main content 65%, right sidebar 35%)

Page header:
  Left: "Review your content" (H2) + subtitle "Pipeline complete — awaiting approval"
  Right: "Approve & publish" button (green, large) + "Reject" button (ghost, destructive)

Tab row (below header):
  Blog | Twitter | LinkedIn | WhatsApp | Hindi
  Active tab: indigo underline indicator, brighter text
  Each tab shows a small channel icon before the label

Main content area:
  Blog tab: white card with black text — rendered HTML preview
  Twitter tab: stack of numbered tweet cards (each card = one tweet, bordered)
  LinkedIn/WhatsApp: clean text block in appropriate container with character count
  Hindi tab: same layout, Noto Sans Devanagari font, show language flag

Edit mode state (when user clicks Edit button):
  Content area becomes a textarea (same size as preview)
  Toolbar above textarea: word count | character count | "Revert" link
  Below textarea: "Save edits" button (primary) + "Cancel" (ghost)
  Tab shows a pencil badge to indicate unsaved edits

Right sidebar:
  Section 1: "Edit content" — button with pencil icon (toggles edit mode)
  Section 2: "Compliance summary" — list of all 8 rules with green checkmarks
  Section 3: "Audit trail" — "View full audit →" link
  Section 4: Pipeline stats — total time, agents used, disclaimer status

─────────────────────────────────────────────
SCREEN 5 — AUDIT TRAIL
─────────────────────────────────────────────

Layout: Full page, table-focused

Header: "Audit trail" + pipeline ID + "Download PDF" button (right)

Table columns:
  Agent | Action | Verdict | Model | Duration | Timestamp | Summary
  Compliance rows: verdict badge (PASS/REVISE/REJECT colored) prominently shown
  Revise rows: expandable — click to see flagged sentence in red inline quote + suggested fix
  user_edit rows: pencil icon, shows what was edited

Filter row above table:
  All agents | Compliance only | User edits only

─────────────────────────────────────────────
SCREEN 6 — MY PIPELINES (HISTORY)
─────────────────────────────────────────────

Header: "My pipelines" + search input + filter dropdown

Table:
  Topic | Channels | Compliance | Language | Created | Status | Actions
  Status badges: Completed (green), Awaiting approval (indigo), Failed (red), Escalated (amber)
  Actions column: View | Re-run | Delete icons (show on row hover)

Empty state:
  Centered illustration area (simple geometric placeholder)
  Headline: "No pipelines yet"
  CTA: "Create your first pipeline" button

─────────────────────────────────────────────
SCREEN 7 — EMPTY & LOADING STATES
─────────────────────────────────────────────

Pipeline starting (after clicking Run):
  Brief input area shows a linear progress bar below the form
  "Starting agents..." caption below the bar

Agent skeleton loader (while agents are listed but not yet running):
  Gray animated gradient rectangles at 72px height where agent cards will appear
  CSS animation: opacity oscillates 0.3 → 0.7 → 0.3

Pipeline escalated:
  Full-page error state with amber warning icon (48px)
  Headline: "Content requires review"
  Body: "The compliance agent could not auto-fix this content after 3 attempts.
         A human reviewer needs to check it."
  CTA: "Review manually" button

─────────────────────────────────────────────
SCREEN 8 — MOBILE (390px)
─────────────────────────────────────────────

Screen 1 mobile: Stacked layout — brief textarea top, channel toggles below, run CTA at bottom
Screen 3 mobile: Vertical list of agent status rows (no graph — too small)
Screen 4 mobile: Full-screen tabs, approval buttons fixed at bottom

─────────────────────────────────────────────
FIGMA FILE STRUCTURE
─────────────────────────────────────────────

Page 1: Design System
  - Color styles (all named)
  - Text styles (all named)
  - Component library (all variants)
  - Icon set reference (Lucide React)
  - Spacing scale documentation

Page 2: Desktop Screens (1440px frames)
  - All 8 screens above in order
  - Use Auto Layout on all frames and components
  - All frames named clearly

Page 3: Mobile Screens (390px frames)
  - 3 key screens adapted for mobile

Page 4: Developer Handoff
  - Color token → Tailwind mapping table
  - Spacing scale → Tailwind spacing table
  - Component usage notes
  - Icon library: Lucide React (npm package name)