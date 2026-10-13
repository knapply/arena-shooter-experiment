/* ============ PROPS: the props that make the walls look lived in ============
   Called at the end of dressMap (engine only). Everything is seeded by the map id, never collides and
   is merged per material with the rest of the map:
   - pipes along the tops of tall walls, on brackets, with the odd one dropping to the floor;
   - cable runs sagging between ribs;
   - wall fans: a housing and blades that spin in the vertex shader (one draw call for every fan);
   - beacons on the corners of tall blocks, blinking on their own phase in the shader;
   - holographic signs (an atlas of sector signs, arrows and made-up companies) with scanlines and
     flicker, each over a little projector strip.
   The Map detail setting hides the lot (prop materials are marked userData.detail and hidden on Basic). */
const PROP_T = { value: 0 };
const PROP_MATS = {
  pipe: new THREE.MeshStandardMaterial({ color: "#5b6168", roughness: 0.38, metalness: 0.8 }),
  pipe2: new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.45, metalness: 0.7 }),
  cable: new THREE.MeshStandardMaterial({ color: "#121518", roughness: 0.7, metalness: 0.1 }),
  fan: new THREE.MeshStandardMaterial({ color: "#2a3036", roughness: 0.5, metalness: 0.6 }),
  beacon: new THREE.MeshBasicMaterial({ color: "#ff3b2a" }),
  holo: new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, t: PROP_T },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float hue;varying vec2 vUv;varying float vH;varying float vY;
