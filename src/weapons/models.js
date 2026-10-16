/* ============ weapon models: one design per weapon (WEAPON_DATA order), built three ways ============
   as the first-person viewmodel (weapons/viewmodels.js), the gun in other pilots' hands (weaponParts in
   characters/rig.js) and the model on the floor (weapons/pickups.js). Coordinates are the viewmodel's:
   metres, -z forward, sights and muzzles where VMW and data/weapons.js expect them.
   A part is "<shape><material>[flags] a b c x y z [e] [ry] [*n dx dy dz]":
     shape     b box, r bevelled box (a b c = width height depth), c cylinder along z (a = front radius,
               b = back radius, c = length), v upright cylinder, s cylinder across, n the ammo counter
     material  D dark metal, P light plate, A armor (the pilot's colour), S polymer, G light (it flares
               on each shot and turns red on low ammo), C amber paint, E fine lights (indicator strips,
               readouts: first person only, with Surface detail on High)
     flags     f first person only, m the magazine (it moves through the reload), a the action (a slide or
               pump: it cycles after each shot in first person)
     e         the tilt about x, or a cylinder's number of sides
     *n        repeats the part n times, stepping by (dx, dy, dz) */
const GUN_MODELS = [
  /* VK-7 pulse carbine: split upper and lower receiver with armor panels, a finned heat sink over a
     glowing barrel core, hex brake, holo sight on a toothed rail, counter behind the sight */
  [
    "rD .074 .07 .32 0 -.02 -.03",
    "rP .068 .05 .36 0 .035 -.05",
    "rA .006 .042 .13 -.035 .03 .03 *2 .07 0 0",
    "rA .006 .042 .1 -.035 .03 -.14 *2 .07 0 0",
    "bC .076 .005 .2 0 .012 -.07",
    "bD .03 .008 .34 0 .064 -.06",
    "bDf .036 .005 .008 0 .0705 .1 *2 0 0 -.025",
    "bDf .036 .005 .008 0 .0705 -.14 *4 0 0 -.025",
    "bD .05 .014 .05 0 .074 -.08",
    "bD .07 .012 .07 0 .086 -.08",
    "rD .01 .056 .06 -.036 .118 -.08 *2 .072 0 0",
    "rD .082 .01 .06 0 .15 -.08",
    "bD .036 .012 .03 0 .072 0",
    "nG .028 .014 0 0 .08 0 -.9",
    "cD .044 .046 .24 0 .005 -.34 8",
    "bG .094 .008 .14 0 .005 -.34",
    "bD .096 .016 .01 0 .005 -.4 *4 0 0 .04",
    "cG .012 .012 .1 0 .01 -.51",
    "cD .028 .028 .006 0 .01 -.475 10 *5 0 0 -.017",
    "cD .016 .016 .03 0 .01 -.56",
    "cD .022 .02 .04 0 .01 -.58 6",
    "bDf .052 .006 .01 0 .01 -.587",
    "rD .06 .085 .1 0 -.005 .17",
    "bP .022 .014 .028 -.04 .045 .02",
    "rD .05 .03 .16 0 .025 .28",
    "rD .045 .03 .16 0 -.04 .27 -.15",
    "rS .056 .11 .03 0 -.01 .355",
    "bG .078 .004 .1 0 -.03 .04",
    "rD .06 .03 .09 0 -.06 -.12",
    "rS .045 .11 .055 0 -.1 .08 .25",
    "bDf .048 .005 .05 0 -.071 .087 .25 *4 0 -.0194 -.0049",
    "bD .01 .008 .08 0 -.075 .01",
    "bP .006 .022 .006 0 -.062 .02 .3",
    "rSm .05 .15 .075 0 -.13 -.12",
    "bSm .056 .016 .082 0 -.2 -.12",
    "bSm .054 .1 .012 0 -.13 -.16",
    /* machined detail, clustered top-rear by the optic (the forward lower body stays plain): screws
       on the panels, an exposed energy cell on the right with its window lit, the optic's turret
       and illumination dial, an indicator strip along the handguard, lit ports in the brake, and
       the wedge language: forward chevrons cut into the handguard */
    "bAf .003 .004 .034 -.046 .016 -.3 .65 *2 0 0 -.05",
    "bAf .003 .004 .034 -.046 -.006 -.3 -.65 *2 0 0 -.05",
    "sDf .0032 .0032 .003 -.0395 .045 .07 6 *3 0 0 -.03",
    "sDf .0032 .0032 .003 -.0395 .045 -.12 6 *2 0 0 -.04",
    "rD .02 .032 .07 .046 -.012 .05",
    "bEf .002 .018 .05 .0565 -.012 .05",
    "vDf .011 .011 .012 0 .161 -.08 10",
    "sDf .009 .009 .012 .046 .118 -.08 10",
    "sEf .0045 .0045 .003 -.0425 .118 -.08 8",
    "bEf .004 .002 .16 0 .052 -.32",
    "bEf .047 .004 .004 0 .01 -.574 *2 0 0 .012",
    "cSf .003 .003 .11 -.028 -.05 -.03 6",
  ],
  /* M9 magnum: heavy slide with a ported compensator and a counter on its side, glowing lines, armored grip
     panels, iron sights with the dot on the front post */
  [
    "rDa .042 .042 .19 0 .027 -.03",
    "rD .044 .044 .035 0 .026 -.14",
    "bG .046 .005 .006 0 .038 -.145 *2 0 0 .014",
    "cP .009 .009 .02 0 .026 -.152 10",
    "bPa .022 .008 .17 0 .05 -.04",
    "bPfa .044 .03 .004 0 .027 .02 *5 0 0 .01",
    "bG .002 .006 .12 -.0215 .012 -.03 *2 .043 0 0",
    "nG .03 .012 0 -.0215 .027 -.02 0 -1.5708",
    "rP .036 .028 .17 0 -.006 -.035",
    "bC .038 .004 .15 0 -.021 -.04",
    "bD .03 .012 .07 0 -.025 -.09",
    "bP .008 .03 .05 0 -.035 0",
    "bD .006 .018 .006 0 -.03 .004 .3",
    "rS .036 .11 .052 0 -.07 .045 .22",
    "rA .04 .06 .036 0 -.065 .047 .22",
    "bDf .042 .004 .03 0 -.037 .052 .22 *5 0 -.0156 -.0035",
    "bD .006 .012 .008 0 .0525 -.135",
    "bDa .009 .012 .01 -.011 .0525 .05 *2 .022 0 0",
    "rDm .026 .08 .034 0 -.09 .05",
    "bDm .04 .014 .06 0 -.132 .035 .22",
    /* machined detail: screws on the frame, a lit cell indicator in the grip's top, the slide's lit
       cocking indicator, a forward chevron cut into the slide */
    "bAfa .003 .003 .022 -.0215 .034 -.08 .65",
    "bAfa .003 .003 .022 -.0215 .02 -.08 -.65",
    "sDf .003 .003 .003 -.0195 -.006 -.08 6 *3 0 0 .04",
    "bEf .002 .008 .016 -.0205 -.04 .045",
    "bEfa .002 .004 .008 -.0215 .04 .045",
  ],
  /* sniper: a long scope with a flared objective and a glowing lens at each end, turrets and an
     illuminator, vented fore-end, the barrel cased to the muzzle in a finned cooling shroud (the vent
     motif) ending in a narrow cone, folded bipod, skeleton stock */
  [
    "rD .072 .09 .38 0 0 .02",
    "rP .066 .072 .34 0 -.005 -.33",
    "rA .004 .044 .26 -.034 -.005 -.33 *2 .068 0 0",
    "bG .074 .008 .026 0 -.005 -.24 *4 0 0 -.06",
    "bC .074 .006 .3 0 .02 .02",
    "bD .04 .01 .4 0 .05 -.1",
    "cD .026 .026 .26 0 .115 -.07 14",
    "cD .044 .028 .08 0 .115 -.24 14",
    "cD .047 .047 .016 0 .115 -.27 14",
    "cG .038 .038 .004 0 .115 -.281 14",
    "cD .03 .034 .06 0 .115 .09 14",
    "cG .029 .029 .003 0 .115 .119 14",
    "cD .025 .025 .003 0 .115 .121 14",
    "vD .016 .016 .03 0 .155 -.06 10",
    "vP .018 .018 .006 0 .172 -.06 10",
    "sD .016 .016 .03 .04 .115 -.06 10",
    "rD .026 .032 .04 -.04 .115 -.06",
    "bG .002 .014 .022 -.0535 .115 -.06",
    "cP .034 .034 .016 0 .115 -.15 14 *2 0 0 .16",
    "bP .03 .05 .016 0 .08 -.15 *2 0 0 .16",
    "cD .026 .03 .38 0 .015 -.69 8",
    "cD .036 .036 .008 0 .015 -.55 8 *7 0 0 -.045",
    "cD .016 .028 .07 0 .015 -.915 8",
    "cD .011 .011 .02 0 .015 -.94 8",
    "sD .012 .012 .05 0 -.045 -.47 8",
    "bD .008 .008 .2 -.018 -.05 -.36 *2 .036 0 0",
    "sP .006 .006 .05 .055 .02 .13 8",
    "rP .02 .02 .02 .08 .02 .13",
    "nG .03 .014 0 -.0365 .015 .1 0 -1.5708",
    "rS .05 .12 .06 0 -.1 .12 .25",
    "bDf .053 .005 .055 0 -.069 .128 .25 *5 0 -.0194 -.0049",
    "bD .01 .008 .09 0 -.065 .04",
    "bP .006 .022 .006 0 -.055 .06 .3",
    "rD .06 .03 .24 0 .025 .33",
    "rA .05 .028 .12 0 .05 .32",
    "rD .05 .025 .2 0 -.07 .35 -.12",
    "rS .062 .15 .035 0 -.02 .46",
    "rSm .05 .1 .07 0 -.1 -.02",
    "bSm .056 .014 .078 0 -.152 -.02",
    /* machined detail: screws down the receiver, the illuminator's cable to the rail and its lit
       range readout, an energy cell in the stock with its window lit, a lit band between two of the
       shroud's fins, forward chevrons cut into the fore-end's armor panels */
    "bDf .003 .004 .036 -.0365 .008 -.29 .65 *2 0 0 -.07",
    "bDf .003 .004 .036 -.0365 -.016 -.29 -.65 *2 0 0 -.07",
    "sDf .0035 .0035 .003 -.0375 .02 .1 6 *3 0 0 -.06",
    "vSf .003 .003 .044 -.045 .077 -.06 6",
    "bEf .018 .009 .002 -.04 .115 -.0385",
    "rD .02 .04 .06 .04 0 .3",
    "bEf .002 .026 .04 .0505 0 .3",
    "cEf .031 .031 .004 0 .015 -.8125 8",
  ],
  /* rocket launcher: one heavy tube in a six-sided faceted shroud (the wedge language) with vent
     slats down its flanks (the thruster motif) and a glowing warhead in the mouth, an armor band,
     a flared venturi, a spine with both grips under it, a side optic whose back is the counter */
  [
    "cP .068 .068 .86 0 0 -.2 16",
    "cD .09 .084 .3 0 0 -.59 6",
    "cD .096 .092 .05 0 0 -.715 6",
    "cC .098 .098 .016 0 0 -.68 6",
    "cG .058 .058 .004 0 0 -.741 16",
    "bD .006 .03 .012 -.083 0 -.5 *4 0 0 -.05",
    "bD .006 .03 .012 .083 0 -.5 *4 0 0 -.05",
    "cA .074 .074 .05 0 0 .05 16",
    "cG .071 .071 .012 0 0 -.42 16",
    "bC .142 .008 .14 0 0 -.18",
    "rD .05 .07 .62 0 -.06 -.16",
    "cD .075 .092 .08 0 0 .27 16",
    "bD .02 .014 .5 0 .072 -.2",
    "rD .05 .07 .15 -.1 .05 -.12",
    "rD .058 .012 .17 -.1 .09 -.12",
    "bD .06 .02 .04 -.06 .04 -.12",
    "cG .022 .022 .004 -.1 .055 -.197 12",
    "nG .036 .022 0 -.1 .055 -.043",
    "rD .05 .06 .1 0 -.12 .04",
    "rD .045 .06 .08 0 -.12 -.3",
    "rS .045 .12 .055 0 -.21 .04 .2",
    "bDf .048 .005 .05 0 -.18 .046 .2 *4 0 -.0196 -.004",
    "bD .01 .008 .08 0 -.175 -.03",
    "bP .006 .022 .006 0 -.165 -.01 .3",
    "rS .04 .1 .05 0 -.2 -.3",
    "cCm .062 .062 .1 0 0 .36 16",
    /* machined detail: screws along the spine, the optic's cable to the tube, arming lights down
       the tube, a lit ring inside the venturi (the thruster motif), forward chevrons on the
       shroud's flanks */
    "bAf .003 .004 .04 -.0815 .016 -.66 .65",
    "bAf .003 .004 .04 -.0815 -.016 -.66 -.65",
    "sDf .004 .004 .003 -.026 -.06 -.35 6 *4 0 0 .1",
    "cSf .004 .004 .14 -.075 .03 -.06 6",
    "bEf .002 .01 .03 -.0695 .02 -.3 *3 0 0 .05",
    "cEf .07 .07 .006 0 0 .232 16",
  ],
  /* scattergun: an octagonal shroud vented with light over a wide barrel, a glowing bore, ghost ring
     and bead on a vent rib, ridged pump, shells strapped to the left side */
  [
    "rD .086 .11 .3 0 -.01 -.07",
    "rA .004 .06 .2 -.044 0 -.08 *2 .088 0 0",
    "cD .046 .046 .34 0 .02 -.4 8",
    "bG .096 .012 .03 0 .02 -.3 *4 0 0 -.07",
    "cD .034 .034 .16 0 .02 -.64",
    "cD .046 .042 .05 0 .02 -.705 8",
    "cG .026 .026 .004 0 .02 -.731",
    "bP .016 .012 .46 0 .062 -.42",
    "bG .008 .01 .008 0 .072 -.66",
    "bD .04 .012 .03 0 .052 -.17",
    "bD .008 .022 .012 -.014 .07 -.17 *2 .028 0 0",
    "cD .022 .022 .4 0 -.045 -.43",
    "cP .026 .026 .03 0 -.045 -.64",
    "rPa .08 .07 .16 0 -.05 -.37",
    "bSa .084 .008 .012 0 -.05 -.42 *4 0 0 .033",
    "vC .011 .011 .04 -.05 -.005 -.17 8 *4 0 0 .03",
    "nG .03 .014 0 -.0485 .02 0 0 -1.5708",
    "rD .06 .05 .2 0 .015 .17",
    "rD .05 .04 .16 0 -.05 .16",
    "rS .065 .12 .03 0 -.01 .28",
    "rS .05 .12 .06 0 -.1 .06 .25",
    "bDf .053 .005 .055 0 -.069 .068 .25 *5 0 -.0194 -.0049",
    "bD .01 .008 .08 0 -.078 -.01",
    "bP .006 .022 .006 0 -.068 .01 .3",
    "cCm .012 .012 .06 0 -.07 -.12 8",
    /* machined detail: screws on the armor plates, a row of shell lights on the left plate, a cable
       along the magazine tube, forward chevrons cut into the shroud */
    "bAf .003 .004 .034 -.0465 .038 -.36 .65 *2 0 0 -.07",
    "bAf .003 .004 .034 -.0465 .016 -.36 -.65 *2 0 0 -.07",
    "sDf .0035 .0035 .003 -.0475 .02 -.15 6 *3 0 0 .07",
    "bEf .002 .006 .006 -.0465 -.035 -.15 *6 0 0 .012",
    "cSf .003 .003 .2 .03 -.06 -.43 6",
  ],
];
/** the parts of weapon i, repeats expanded */
function gunParts(i) {
  const out = [];
  for (const s of GUN_MODELS[i]) {
    const [h, ...t] = s.split(" "),
      r = t.findIndex(v => v[0] === "*"),
      n = (r < 0 ? t : t.slice(0, r)).map(Number),
      [c, dx, dy, dz] = r < 0 ? [1, 0, 0, 0] : [+t[r].slice(1), ...t.slice(r + 1).map(Number)],
      cyl = "cvs".includes(h[0]);
    for (let j = 0; j < c; j++)
      out.push({
        k: h[0],
        m: h[1],
        fp: h.includes("f") || h[1] === "E",
        mag: h.includes("m"),
        act: h.includes("a"),
        a: n[0],
        b: n[1],
        c: n[2],
        x: n[3] + dx * j,
        y: n[4] + dy * j,
        z: n[5] + dz * j,
        rx: cyl ? 0 : n[6] || 0,
        ry: n[7] || 0,
        sides: cyl ? n[6] || 12 : 0,
      });
  }
  return out;
}
/** a part's geometry at a level of detail: 0 first person; 1 in other pilots' hands and on the floor
    (cylinders get fewer sides, small parts lose their bevels); 2 far away (no bevels, six sides) */
function gunGeo(p, lod) {
  const { k, a, b, c } = p;
  if (k === "n") return new THREE.PlaneGeometry(a, b);
  if (k === "b" || (k === "r" && lod && (lod > 1 || a * b * c < 1e-3))) return new THREE.BoxGeometry(a, b, c);
  if (k === "r") return rbox(a, b, c, Math.min(a, b, c) * 0.25);
  const g = new THREE.CylinderGeometry(
    k === "c" ? b : a,
    k === "c" ? a : b,
    c,
    lod ? Math.min(p.sides, lod > 1 || c < 0.03 ? 6 : 8) : p.sides
  );
  return k === "c" ? g.rotateX(Math.PI / 2) : k === "s" ? g.rotateZ(Math.PI / 2) : g;
}
/** a part big enough to keep on a weapon seen from far away (lights a little smaller: they carry the read) */
const gunFar = p =>
  (p.k === "b" || p.k === "r" ? Math.max(p.a, p.b, p.c) : Math.max(2 * p.a, 2 * p.b, p.c)) >=
  (p.m === "G" ? 0.05 : 0.08);
