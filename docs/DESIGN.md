# Design record

Every model is designed from the game's own design language and from general principles (proportions, how detail is layered, how materials catch light), never from another game's designs. Each entry says what principle it uses, what was considered, and what makes it its own. Reference footage is only used afterwards, to check the result is not close to anything in it; nothing from it is ever kept in the repository.

## The design language

**The signature: thruster vents.** The movement kit is the game's signature, and it is visible:
- clusters of louvred vents sit on the body where the thrust comes from, dark at rest;
- their heat cores glow when the kit is used and cool off afterwards;
- the same vent shape repeats on weapons (as heat sinks), on drop pods and on pickup pads.

Everything else stays plain, so the vents carry the identity. The plates are chamfered blocks with only a gentle taper, in the team colour and a darker team tone. The thin lit seams, and the visor that follows the shield, stay as they were.

**The vent, for every model that uses it.**
- A rectangular frame (gunmetal, about a sixth of the cluster's width deep) round 3–5 louvred slats tilted about 37 degrees, over a flat heat core set just behind them.
- The core is near-black at rest. It heats in a fraction of a second and cools over one to two seconds, running dark, dull red, orange, then pale yellow at the peak.
- The heat follows the activity: a thrust or a ground pound is full heat, a slide three quarters, a pound's charge or a stabilise about half, and the sprint assist a little.
- Proportions: the slats are about half their pitch thick; on a body, clusters are 5–17 cm.

## Pilot armour (characters/armour.js)

**Principles used.**
- Heavy, athletic proportions: broad shoulders, plated limbs, a full-face helmet.
- Detail layered from big to small: big plates, then a second layer and panel lines, then small mechanical parts (pistons across the elbows, knees and ankles, bolts, cables), then wear on the edges.
- A dark flexible undersuit at the joints.

**The signature on the body.**
- Vent clusters on the back: two on the pack, either side of a narrow cover strip.
- On the backs of the calves.
- On the outsides of the forearms.
- The pack's main nozzles and small steering nozzles on the pack and shoulders support the motif.

**Distance levels.** Up close every part is drawn (about 7,650 triangles). At mid range the small mechanical parts go (about 6,500). Far off every plate is a plain block, the vents lose their slats (the frame and the glowing core are left) and the hand is a mitten (about 2,550). The draw calls are the same at every level. The shadow of a near or mid pilot is cast by a shadow hull: the far level's opaque parts, about 2,450 triangles, used instead of the detailed meshes, since the shadow pass draws every caster again. A near pilot costs about 12,600 triangles in all (view plus shadow), against about 13,500 for the old armour; a far one about 5,000.

### Helmet

Three variants were built and compared:

| Variant | Form | Verdict |
|---|---|---|
| Prow (chosen) | Faceted shell narrowing to a flat top; two narrow eye slits angled up and out, under a short brow ridge; a continuous faceplate; a jutting chin wedge; short swept fins | Shares neither a rounded shell nor a single wide visor with the common armoured-soldier look |
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
- The second layer is the darker team tone, so the team colour holds the silhouette.

**Signature decided.** The user picked the thruster vents as the one signature trait. The other candidates (wedge plates, a graphite and amber palette, a lit visor) are not built on. The plates were softened to gentle chamfers and the second layer went back to the darker team tone.
