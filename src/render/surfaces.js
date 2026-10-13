/* ============ SURFACES: what the map's standard materials add on top of three.js lighting ============
   surfMat(material) patches a MeshStandardMaterial once (onBeforeCompile):
   - baked light (world/bake.js): the `bake` attribute's occlusion darkens ambient and reflected light,
     its color is strip light bounced onto the surface. Free, so it is on at every preset.
   Materials without the attributes (destructible cover, anything unbaked) read neutral defaults. */
const SURF_MATS = [];
/* the developer console's "bake" view */
const SURF_DEBUG = { on: false };
function surfMat(m) {
  if (m.userData.surf) return;
  m.userData.surf = true;
  SURF_MATS.push(m);
  /* a mesh without the attributes reads these (no occlusion, no bounce, no edges) */
  /** @type {any} */ (m).defaultAttributeValues = { bake: [0, 0, 0, 1], edge: [0, 0, 0, 0] };
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 bake;attribute vec4 edge;varying vec4 vBake;varying vec4 vEdge;varying vec3 vWP;varying vec3 vWN;"
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvBake=bake;vEdge=edge;vWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);"
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec4 vBake;varying vec4 vEdge;varying vec3 vWP;varying vec3 vWN;"
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
float bAO=vBake.a;
reflectedLight.indirectDiffuse*=bAO;reflectedLight.indirectSpecular*=bAO*bAO;
reflectedLight.directDiffuse*=mix(1.,bAO,.4);reflectedLight.directSpecular*=mix(1.,bAO,.4);
totalEmissiveRadiance+=vBake.rgb*diffuseColor.rgb;`
      );
    if (SURF_DEBUG.on)
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\ngl_FragColor=vec4(vec3(vBake.a)*.3+vBake.rgb*.5,1.);"
      );
  };
  /* the program changes with the debug view */
  m.customProgramCacheKey = () => (SURF_DEBUG.on ? "surf-dbg" : "surf");
  m.needsUpdate = true;
}
