# UX Refinements Changelog

This documents all copy and UX changes made to improve trust, clarity, and reduce regulatory risk.

## Guiding Principles

- Calm > clever
- Obvious > flexible
- Restraint > features
- Neutral > persuasive
- Safety > growth

---

## contracts.ts

**Change:** Renamed `RISK_LEVELS` to `ALLOCATION_PRESETS` with neutral percentage names

| Before | After |
|--------|-------|
| Very Conservative | 10 / 90 |
| Conservative | 25 / 75 |
| Balanced | 50 / 50 |
| Growth | 75 / 25 |
| Aggressive | 90 / 10 |

**Why:** Terms like "Conservative", "Growth", and "Aggressive" imply investment advice and risk assessment. This creates regulatory exposure and sets expectations the product cannot guarantee. Neutral percentage names (10/90, 50/50) describe what the user is choosing without characterizing it as suitable for any particular situation.

---

## Welcome Page (page.tsx)

**Change:** Tagline
- Before: "Calm wealth management"
- After: "Simple allocation between BTC and USD"

**Why:** "Wealth management" is a regulated term in many jurisdictions. It implies professional oversight and fiduciary responsibility. "Simple allocation" describes the mechanism without claiming advisory status.

**Change:** Value propositions
- Before: Checkmarks with marketing copy
- After: Numbered steps (1. Choose allocation, 2. Deposit USDC, 3. Withdraw anytime)

**Why:** Numbered steps are instructional, not promotional. They set clear expectations about what the product does without overselling.

**Change:** CTA button
- Before: "Get Started"
- After: "Continue"

**Why:** "Get Started" is marketing language that creates excitement. "Continue" is neutral and functional - the user knows what to expect.

**Change:** Footer
- Before: "Non-custodial. You stay in control."
- After: "Non-custodial. Your keys, your funds."

**Why:** "You stay in control" is subjective and could be disputed. "Your keys, your funds" is a factual statement about custody that users familiar with crypto will understand.

---

## Setup Page (setup/page.tsx)

**Change:** Step naming
- Before: 'risk' step
- After: 'allocation' step

**Why:** Consistency with the neutral language throughout.

**Change:** Heading
- Before: "Choose your style"
- After: "Select allocation"

**Why:** "Style" is vague and casual. "Select allocation" is precise and functional.

**Change:** Subtitle
- Before: "Risk Level"
- After: "BTC / USDC split"

**Why:** "Risk Level" implies the product assesses risk. "BTC / USDC split" describes the factual outcome.

**Change:** Loading state
- Before: "Creating vault...", "Approving USDC...", "Depositing..."
- After: "Processing..." with "Please confirm in your wallet"

**Why:** Technical step names create anxiety and confusion for non-technical users. A single "Processing" state with clear guidance is calmer and more trustworthy.

**Change:** CTA button
- Before: "Create Vault"
- After: "Confirm"

**Why:** "Create Vault" is technical jargon. "Confirm" is universally understood.

---

## Portfolio Page (portfolio/page.tsx)

**Change:** Page heading
- Before: "Portfolio"
- After: "Balance"

**Why:** "Portfolio" implies investment management. "Balance" is neutral and describes what the user is viewing.

**Change:** Asset labels
- Before: "Bitcoin", "Stablecoin"
- After: "BTC", "USDC"

**Why:** Consistent abbreviations are more precise and less casual.

**Change:** Status badges removed
- Before: "On track", "Slight drift", etc.
- After: Simple current allocation display

**Why:** Status badges make judgments about what is "good" or "bad". Users should draw their own conclusions from the numbers.

**Change:** Empty state
- Before: Marketing copy about getting started
- After: "No funds deposited. Deposit USDC to get started."

**Why:** Direct and factual without persuasion.

**Change:** Withdraw button
- Before: "Withdraw All"
- After: "Withdraw"

**Why:** "All" is redundant - the action is clear.

---

## Details Page (details/page.tsx)

**Change:** Back link
- Before: "← Back to Portfolio"
- After: "← Back"

**Why:** Consistency - the destination page is now called "Balance", and "Back" is simpler.

**Change:** Asset name
- Before: "Bitcoin"
- After: "BTC"

**Why:** Consistency with portfolio page.

**Change:** Rebalance button
- Before: "Trigger Rebalance"
- After: "Rebalance"

**Why:** "Trigger" is technical jargon. The action is clear without it.

**Change:** Loading state
- Before: "Rebalancing..."
- After: "Processing..."

**Why:** Consistency with other processing states.

**Change:** Technical section label
- Before: "Risk level"
- After: "Allocation"

**Why:** Consistency with neutral terminology throughout.

---

## README.md

**Change:** Tagline
- Before: "Calm, automated portfolio management. Set it once. Stay in control."
- After: "Simple allocation between BTC and USD. Non-custodial."

**Why:** "Portfolio management" is a regulated term. The new tagline is factual.

**Change:** Description
- Before: "...for long-term savings. You choose a risk level..."
- After: "You choose a target allocation, deposit USDC, and the vault maintains the split..."

**Why:** "Long-term savings" implies suitability for retirement or financial planning. "Risk level" implies advisory assessment.

**Change:** Allocations table
- Before: "Risk Levels" with advisory names
- After: "Allocations" with percentage names

**Why:** Consistency with the app.

**Change:** How It Works section
- Before: Marketing copy with "Relax" step
- After: Functional steps describing actual actions

**Why:** "Relax" is subjective and could be seen as minimizing risk. The new copy describes what actually happens.

---

## Summary

All changes follow the principle of **describing mechanisms, not making promises**. The product now presents itself as a tool with clear functionality rather than a service that makes judgments or recommendations.

This reduces:
- Regulatory exposure
- User expectations that can't be met
- Perceived conflicts between marketing and reality

And increases:
- Trust through transparency
- Clarity through precision
- Professionalism through restraint
