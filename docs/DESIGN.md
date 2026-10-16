# Design record

Every model is designed from the game's own design language and from general principles (proportions, how detail is layered, how materials catch light), never from another game's designs. Each entry says what principle it uses, what was considered, and what makes it its own. Reference footage is only used afterwards, to check the result is not close to anything in it; nothing from it is ever kept in the repository.

## The design language

- **Angular wedge plates.** Hard surfaces are faceted blocks that taper and lean: prows, keels and swept edges, never domes or pills.
- **Graphite and one bright colour.** One bright colour (the team's) on the big plates and in thin lit seams; everything else graphite and gunmetal.
- **Visible thrusters.** The movement kit shows on the body: nozzles on the pack, the shoulders and the calves.

## Pilot armour (characters/armour.js)

**Principles used.**
- Heavy, athletic proportions: broad shoulders, plated limbs, a full-face helmet.
- Detail layered from big to small: big plates, then a second graphite layer and panel lines, then small mechanical parts (pistons across the elbows, knees and ankles, bolts, cables, vents), then wear on the edges.
- A dark flexible undersuit at the joints.

**What makes it its own.**
- The chest is a keeled prow: two pectoral wedges meet at a central keel.
- The shoulders are swept-back wedges with a leading edge, not rounded pauldrons.
- The knees and shins carry forward prows.
- Thruster nozzles sit on the backs of the shoulders and calves as well as on the pack.
- The palette is graphite plus the team colour, with cool-white eye slits.

**Distance levels.** Up close every part is drawn (about 7,300 triangles). At mid range the small mechanical parts go (about 6,000). Far off every plate is a plain block and the hand is a mitten (about 2,300). The draw calls are the same at every level.

### Helmet

Three variants were built and compared:

| Variant | Form | Verdict |
|---|---|---|
| Prow (chosen) | Faceted shell narrowing to a flat top; two narrow eye slits angled up and out, under a short brow ridge; a continuous faceplate; a jutting chin wedge; short swept fins | Shares neither a rounded shell nor a single wide visor with the common armoured-soldier look; uses the wedge language |
| Bar | Squared shell, one narrow horizontal visor bar under a heavy brow, upright cheek fins, a sensor stalk | Rejected: a single horizontal visor band is the closest of the three to the familiar look |
| Three lenses | Faceted dome, one large and two small round lenses, a respirator snout | Rejected: the dome is closest in outline, and the lenses read as a diver or robot rather than a pilot |

**Checks.**
- Silhouette check, against the reference footage's armour at front, three-quarter and side views:
  - The helmet outline (a flat-topped trapezoid) and the face (two slits) differ from a rounded shell with one large visor.
  - The shoulder wedges differ from rounded pauldrons.
  - One revision came out of it: the keel first ran down the whole face between the slits, which made a T-shaped face, a well-known visor shape elsewhere. It is now a short ridge above the slits only.
- Fresh-eyes check: a reviewer shown only the render named no specific source ("a generic sci-fi soldier or armoured trooper") and saw only vague, genre-level resemblances.

**Fit to the style guide's measured principles.**
- Helmet about 0.14 H wide including its fins, against a guide of about 0.12 H; this came after narrowing the shell and pulling the fins in.
- Shoulders slimmed toward the guide's 0.33–0.38 H.
- The graphite second layer is tinted toward the team colour, so the team colour keeps most of the silhouette.

**Open decision.** The design uses three of the candidate signature traits (wedge plates, thrusters as a motif, graphite). The final pick of two or three is the user's, and the parts are easy to retune once it is made.
