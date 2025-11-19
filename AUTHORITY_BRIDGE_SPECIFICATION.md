# Authority Bridge: Technical Specification

**Version:** 1.0  
**Date:** November 19, 2025  
**Status:** Ready for Implementation

---

## 1. Overview

The "Authority Bridge" is the strategic linking infrastructure that connects **The NW London Local Ledger** (News/Data Site) to **Hampstead Renovations** (Money Site).

This document defines the technical rules for how the Ledger must link to the main site to maximize SEO authority transfer without triggering spam filters.

## 2. The "Golden Rule" of Linking

> **"Every link must be editorially justified and provide value to the reader."**

Do not hide links. Do not use white text. Do not spam the footer. Links must appear in the body content where they make sense.

---

## 3. Integration Map (`ledger_integration_map.json`)

We have created a machine-readable JSON file (`ledger_integration_map.json`) that defines the relationship between "News Topics" and "Money Pages".

**How to use it:**
1.  **Ingest:** The Ledger system should load this JSON file on startup.
2.  **Match:** When generating content (e.g., a planning application summary), the system should scan the text for keywords defined in `service_mapping`.
3.  **Link:** If a match is found, inject a link using one of the `anchor_text_templates`.

---

## 4. Linking Strategies

### Strategy A: The "Featured Expert" Block (High Visibility)
**Placement:** Sidebar or End of Article.  
**Trigger:** Article is about a specific renovation type (e.g., "New Basement Policy in Camden").

**Template:**
> **Planning a Basement in Camden?**
>
> Navigating the new basement policy can be complex. We recommend **Hampstead Renovations**, the leading local specialists.
>
> *   [View their Basement Conversion Guide](https://hampsteadrenovations.co.uk/basement-conversion/)
> *   [Check Basement Costs in NW3](https://hampsteadrenovations.co.uk/basement-conversion/nw3.html)

### Strategy B: The "Contextual Mention" (Editorial Flow)
**Placement:** Inside the article body.  
**Trigger:** Mention of property value or construction.

**Example:**
> "According to recent Land Registry data, properties with [modern kitchen extensions](https://hampsteadrenovations.co.uk/kitchen-renovation/) in NW6 have seen a 15% value increase year-on-year."

### Strategy C: The "Hyper-Local Street Link" (The Secret Weapon)
**Placement:** Property Data Pages.  
**Trigger:** User is viewing a specific street page on the Ledger (e.g., `nwledger.co.uk/streets/abbey-road-nw8`).

**Logic:**
1.  Identify the street: `Abbey Road`
2.  Identify the postcode: `NW8`
3.  Construct the target URL using the pattern from `ledger_integration_map.json`:
    *   `https://hampsteadrenovations.co.uk/streets/nw8/house-extension-abbey-road-nw8.html`
4.  **Display:**
    > "See recent **House Extension projects on Abbey Road** by our partner, Hampstead Renovations."

---

## 5. Implementation Checklist for `nw-london-ledger` Repo

- [ ] **Copy `ledger_integration_map.json`** to the root of the `nw-london-ledger` repository.
- [ ] **Create a `LinkInjector` service** in the Ledger's backend that reads this map.
- [ ] **Configure the `LinkInjector`** to randomly select anchor text variations (never use the same anchor text 100% of the time).
- [ ] **Set `rel="dofollow"`** on all these links. This is crucial.
- [ ] **Set `target="_blank"`** to keep the user on the Ledger site while opening the renovation site.

---

## 6. Maintenance

*   **Monthly:** Review the `ledger_integration_map.json` to add new services or update URL structures.
*   **Monitoring:** Use Google Search Console to verify that links are being picked up and are not generating "Unnatural Outbound Link" warnings.
