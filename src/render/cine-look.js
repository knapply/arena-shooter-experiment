/* ============ CINE LOOK: the trailer's cinematic post (trailer build only, manifest trailer.engine) ============
   CINE.look({ dof, focus, range, near, grade, ca, streak }) switches the composite pass to a cinematic
   look: depth of field from the depth buffer, a split-tone grade, lens fringing and anamorphic streaks.
   Only the trailer uses it, so the game ships without these shaders: this module splices them into the
   composite shader at its /*@cine...*\/ markers and hands renderFrame a pass to run while a look is on. */
/* depth of field: each pixel's color weighted by how out of focus it is (alpha = weight), so sharp
   foreground subjects don't bleed into the blurred background */
const DOF_COC =
  "uniform sampler2D tD;uniform vec4 dof;uniform vec2 clip;float lz(vec2 uv){float d=texture2D(tD,uv).x;return clip.x*clip.y/(clip.y-d*(clip.y-clip.x));}float coc(vec2 uv){float z=lz(uv);float k=clamp(abs(z-dof.y)/dof.z,0.,1.);if(z<dof.y)k=min(1.,k*(1.+dof.w));return smoothstep(0.,1.,k);}";
const cocMat = new THREE.ShaderMaterial({
  uniforms: {
    t: { value: null },
    tD: { value: null },
    dof: { value: new THREE.Vector4() },
    clip: { value: new THREE.Vector2(0.1, 500) },
  },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader:
    "uniform sampler2D t;varying vec2 vUv;" +
    DOF_COC +
    "void main(){float k=coc(vUv);gl_FragColor=vec4(texture2D(t,vUv).rgb*k,k);}",
});
const blur4Mat = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: FSV,
  depthTest: false,
  depthWrite: false,
  fragmentShader:
    "uniform sampler2D t;uniform vec2 dir;varying vec2 vUv;void main(){vec4 c=texture2D(t,vUv)*.227027;c+=texture2D(t,vUv+dir*1.3846)*.316216;c+=texture2D(t,vUv-dir*1.3846)*.316216;c+=texture2D(t,vUv+dir*3.2308)*.07027;c+=texture2D(t,vUv-dir*3.2308)*.07027;gl_FragColor=c;}",
});
Object.assign(compMat.uniforms, {
  tD: { value: null },
  tF: { value: null },
  dof: { value: new THREE.Vector4(0, 10, 6, 0) },
  clip: { value: new THREE.Vector2(0.1, 500) },
  grade: { value: 0 },
  ca: { value: 0 },
  streak: { value: 0 },
});
compMat.fragmentShader = compMat.fragmentShader
  .replace(
    "/*@cine-head*/",
    "uniform sampler2D tF;uniform float grade;uniform float ca;uniform float streak;" + DOF_COC
  )
  .replace(
    "/*@cine-color*/",
    /* lens fringing: red and blue sampled apart toward the frame edges */
    "if(ca>0.){vec2 o2=q*dot(q,q)*ca;c.r=S(uv+o2).r;c.b=S(uv-o2).b;}" +
      /* depth of field: blend toward a blurred copy by circle of confusion (dof = amount, focus m, range m, near blur) */
      "if(dof.x>0.){vec4 F=texture2D(tF,uv);float k=coc(uv)*dof.x*smoothstep(0.,.25,F.a);c=mix(c,aces(F.rgb/max(F.a,.001)*expo),k);}" +
      /* anamorphic streaks: bloom smeared sideways, tinted cool */
      "if(streak>0.){vec3 s2=vec3(0.);for(int i=1;i<7;i++){float f=float(i)*.022;s2+=(texture2D(tB,uv+vec2(f,0.)).rgb+texture2D(tB,uv-vec2(f,0.)).rgb)*(1.-float(i)/7.);}c+=aces(s2*expo*.18)*vec3(.55,.8,1.)*streak;}"
  )
  /* split-tone grade: cool shadows, warm highlights, a gentle S-curve */
  .replace(
    "/*@cine-grade*/",
    "if(grade>0.){float L=luma(o);o+=grade*((1.-L)*(1.-L)*vec3(-.035,.012,.05)+L*L*vec3(.05,.012,-.045));o=mix(o,o*o*(3.-2.*o),grade*.35);}"
  );
compMat.needsUpdate = true;
/** run by renderFrame while a look is on: the depth of field's blurred copy, and the look's uniforms */
GFX.lookPass = (U, L) => {
  const dofOn = L.dof > 0 && !!GFX.b3 && !!GFX.rt.depthTexture;
  if (dofOn) {
    /* a half-resolution blurred copy of the out-of-focus parts of the scene */
    const C = cocMat.uniforms;
    C.t.value = GFX.rt.texture;
    C.tD.value = GFX.rt.depthTexture;
    C.dof.value.set(1, L.focus || 10, L.range || 6, L.near == null ? 1 : L.near);
    C.clip.value.set(camera.near, camera.far);
    fsPass(cocMat, GFX.b3);
    for (let i = 0; i < 2; i++) {
      blur4Mat.uniforms.t.value = GFX.b3.texture;
      blur4Mat.uniforms.dir.value.set((1.6 + i) / GFX.b3.width, 0);
      fsPass(blur4Mat, GFX.b4);
      blur4Mat.uniforms.t.value = GFX.b4.texture;
      blur4Mat.uniforms.dir.value.set(0, (1.6 + i) / GFX.b3.height);
      fsPass(blur4Mat, GFX.b3);
    }
    U.tD.value = GFX.rt.depthTexture;
    U.tF.value = GFX.b3.texture;
  }
  U.dof.value.set(dofOn ? L.dof : 0, L.focus || 10, L.range || 6, L.near == null ? 1 : L.near);
  U.clip.value.set(camera.near, camera.far);
  U.grade.value = L.grade || 0;
  U.ca.value = L.ca || 0;
  U.streak.value = SET.bloom > 0 ? L.streak || 0 : 0;
};
