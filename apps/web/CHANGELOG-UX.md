# UX Changelog

## Home Page Redesign (v1)

**Goal**: Transform from "wallet connection screen" to "arrival".

### Before
- Multi-screen flow: Welcome → Learn → Connect
- Gradient logo with "M"
- Numbered steps (1, 2, 3) explaining the product
- "Learn More" as primary CTA
- Cards explaining features
- Multiple prominent buttons
- "Coinbase Wallet" as large button, other wallets behind toggle

### After
- Single arrival screen
- "Meezan" as 64px font-extralight (matches portfolio balance)
- "Fixed-ratio holdings" as single descriptor
- "Connect" as muted text link
- Wallet options appear on demand, styled as text links
- "Non-custodial · Base" as subtle footer detail

### Why each change improves trust and quality

| Change | Rationale |
|--------|-----------|
| **Removed multi-screen onboarding** | Onboarding implies the product needs explanation. A confident product is self-evident. Users who need more information can find it elsewhere. |
| **Removed gradient logo** | Gradients are a startup aesthetic. Institutional products use typography, not decoration. The name itself is the brand. |
| **Removed numbered steps** | Steps imply process and effort. The product should feel like it already exists and is waiting for you, not that you need to learn how to use it. |
| **"Fixed-ratio holdings" instead of explanation** | Three words that describe what it is, not what it does. No verbs, no promises, no marketing. Just a factual category. |
| **"Connect" as text link, not button** | Buttons create pressure. A text link says "this is available when you're ready." It also matches the portfolio page action style exactly. |
| **Wallets as text links, not buttons** | Same principle. The primary connector (Coinbase) is in foreground color, others are muted. Visual hierarchy without visual weight. |
| **"Non-custodial · Base" at reduced opacity** | Institutional detail. Important for the right user, invisible to most. Like fine print that builds trust without demanding attention. |
| **Identical layout to portfolio** | The home page should feel like a preview of the experience. Same vertical centering, same typography, same action placement. Arrival, not transition. |

### Connected State

When connected, the home page becomes a simple navigation hub:
- "Meezan" title (same size)
- Wallet address as muted subtitle
- Portfolio / Deposit / Disconnect as text links

This mirrors the portfolio page exactly — the user is already "inside" the product.

---

## Final Polish Pass (v1)

**Goal**: Push from "excellent" to "inevitable".

### Before
- Balance at 6xl, font-light
- "Maintained at 50 / 50" status line
- Holdings with `text-[var(--muted)]` labels, `text-sm` amounts

### After
- Balance at 64px, font-extralight (lighter, more presence)
- "Allocation automatically maintained" (system feels active)
- Subtle time context: "Just now" (reassurance without anxiety)
- Holdings with smaller `text-xs` amounts (reduced visual weight)
- Increased spacing throughout (py-8 holdings, mb-6 balance)

### Why

| Change | Rationale |
|--------|-----------|
| **font-extralight** | Lighter weight creates more visual presence paradoxically. The number breathes. |
| **"Allocation automatically maintained"** | Conveys continuous system activity. The user didn't ask what allocation — they want to know the system is working. |
| **"Just now" time context** | Subtle reassurance that data is fresh, without demanding attention. Fades to actual time after 30 seconds. |
| **Smaller holding amounts** | The USD value is primary. The token amount is verification. Reducing its size reinforces this hierarchy. |
| **More vertical spacing** | Whitespace is confidence. Cramped layouts feel anxious. |

---

## World-Class UX Elevation Pass

**Design philosophy**: Make Meezan feel like a quiet, self-maintaining financial system — not a dashboard.

**Benchmarks**: Apple Wallet, Stripe Dashboard, Linear, private banking apps.

---

## Portfolio Page

### Before
- Header with "Portfolio" label and allocation name
- Refresh button with timestamp
- Large centered balance with "On track" / drift status
- Two asset cards (BTC, USDC) with icons, values, amounts, allocation percentages
- Amber warning banner when rebalance needed
- Two prominent buttons (Deposit, Withdraw All)
- "View details" link

### After
- Balance as the single dominant element (6xl, centered, vertically centered)
- System state as calm secondary line: "Maintained at 50 / 50"
- Holdings as balance-sheet rows (no cards, no icons)
- Actions as muted text links at bottom

### Why each change improves clarity and trust

