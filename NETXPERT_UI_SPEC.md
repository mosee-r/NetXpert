# NetXpert — Detailed UI/UX Specification

**Document type:** Product, Interface, and Technical UX Specification  
**Product:** NetXpert Android Network Diagnostics App  
**Platform:** Android First; React Native / React + TypeScript  
**Design Reference:** Ubiquiti WiFiman, Cloudflare Speed Test, Meteor by OpenSignal.

## Color Tokens & Theme
- `background`: `#070F1E` (Deep obsidian-navy app canvas)
- `surface`: `#0E1A2E` (Card base surface)
- `surfaceElevated`: `#15253D` (Active cards, menus, modals)
- `borderSubtle`: `rgba(255, 255, 255, 0.08)` (1px card outline)
- `borderFocus`: `rgba(39, 215, 242, 0.40)` (Active test borders)
- `textPrimary`: `#F4F8FC`
- `textSecondary`: `#8E9EAF`
- `textMuted`: `#58697E`
- `accentCyan`: `#27D7F2` (Primary gauge accent, download pulse)
- `accentIndigo`: `#536DFE` (Secondary gauge gradient, upload pulse)
- `accentPurple`: `#8C52FF` (Latency / loaded latency markers)
- `success`: `#00E676` (Optimal performance)
- `warning`: `#FFB300` (Bufferbloat detected / moderate)
- `danger`: `#FF5252` (Poor / packet loss)

## Navigation Architecture
- 4-tab bottom navigation bar:
  1. `Speed Test` (Home)
  2. `Network`
  3. `Tools`
  4. `Trends` (History)
- Header with Settings `[⚙]` modal and History log shortcut.
