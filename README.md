# Gut microbiome / Game Of Life

A retro terminal-style browser simulation of a circular colon section. Square cells evolve under the selected cellular rule, with fixed niches and nutrients in the random initial state.

The interface defaults to **Bacteria (B34/S456)**: ordinary cells are born with 3 or 4 living neighbors and survive with 4, 5, or 6, subject to the mucus gradient. The controls also offer Conway B3/S23 and sliders for niche types, type weights, densities, nutrient share, and speed. The rules and sliders are available in the collapsed Rules & settings dropdown. The visible Setup heading and Help button remain removed.

Run `npm start`, then open http://localhost:8000. Requires Python 3 and Pillow (`python3 -m pip install -r requirements.txt` in your Python environment), with no npm install. Montserrat and the supplied QR are bundled locally, so the app needs no internet connection. Run `npm test` with Node.js 18+ to check the simulation and receipt service.

The interface defaults to **five niche types** and six generations per second. Rules and setup sliders are in one collapsed dropdown. The large START button becomes **SEQUENCE YOUR GUT MICROBIOME** during play, with a smaller “(finishes the game)” note; pressing it takes the snapshot and ends the run. Larger intervention buttons appear directly below it during play. There is no run timer. Before each run, the participant enters a name (1–60 characters; a nickname is fine). Cancel leaves the simulation untouched. Names are included in printed receipts and can therefore remain in the local print spool, but are not stored in browser storage or added to a separate participant database.

## 58 mm receipt printing

After SEQUENCE ends a run, a screen asks whether to print the functional profile. It shows a black-on-paper, monospaced receipt preview and a larger **Print ticket** button alongside **Skip**. Closing the ticket prepares a fresh random run and returns the large button to START; there are no separate Reset, New run, or Receipt buttons. The dark interface uses Montserrat.

The receipt is titled **Gut microbiome: Game Of Life** and lists the participant's name and each niche type's **relative abundance**, with the raw count column omitted, not the number of fixed niche sites. The chart and receipt use fractions, not percentages: count divided by all free microbes in the most recent SEQUENCE snapshot. Four-decimal display rounding uses largest remainders so nonempty fractions sum to 1.0000. This is normalization of simulation counts, not an imported HUMAnN dataset. Nutrients are excluded; empty samples show N/A.

The ticket omits timestamps, run IDs, generation/sample metadata, total sampled, the equal-neighbors bullet, SEQUENCE mechanics, and intervention details. It includes a short explanation of Game of Life and related rule sets such as Bacteria, six core-rule bullets, including indirect competition for space, nutrient conversion after each generation, and the mucus barrier without a square count, the LifeWiki URL, and credits to Albert Garcia-Valiente / The Microbiome Research Lab.

Directly beneath the participant name, the ticket says “We sequenced and profiled your gut microbiome” instead of the preset name/notation. The heading reads **CORE RULES (Conway)** or **CORE RULES (Bacteria)** according to the selected mode. Rule descriptions use **microbes**. The introduction explains functional niches as the jobs microbes do, links those roles to health, and describes complex patterns emerging from simple local rules.

The receipt table uses the requested labels **NICHE**, **Function A–E**, and **Adjusted CPMs**, with no count column or “Fractions of sampled bacteria” sentence. The displayed values remain the previously requested fractions summing to 1, not true counts per million or HUMAnN output; the heading is a custom display label only. The introduction describes different rule universes, including Bacteria B3,4/S4,5,6, and closes with “Complexity emerges, biology harnesses it.”

The supplied QR is copied unchanged to `assets/participant-qr.png` and shown below the credits. Its encoded destination is preserved separately from the printed LifeWiki link. The printer receives a smaller 192-dot QR centered in a 384-dot-wide bitmap with white margins via the tested GS v 0 raster command. Accented-name lines also use bitmap rendering with bundled Montserrat instead of uncertain printer character encodings; ordinary ASCII text keeps the proven minimal printing sequence.

`npm start` now runs `server.py`, which serves the interface and sends ESC/POS receipts directly through Linux CUPS to **Iggual_TP_Easy_58**. It does not open the browser print dialog or change the system default printer. The existing queue must point to the USB printer. Check it with `lpstat -p Iggual_TP_Easy_58` and `lpstat -v Iggual_TP_Easy_58`. The printer must be powered on with 58 mm thermal paper loaded.

Stop the old `python3 -m http.server 8000` process before starting this server on the same port; a plain static server cannot print. Alternatively use `python3 server.py --port 8001`. To choose another explicitly configured queue, use `python3 server.py --printer QUEUE_NAME`.

