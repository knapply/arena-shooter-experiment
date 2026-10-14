/* ============ PER-FRAME HOOKS ============
   Features that only need the frame time (HUD widgets, ambient effects, overlays) register here
   instead of being wired into the main loop by hand:

     onFrame(updMyWidget);                          every frame while you play
     onFrame(updMyEffect, { menu: true });          ...and behind the menu
     onFrame(updMyEffect, { full: true });          ...and in full-screen modes (trailer, spectating)

   game/loop.js runs each list at the right point of the frame (after the world and camera have
   moved, before the HUD and the render), in registration order, which is manifest order. */
export const FRAME_HOOKS = { play: [], menu: [], full: [] };
/** @param {(dt: number) => void} fn  @param {{ menu?: boolean, full?: boolean }} [o] */
export function onFrame(fn, o = {}) {
  FRAME_HOOKS.play.push(fn);
  if (o.menu) FRAME_HOOKS.menu.push(fn);
  if (o.full) FRAME_HOOKS.full.push(fn);
}
export function runFrameHooks(list, dt) {
  for (const fn of list) fn(dt);
}