void main(){vUv=uv;vH=hue;vec4 w=modelMatrix*vec4(position,1.);vY=w.y;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform sampler2D map;uniform float t;varying vec2 vUv;varying float vH;varying float vY;
void main(){vec4 c=texture2D(map,vUv);
float scan=.72+.28*sin(vY*90.-t*6.);
float flick=.85+.15*step(.93,fract(sin(floor(t*14.+vH*40.)*91.7)*437.1));
float band=.8+.2*smoothstep(.0,.03,abs(fract(vY*.6-t*.25)-.5));
vec3 tint=mix(vec3(.4,.85,1.),vec3(1.,.6,.3),vH);
gl_FragColor=vec4(c.rgb*tint*3.6*scan*flick*band,c.a*.9);}`,
  }),
};
for (const k in PROP_MATS) PROP_MATS[k].userData.detail = true;
PROP_MATS.beacon.color.multiplyScalar(3);
/* fan blades spin about their own centre: center.xyz + speed in `spin`, axis in `axis` */
PROP_MATS.fan.onBeforeCompile = sh => {
  sh.uniforms.dT = PROP_T;
  sh.vertexShader = sh.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec4 spin;attribute vec3 axis;uniform float dT;\nvec3 rotA(vec3 v,vec3 k,float a){return v*cos(a)+cross(k,v)*sin(a)+k*dot(k,v)*(1.-cos(a));}"
    )
    .replace(
      "#include <beginnormal_vertex>",
      "#include <beginnormal_vertex>\nfloat sa=dT*spin.w;if(spin.w!=0.)objectNormal=rotA(objectNormal,axis,sa);"
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nif(spin.w!=0.)transformed=spin.xyz+rotA(transformed-spin.xyz,axis,sa);"
    );
};
/** @type {any} */ (PROP_MATS.fan).defaultAttributeValues = { spin: [0, 0, 0, 0], axis: [0, 1, 0] };
/* beacons blink on their own phase */
PROP_MATS.beacon.onBeforeCompile = sh => {
  sh.uniforms.dT = PROP_T;
  sh.vertexShader = sh.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute float phase;varying float vB;uniform float dT;"
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nfloat bp=fract(dT*.7+phase);vB=.08+.92*exp(-bp*9.)+.5*exp(-abs(bp-.18)*30.);"
    );
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vB;")
    .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb*=vB;");
};
/** @type {any} */ (PROP_MATS.beacon).defaultAttributeValues = { phase: [0] };
/* the sign atlas: 4 x 4 tiles */
function signAtlas() {
  const N = 1024,
    T = N / 4;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d");
  x.textAlign = "center";
  x.textBaseline = "middle";
  const tile = (i, f) => {
    x.save();
    x.translate((i % 4) * T, Math.floor(i / 4) * T);
    x.beginPath();
    x.rect(0, 0, T, T / 2);
    x.clip();
    f();
    x.restore();
  };
  const frame = () => {
    x.strokeStyle = "rgba(255,255,255,0.9)";
    x.lineWidth = 3;
    x.strokeRect(6, 6, T - 12, T / 2 - 12);
    x.fillStyle = "rgba(255,255,255,0.08)";
    x.fillRect(6, 6, T - 12, T / 2 - 12);
  };
  const text = (s, y, px, a = 1) => {
    x.fillStyle = `rgba(255,255,255,${a})`;
    x.font = `bold ${px}px Arial, sans-serif`;
    x.fillText(s, T / 2, y);
  };
  const SIGNS = [
    () => (frame(), text("SECTOR A", 46, 34), text("ARENA LEVEL 2", 88, 16, 0.7)),
    () => (frame(), text("SECTOR B", 46, 34), text("MAINTENANCE", 88, 16, 0.7)),
    () => (frame(), text("SECTOR C", 46, 34), text("CARGO TRANSFER", 88, 16, 0.7)),
    () => (frame(), text("SECTOR D", 46, 34), text("REACTOR ACCESS", 88, 16, 0.7)),
    () => {
      /* a made-up shipping company: a ring and a wordmark */
      x.strokeStyle = "#fff";
      x.lineWidth = 6;
      x.beginPath();
      x.arc(46, 64, 28, 0.4, Math.PI * 2 - 0.4);
      x.stroke();
      x.fillStyle = "#fff";
      x.font = "bold 30px Arial, sans-serif";
      x.textAlign = "left";
      x.fillText("ORBITAL", 88, 48);
      x.font = "18px Arial, sans-serif";
      x.fillText("FREIGHT CO.", 90, 82);
    },
    () => {
      x.fillStyle = "#fff";
      for (let k = 0; k < 3; k++) {
        x.beginPath();
        x.moveTo(40 + k * 18, 30);
        x.lineTo(62 + k * 18, 64);
        x.lineTo(40 + k * 18, 98);
        x.lineTo(50 + k * 18, 98);
        x.lineTo(72 + k * 18, 64);
        x.lineTo(50 + k * 18, 30);
        x.fill();
      }
      x.font = "bold 28px Arial, sans-serif";
      x.textAlign = "left";
      x.fillText("KESTREL", 120, 52);
      x.font = "16px Arial, sans-serif";
      x.fillText("DYNAMICS", 122, 84);
    },
    () => (frame(), text("◄  HANGAR 3", 64, 30)),
    () => (frame(), text("DROP ZONE  ►", 64, 30)),
    () => {
      x.fillStyle = "#fff";
      x.font = "bold 40px Arial, sans-serif";
      x.fillText("VOLTA", T / 2, 52);
      x.font = "15px Arial, sans-serif";
      x.fillText("POWER FOR THE BELT", T / 2, 92);
      x.fillRect(40, 72, T - 80, 3);
    },
    () => (frame(), text("⚠ HIGH VOLTAGE", 54, 26), text("AUTHORIZED CREW ONLY", 90, 14, 0.7)),
    () => (frame(), text("NO GRAV ZONE", 54, 28), text("TETHER REQUIRED", 90, 14, 0.7)),
    () => {
      /* a planet, the ad's whole pitch */
      x.strokeStyle = "#fff";
      x.lineWidth = 3;
      x.beginPath();
      x.arc(70, 64, 34, 0, Math.PI * 2);
      x.stroke();
      x.beginPath();
      x.ellipse(70, 64, 56, 12, -0.3, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = "#fff";
      x.font = "bold 22px Arial, sans-serif";
      x.textAlign = "left";
      x.fillText("VISIT", 140, 46);
      x.fillText("THE RINGS", 140, 76);
      x.font = "13px Arial, sans-serif";
      x.fillText("2 DAYS BY SHUTTLE", 140, 102);
    },
  ];
  SIGNS.forEach((f, i) => tile(i, f));
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
/** a geometry with extra per-vertex attributes filled with one value */
function withAttr(g, name, val) {
  const n = g.attributes.position.count,
    a = new Float32Array(n * val.length);
  for (let i = 0; i < n; i++) a.set(val, i * val.length);
  g.setAttribute(name, new THREE.BufferAttribute(a, val.length));
  return g;
}
function dressProps(doc, solids, rnd01, zoneMat, faceList) {
  if (!PROP_MATS.holo.uniforms.map.value) PROP_MATS.holo.uniforms.map.value = signAtlas();
  const put = (mat, g) => {
    const m = new THREE.Mesh(g, mat);
    m.userData.noBake = true;
    MAPG.add(m);
  };
  const cyl = (r, ax, ay, az, bx, by, bz, mat) => {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const g = new THREE.CylinderGeometry(r, r, len, 6, 1, true);
    g.deleteAttribute("uv");
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(bx - ax, by - ay, bz - az).normalize()
    );
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2),
        q,
        new THREE.Vector3(1, 1, 1)
      )
    );
    put(mat, g);
  };
  /* boxes are placed by position, the way the bake (world/bake.js) expects them */
  const boxAt = (mat, x, y, z, w, h, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    MAPG.add(m);
  };
  let fans = 0,
    signs = 0;
  for (const f of faceList) {
    const { b, ax, az, nx, nz, len, h } = f;
    const ux = nx ? 0 : Math.sign(f.bx - ax),
      uz = nx ? Math.sign(f.bz - az) : 0;
    const at = (s, out) => [ax + ux * s + nx * out, az + uz * s + nz * out];
    /* pipes along the top of tall faces */
    if (h >= 2.8 && len >= 4 && rnd01() < 0.7) {
      const n = 1 + Math.floor(rnd01() * 3);
      const y = b.y1 - 0.42 - rnd01() * 0.3;
      const mat = rnd01() < 0.3 ? PROP_MATS.pipe2 : PROP_MATS.pipe;
      for (let k = 0; k < n; k++) {
        const r = 0.05 + rnd01() * 0.06,
          off = 0.2 + k * 0.17,
          yy = y - k * 0.04;
        const [px, pz] = at(0.3, off),
          [qx, qz] = at(len - 0.3, off);
        cyl(r, px, yy, pz, qx, yy, qz, mat);
      }
      for (let s = 1; s < len - 0.5; s += 2.6) {
        const [px, pz] = at(s, 0.2 + (n * 0.17) / 2);
        boxAt(
          DRESS_MATS.trim,
          px,
          y - 0.12,
          pz,
          nx ? n * 0.17 + 0.1 : 0.08,
          0.06,
          nx ? 0.08 : n * 0.17 + 0.1
        );
      }
      /* one drops to the floor at the face's end */
      if (rnd01() < 0.4) {
        const [px, pz] = at(len - 0.3, 0.2);
        cyl(0.07, px, y, pz, px, b.y0, pz, mat);
      }
    }
    /* cables sagging between ribs */
    if (h >= 2.6 && len >= 5 && rnd01() < 0.6) {
      const n = 1 + Math.floor(rnd01() * Math.min(4, len / 8));
      for (let k = 0; k < n; k++) {
        const s0 = rnd01() * (len - 4),
          s1 = s0 + 2.5 + rnd01() * 1.5,
          y = Math.min(b.y1 - 0.5, b.y0 + 2.4 + rnd01() * 1.2),
          sag = 0.25 + rnd01() * 0.35;
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6,
            [px, pz] = at(s0 + (s1 - s0) * t, 0.06 + k * 0.05);
          pts.push(new THREE.Vector3(px, y - sag * 4 * t * (1 - t), pz));
        }
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.025, 3, false);
        g.deleteAttribute("uv");
        put(PROP_MATS.cable, g);
      }
    }
    /* a wall fan in a housing */
    for (let seg = 0; seg < len - 3; seg += 9) {
      if (h < 3 || fans >= 24 || rnd01() > 0.35) continue;
      fans++;
      const s = seg + 1.5 + rnd01() * Math.min(6, len - seg - 3),
        y = b.y0 + Math.min(h - 0.75, 2.5);
      const [cx, cz] = at(s, 0.08);
      const R = 0.5;
      const hous = nx ? [0.12, 0.1, R * 2 + 0.1] : [R * 2 + 0.1, 0.1, 0.12];
      boxAt(DRESS_MATS.trim, cx, y + R + 0.05, cz, hous[0], hous[1], hous[2]);
      boxAt(DRESS_MATS.trim, cx, y - R - 0.05, cz, hous[0], hous[1], hous[2]);
      boxAt(
        DRESS_MATS.trim,
        cx + (nx ? 0 : R + 0.05),
        y,
        cz + (nx ? R + 0.05 : 0),
        nx ? 0.12 : 0.1,
        R * 2 + 0.2,
        nx ? 0.1 : 0.12
      );
      boxAt(
        DRESS_MATS.trim,
        cx - (nx ? 0 : R + 0.05),
        y,
        cz - (nx ? R + 0.05 : 0),
        nx ? 0.12 : 0.1,
        R * 2 + 0.2,
        nx ? 0.1 : 0.12
      );
      boxAt(DRESS_MATS.vent, cx - nx * 0.04, y, cz - nz * 0.04, nx ? 0.04 : R * 2, R * 2, nx ? R * 2 : 0.04);
      const speed = (rnd01() < 0.5 ? -1 : 1) * (4 + rnd01() * 5);
      for (let k = 0; k < 5; k++) {
        const g = new THREE.BoxGeometry(0.06, R * 1.8, 0.012);
        g.deleteAttribute("uv");
        /* each blade a little twisted, around the fan's axis */
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(0.5));
        g.translate(0, R * 0.45, 0);
        g.applyMatrix4(new THREE.Matrix4().makeRotationZ((k / 5) * Math.PI * 2));
        /* local z is the axis: turn it to face out of the wall */
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(nx, nz)));
        g.translate(cx, y, cz);
        withAttr(g, "spin", [cx, y, cz, speed]);
        withAttr(g, "axis", [nx, 0, nz]);
        put(PROP_MATS.fan, g);
      }
    }
    /* holographic signs over a projector strip, high on long faces */
    for (let seg = 0; seg < len - 4; seg += 14) {
      if (h < 3.4 || signs >= 14 || rnd01() > 0.3) continue;
      signs++;
      const tileI = Math.floor(rnd01() * 12);
      const s = seg + 2 + rnd01() * Math.min(10, len - seg - 4),
        y = Math.min(b.y0 + 3.4, b.y1 - 0.9);
      const [cx, cz] = at(s, 0.18);
      const g = new THREE.PlaneGeometry(3.2, 1.6);
      const u0 = (tileI % 4) / 4,
        v1 = 1 - Math.floor(tileI / 4) / 4,
        uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v1 - (1 - uv.getY(i)) / 8);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(nx, nz)));
      g.translate(cx, y, cz);
      withAttr(g, "hue", [rnd01() < 0.35 ? 1 : 0]);
      put(PROP_MATS.holo, g);
      const [px, pz] = at(s, 0.06);
      boxAt(MATS[zoneMat(doc, cx, cz)], px, y - 0.78, pz, nx ? 0.08 : 2.2, 0.04, nx ? 2.2 : 0.08);
    }
  }
  /* beacons on the corners of tall blocks */
  for (const b of solids) {
    if (b.mat === "floor" || b.y1 - b.y0 < 4.5 || isDestructible(b)) continue;
    for (const [x, z] of [
      [b.x0, b.z0],
      [b.x1, b.z1],
    ]) {
      if (rnd01() > 0.5) continue;
      const g = new THREE.BoxGeometry(0.14, 0.12, 0.14);
      g.deleteAttribute("uv");
      g.translate(x, b.y1 + 0.06, z);
      withAttr(g, "phase", [rnd01()]);
      put(PROP_MATS.beacon, g);
    }
  }
}