Printing happens only after pressing Print. Successful submission means **queued**, not proof that paper printed; check the Linux queue and printer if nothing appears. Duplicate clicks/retries for the same run are suppressed for the server session. A timed-out submission is not resent automatically because it may already be queued. Restarting the server clears this in-memory protection: check pending jobs before retrying an old receipt. No cutter or RJ11 cash-drawer commands are sent.

Printer compatibility: this connected unit printed the minimal `ESC @` + plain ASCII + CRLF diagnostic, but fed blank paper with the original explicit font/alignment commands and LF-only lines. Receipts now use the tested minimal sequence and printer-default font. The specific individual command responsible was not isolated; the interface's Montserrat font is unrelated to the raw printer output.

The service binds only to 127.0.0.1, accepts local Host headers and same-origin token-authenticated POSTs, validates the summary, and constructs printer commands itself. It does not accept arbitrary printer bytes, commands, filenames, or printer names from the browser. It serves only the app's listed public assets. Keep this service local; it is not a public print server.

References: [iggual TP Easy 58 specifications](https://www.iggual.com/iggual-impresora-termica-tp-easy-58-usb-rj11-negra080623180004/), [CUPS printing commands](https://www.cups.org/doc/options.html), [Montserrat source and license](https://github.com/google/fonts/tree/main/ofl/montserrat).

## Rules

- Random initial state in a 61×61 square grid clipped to a circle. Outside cells are always dead; no wrapping.
- All live cells count equally in the eight-cell neighborhood. Birth and survival counts follow the selected rule.
- The outer ten-square radial band progressively lowers the upper survival limit, keeping the minimum unchanged. For Bacteria, its first four levels permit 4–5 neighbors, the next four permit 4, and the outer two permit none. A level with an empty survival range blocks births and initial placement of both bacteria and nutrients. Other levels keep the normal birth counts.
- **Leaky gut** switches the gradient off, restoring base survival and birth rules throughout the field; switching it off restores the gradient, removing any cells in fully forbidden bands at the next generation. This toggle does not move cells or allow new niche locations. Starting a fresh run switches it off.
- Niche sites are restricted to cell centers more than twenty squares from the field center and within the viable part of the mucus band. Neither initial placement nor probiotics can create niches in the central disk or fully blocked outer levels, even with leaky gut active. Distances are Euclidean, measured in grid-square units.
- Only pressing **SEQUENCE** takes a snapshot of all free microbes by function across the entire circular field at that instant and ends the run. It does not clear or change any cells. There is no timer or extra SEQUENCE button in the results screen. Nutrients and fixed niches are excluded from the counts.
- Births inherit the majority neighboring type, treating nutrient as a distinct type. Ties are random. Survivors retain their type.
- Niches count as live cells but cannot die under the cellular rule. Each antibiotic dose randomly deactivates 25% of current living niches and removes 80% of current free bacteria, rounded up separately. Nutrients and previously sampled counts are unaffected. Deactivated sites can host ordinary cells. Each probiotic press randomly selects one function type using the selected weights, restores 25% of vacant inactive niche sites, and targets a random dose of 25–70 new free microbes of that type in connected blobs of 3–8 cells. Shapes vary around a rule-specific five-cell core; smaller and larger blobs may die or persist depending on neighbors. Blobs are placed in eligible empty squares while avoiding occupied niches, nutrients, and the active mucus gradient. If space is insufficient, fewer complete blobs are added. Snapshot counts do not change until SEQUENCE is pressed.
- After each cellular update, every remaining nutrient neighboring an occupied niche becomes a matching free bacterium in the same square. Competing niches are resolved randomly, once per nutrient; conversions do not cascade. A nutrient that dies in the cellular update cannot be converted.
- There are no nutrient pulses, automatic replenishment, or manual nutrient waves. The wave, fasting, and prebiotic controls have been removed. Nutrients can still survive or be born through the selected cellular rule.
- Function counts reflect the SEQUENCE snapshot. Each function's relative abundance is its count divided by all free microbes present in the field at that instant. Ordinary births, conversions, and deaths do not update the chart before SEQUENCE. An empty snapshot produces zero counts. Snapshot history stores the sample's generation and counts per function.

The relative-abundance chart shows the SEQUENCE snapshot. The separate total births-recorded display and location minimap have been removed.

START runs continuously at the selected generation speed without pause or single-step controls. Setup controls can be adjusted before play; interventions appear only during play. Only SEQUENCE ends the run. Closing the ticket randomizes the state and clears counts and sample history for the next START.

There is no downward flow, secondary-metabolite system, or same-type cancellation rule. The simulation is an abstract model rather than a biological prediction.