| Change | Rationale |
|--------|-----------|
| **Removed "Portfolio" header** | Redundant. The page is self-evidently the portfolio. Removing it creates more space for what matters. |
| **Removed refresh button and timestamp** | Creates anxiety. A well-maintained system doesn't need to advertise when it last checked. Data updates silently in the background. |
| **Balance vertically centered** | One dominant idea: "This is your balance." Everything else is subordinate. Follows Apple Wallet pattern. |
| **Changed "On track" to "Maintained at X/Y"** | "On track" is evaluative and slightly anxious. "Maintained" is factual and confident. It describes what the system does, not how well it's doing. |
| **Removed asset cards, replaced with rows** | Cards are visual containers that create hierarchy and separation. Balance-sheet rows are flatter, more institutional, more trustworthy. The information is the same; the presentation is quieter. |
| **Removed colored icons (B, $)** | Visual noise. The asset names are sufficient. Icons are a crypto dashboard pattern, not a banking pattern. |
| **Actions as muted text links** | Actions should be available, not inviting. Prominent buttons create pressure. Text links communicate: "This is here if you need it." |
| **Removed amber warning banner** | Over-alerting. The system state line already communicates drift. A banner is emotional; a percentage is factual. |
| **Currency formatting: no decimals for $1000+** | "$1,234" is cleaner than "$1,234.00". Decimals matter for small amounts, not large ones. |

---

## Details Page

### Before
- Back arrow with "Portfolio" text
- Refresh button with timestamp
- "Details" title with allocation subtitle
- Drift visualization bar (progress bar showing 0-10%)
- Two asset cards with icons, values, amounts, current %, target %
- Total value card
- Amber warning banner when drift high
- "Rebalance Now" / "No rebalance needed" button
- Vault address

### After
- Simple "Back" text link
- "Target allocation" label with value (e.g., "50 / 50")
- "Current drift" label with value and "Within tolerance" when OK
- Holdings as balance-sheet rows with current/target percentages inline
- Total as a simple row
- Rebalance as text action: "Restore to 50 / 50"
- Vault address at 50% opacity

### Why each change improves clarity and trust

| Change | Rationale |
|--------|-----------|
| **Removed drift visualization bar** | Progress bars visualize change over time. Drift is a point-in-time metric. A number is clearer than a bar. The bar also implied 10% is maximum, which is arbitrary. |
| **Removed "Details" title** | Redundant. The content makes it obvious this is a details view. |
| **"Target allocation" and "Current drift" as labeled pairs** | Clearer information hierarchy. Label above, value below. No ambiguity about what you're reading. |
| **"Within tolerance" instead of green color** | Color alone is ambiguous. Text is explicit. Also avoids red/green which has accessibility issues. |
| **Holdings as rows, not cards** | Same rationale as portfolio page. Flatter, quieter, more institutional. |
| **Current/target percentages inline** | "49.2% / 50%" is compact and scannable. Separating them into different visual areas creates unnecessary eye movement. |
| **"Restore to 50 / 50" instead of "Rebalance Now"** | "Rebalance Now" is urgent and action-oriented. "Restore to 50 / 50" is descriptive — it tells you what will happen. It also uses the user's chosen allocation, making it personal. |
| **Vault address at reduced opacity** | Institutional detail. It's there for verification but shouldn't compete with primary information. |
| **Removed refresh button** | Same rationale as portfolio. Silent updates are more trustworthy than manual refresh. |

---

## Design Principles Applied

1. **One dominant idea per screen**
   - Portfolio: Your balance, maintained.
   - Details: Your allocation settings and current state.

2. **Reduce visual noise**
   - Removed cards, icons, progress bars, warning banners
   - Used simple rows and subtle borders
   - Let whitespace do the work

3. **Information hierarchy through typography**
   - Primary: Large numbers (balance, drift)
   - Secondary: Labels and status text
   - Tertiary: Asset details

4. **System state, not status badges**
   - "Maintained at 50 / 50" vs "On track"
   - "Within tolerance" vs green checkmark
   - Factual, not evaluative

5. **Actions available, not inviting**
   - Text links instead of buttons
   - Muted color until hover
   - Grouped at bottom, not prominent

6. **Balance-sheet style, not portfolio cards**
   - Horizontal rows with asset | amount | value
   - Current/target inline
   - Borders instead of background colors

7. **Institutional confidence**
   - Clean typography, generous spacing
   - No emojis, no icons, no flourishes
   - Trust through restraint

---

## Technical Notes

- No breaking changes to functionality
- All data hooks and state management unchanged
- Removed unused imports (RefreshIcon, formatTimeAgo, etc.)
- Build passes with zero errors
