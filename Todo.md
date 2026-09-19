# Household Bills — build plan

Self-hosted bill tracking for a shared house. Runs as a single Docker container on
TrueNAS. Tracks who owes what, emails people about it, and never touches money.

## Scope

**In scope**
- Enter a bill, split it, see who owes what, mark it settled.
- No-reply email: new bill, reminder before due, overdue nudge, weekly summary.
- Recurring bills (rent, power, internet) generated on schedule.
- Netted balances with one-tap settle-up between two people.
- History with search, filters, and CSV export.
- Distinct mobile and desktop views, chosen by server-side device detection.

**Explicitly out of scope**
- Payment processing. The app moves no money and is not a payment facilitator.
- Bank feeds / CDR / Open Banking. Requires ACCC accreditation; not viable self-hosted.
- Storing BSB or account numbers. PayID (email or mobile) plus a free-text note only.

## Requirements

| # | Requirement | Source |
|---|---|---|
| R1 | Enter a bill as an amount with a description and due date | stated |
| R2 | Send no-reply email notifications | stated |
| R3 | Either party can mark a bill settled; both sides see the change | stated |
| R4 | AUD amounts, DD/MM/YYYY dates, container-local timezone | stated |
| R5 | Runs in Docker on TrueNAS, self-hosted | stated |
| R6 | Different views on phone vs desktop, by detection | stated |
| R7 | Admin-invited accounts, small fixed household | chosen |
| R8 | Flexible split per bill: even, custom amount, custom %, or single payer | chosen |
| R9 | PayID + payment note stored; no bank account numbers | chosen |
| R10 | Recurring bills, netted balances, overdue reminders, history + CSV | chosen |
| R11 | LAN/VPN deployment; sane auth, no public-internet hardening budget | chosen |
| R12 | Must not read as AI-generated, in code or UI | stated |

## Money rules

Amounts are **integer cents**. No floating point anywhere in the money path.
Splitting uses the **largest-remainder method**: divide, then distribute leftover
cents one at a time to the largest fractional parts. Shares always sum to the
total. Allocation order is stable so the same bill splits the same way twice.

## Phases

- [x] 1. Scaffold, config, Tailwind, base layout
- [x] 2. Schema and migrations
- [x] 3. Money core + split algorithm, with tests
- [x] 4. Auth: argon2id, sessions, invites, first-run admin setup
- [ ] 5. Bills: create, split, view, settle
- [ ] 6. Balances and settle-up
- [ ] 7. Recurring series and the scheduler
- [ ] 8. Email delivery and reminder jobs
- [x] 9. Mobile and desktop shells
- [ ] 10. History, search, CSV export
- [~] 11. Dockerfile and compose done; TrueNAS notes outstanding
- [ ] 12. README and first-run walkthrough
