/* 3D water-reminder avatar built from three.js primitives (needs THREE global).
 * Also loads a user-supplied .glb model (see mountAvatar below). */
(function () {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const TAU = Math.PI * 2;

  /** Small canvas texture: a base colour with fine knit/grain noise, so fabric doesn't look like plastic. */
  function fabricTexture(base, light, dark, ribbed) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    if (ribbed) {
      for (let x = 0; x < 128; x += 4) {
        g.globalAlpha = 0.18;
        g.fillStyle = dark;
        g.fillRect(x, 0, 1.5, 128);
      }
    }
    for (let i = 0; i < 1400; i++) {
      g.globalAlpha = Math.random() * 0.14;
      g.fillStyle = Math.random() < 0.5 ? light : dark;
      g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * The two built-in characters. Same skeleton (so every animation works for both),
   * different hair, face details, outfit and colours.
   *   male:   "Aqua Runner": curly hair, orange sweatband, round glasses, teal zip hoodie, navy joggers, orange sneakers
   *   female: "Lily":        glam face: slim oval, cat-eye almond eyes with winged liner, arched brows, full rose-red
   *                          lips, a beauty mark; long side-swept waves (dark chocolate with caramel highlights) over
   *                          one shoulder; black top tucked into white high-waist trousers, white loafers, white handbag
   */
  const LOOKS = {
    male: {
      skin: 0xd99a6c, skinSheen: 0xffc29a, hair: 0x1f1612, hairHi: 0x4a3326, iris: 0x4a2c17, lips: 0x7a2a22,
      top: ['#0b6e66', '#1fa598', '#064a44'], topDark: 0x075650, pants: ['#1e2a44', '#3b4b70', '#121a2c'], pantsDark: 0x162036,
      shoe: 0xff7a1a, sole: 0xffffff, accent: 0xffffff, cap: 0x14b8a6, label: 0xff7a1a,
      shoulderX: 0.265, armR: 0.064, legR: 0.088, torsoW: 1.18, longSleeves: true,
    },
    female: {
      skin: 0xf1c8ae, skinSheen: 0xffd9c8, hair: 0x3a2318, hairHi: 0x6b4630, iris: 0x2a160e, lips: 0xbf3a4b,
      top: ['#1d1d21', '#2e2e34', '#111114'], topDark: 0x141417, pants: ['#efede8', '#ffffff', '#d6d2ca'], pantsDark: 0xe0ddd6,
      shoe: 0xf2f0eb, sole: 0xd2cdc4, accent: 0xe8c066, cap: 0xf472b6, label: 0x1d1d21,
      shoulderX: 0.225, armR: 0.05, legR: 0.088, torsoW: 0.88, longSleeves: true, plainSleeves: true, headScale: 1.22,
    },
  };

  function buildMaterials(L) {
    const std = (o) => new THREE.MeshStandardMaterial(o);
    return {
      skin: new THREE.MeshPhysicalMaterial({
        color: L.skin, roughness: 0.5, sheen: 0.6, sheenColor: L.skinSheen, sheenRoughness: 0.5,
        emissive: 0x3a1408, emissiveIntensity: 0.16,
      }),
      hair: new THREE.MeshPhysicalMaterial({ color: L.hair, roughness: 0.5, sheen: 0.2, sheenColor: 0x8a6656, side: THREE.DoubleSide }),
      hairHi: std({ color: L.hairHi, roughness: 0.42 }),
      top: std({ map: fabricTexture(...L.top, false), roughness: 0.85, side: THREE.DoubleSide }),
      topDark: std({ map: fabricTexture(...L.top, true), color: L.topDark, roughness: 0.85 }),
      skirt: std({ map: fabricTexture(...L.top, true), roughness: 0.85, side: THREE.DoubleSide }),
      pants: std({ map: fabricTexture(...L.pants, false), roughness: 0.9, side: THREE.DoubleSide }),
      pantsDark: std({ color: L.pantsDark, roughness: 0.9 }),
      shoe: std({ color: L.shoe, roughness: 0.45 }),
      sole: std({ color: L.sole, roughness: 0.6 }),
      accent: std({ color: L.accent, roughness: 0.5, side: THREE.DoubleSide }),
      band: std({ color: 0xff7a1a, roughness: 0.8 }),
      frame: std({ color: 0x1b1b1f, roughness: 0.3, metalness: 0.4 }),
      eyeWhite: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1 }),
      iris: new THREE.MeshPhysicalMaterial({ color: L.iris, roughness: 0.2, clearcoat: 1 }),
      pupil: std({ color: 0x0c0705, roughness: 0.1 }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      mouth: std({ color: L.lips, roughness: 0.55, side: THREE.DoubleSide }),
      teeth: std({ color: 0xffffff, roughness: 0.3 }),
      tongue: std({ color: 0xd85f55, roughness: 0.6 }),
      blush: std({ color: 0xff7a70, roughness: 1, transparent: true, opacity: 0.26, depthWrite: false }),
      lid: new THREE.MeshPhysicalMaterial({ color: 0xe0ad92, roughness: 0.55 }),
      lash: std({ color: 0x1e1210, roughness: 0.6 }),
      brow: std({ color: 0x3e2619, roughness: 0.8 }),
      lipLine: std({ color: 0x7e2430, roughness: 0.6 }),
      bag: new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.45, clearcoat: 0.4 }),
      lip: new THREE.MeshPhysicalMaterial({ color: L.lips, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
      irisLight: new THREE.MeshPhysicalMaterial({ color: 0x3e2618, roughness: 0.15, clearcoat: 1 }),
      cheek: std({ color: 0xff9a9a, roughness: 1, transparent: true, opacity: 0.3, depthWrite: false }),
      gold: std({ color: 0xe8c066, roughness: 0.25, metalness: 0.9 }),
      bottle: new THREE.MeshPhysicalMaterial({
        color: 0xbfe6ff, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, depthWrite: false,
      }),
      water: new THREE.MeshPhysicalMaterial({
        color: 0x1e90ff, emissive: 0x0a4a9a, emissiveIntensity: 0.4, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85, depthWrite: false,
      }),
      cap: std({ color: L.cap, roughness: 0.35 }),
      label: std({ color: L.label, roughness: 0.6, side: THREE.DoubleSide }),
      drop: std({ color: 0xffffff, roughness: 0.4 }),
    };
  }

  function mesh(geo, mat, pos, scale, rot) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    return m;
  }
  const ball = (r, mat, pos, scale, rot) => mesh(new THREE.SphereGeometry(r, 32, 24), mat, pos, scale, rot);

  /** Capsule stretched between two points. */
  function limb(a, b, r, mat) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = mesh(new THREE.CapsuleGeometry(r, dir.length(), 8, 20), mat, a.clone().addScaledVector(dir, 0.5));
    m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
    return m;
  }
  const lerp = (a, b, t) => a.clone().lerp(b, t);

  /** Water-drop emblem (both characters wear it on the chest). */
  function dropBadge(mat, pos, size) {
    const g = new THREE.Group();
    g.add(ball(0.03, mat, V(0, 0, 0), [1, 1, 0.35]));
    g.add(mesh(new THREE.ConeGeometry(0.026, 0.045, 24), mat, V(0, 0.034, 0), [1, 1, 0.35]));
    g.position.copy(pos);
    g.scale.setScalar(size);
    return g;
  }

  function maleHair(head, M) {
    // short faded sides and back
    head.add(mesh(new THREE.SphereGeometry(0.222, 48, 24, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.1, Math.PI * 0.42), M.hair, V(0, 0.005, -0.006), [1, 1.12, 1.02]));
    // a dome of tight curls on top
    for (let ring = 0; ring < 3; ring++) {
      const n = [11, 8, 4][ring], y = [0.19, 0.235, 0.262][ring], r = [0.165, 0.12, 0.06][ring];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * 0.4;
        const mat = (i + ring) % 3 ? M.hair : M.hairHi;
        head.add(ball(0.058 - ring * 0.006, mat, V(Math.sin(a) * r, y, Math.cos(a) * r * 0.95 + 0.01)));
      }
    }
    head.add(ball(0.05, M.hair, V(0, 0.28, 0.01)));
    // orange sweatband across the forehead
    head.add(mesh(new THREE.TorusGeometry(0.17, 0.022, 12, 48), M.band, V(0, 0.15, 0.003), [1, 1, 1.02], [Math.PI / 2, 0, 0]));
    head.add(dropBadge(M.drop, V(0, 0.15, 0.188), 0.55));
    // round glasses
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 10, 36), M.frame, V(s * 0.072, 0.032, 0.226)));
      head.add(limb(V(s * 0.122, 0.036, 0.215), V(s * 0.198, 0.045, 0.06), 0.006, M.frame));
    }
    head.add(limb(V(-0.024, 0.04, 0.228), V(0.024, 0.04, 0.228), 0.006, M.frame));
  }

  /** One wavy lock of hair: smooth tapering segments along a gently waving path, with a sheen strip and a curl at the end. */
  function lock(group, M, from, to, r0, r1, waveX, waves, phase) {
    const n = 8, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = lerp(from, to, t);
      p.x += Math.sin(t * Math.PI * waves + phase) * waveX * t;
      pts.push(p);
    }
    for (let i = 0; i < n; i++) {
      const t = i / n;
      group.add(limb(pts[i], pts[i + 1], r0 + (r1 - r0) * t, M.hair));
    }
    // a soft highlight running down the front of the lock
    for (let i = 1; i < n - 2; i++) group.add(limb(pts[i].clone().add(V(0, 0, r0 * 0.75)), pts[i + 1].clone().add(V(0, 0, r0 * 0.7)), r0 * 0.18, M.hairHi));
    const end = pts[n];
    group.add(mesh(new THREE.TorusGeometry(r1 * 1.2, r1 * 0.6, 8, 20, Math.PI * 1.2), M.hair, end.clone().add(V(0, -r1, 0)), null, [0, Math.PI / 2, phase]));
  }

  /** Female hair: long glam waves, deep side part, swept over one shoulder and tucked behind the other ear. Returns the long part, which sways. */
  function femaleHair(head, M) {
    // crown and back of the head
    head.add(mesh(new THREE.SphereGeometry(0.222, 48, 24, 0, TAU, 0, Math.PI * 0.4), M.hair, V(0, 0.012, -0.006), [0.98, 1.1, 1.02]));
    head.add(mesh(new THREE.SphereGeometry(0.228, 48, 24, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.7), M.hair, V(0, 0, -0.01), [1.02, 1.1, 1.05]));
    // deep side part on her right; one big swoop across the forehead to her left side
    head.add(ball(1, M.hair, V(0.035, 0.185, 0.11), [0.17, 0.045, 0.07], [-0.65, 0, -0.25]));
    head.add(ball(1, M.hairHi, V(0.06, 0.2, 0.1), [0.1, 0.015, 0.05], [-0.65, 0, -0.25]));
    head.add(ball(1, M.hair, V(0.165, 0.09, 0.1), [0.06, 0.12, 0.07], [-0.2, 0, -0.15]));
    // her right side: sleek, tucked behind the ear (the ear and earring show)
    head.add(limb(V(-0.12, 0.17, 0.08), V(-0.2, 0.06, -0.04), 0.03, M.hair));
    head.add(ball(0.013, M.gold, V(-0.205, -0.06, 0.0))); // gold stud
    head.add(ball(0.013, M.bag, V(0.205, -0.06, 0.0)));

    // the long part: most of the volume falls over her left shoulder in big waves
    const tail = new THREE.Group();
    tail.position.set(0, 0.1, 0);
    tail.userData.amp = 0.22;
    const T = (x, y, z) => V(x, y - 0.1, z);
    lock(tail, M, T(0.19, 0.02, 0.07), T(0.24, -0.55, 0.09), 0.058, 0.035, 0.05, 3, 0);
    lock(tail, M, T(0.21, 0.04, 0.0), T(0.28, -0.58, 0.04), 0.062, 0.036, 0.055, 3, 1.1);
    lock(tail, M, T(0.17, 0.02, -0.09), T(0.25, -0.55, -0.05), 0.06, 0.034, 0.05, 2.6, 2.1);
    lock(tail, M, T(0.05, 0.02, -0.17), T(0.1, -0.5, -0.16), 0.075, 0.04, 0.04, 2.4, 0.5);
    lock(tail, M, T(-0.1, 0.02, -0.15), T(-0.12, -0.4, -0.15), 0.065, 0.035, -0.035, 2.2, 1.6);
    lock(tail, M, T(-0.19, 0.02, -0.06), T(-0.2, -0.32, -0.09), 0.05, 0.03, -0.03, 2, 0.9);
    tail.add(ball(1, M.hair, T(0.02, -0.2, -0.13), [0.24, 0.24, 0.09]));
    head.add(tail);
    return tail;
  }

  /** His face: open smile, classic eyes (behind his glasses). */
  function classicFace(head, M) {
    // mouths: smile (happy), frown (sad), "oh" (startled); only one is visible at a time
    const smile = new THREE.Group();
    smile.add(mesh(new THREE.CircleGeometry(0.06, 32, Math.PI, Math.PI), M.mouth, V(0, -0.09, 0.209), [1, 0.8, 1]));
    smile.add(mesh(new THREE.BoxGeometry(0.1, 0.016, 0.004), M.teeth, V(0, -0.095, 0.211)));
    smile.add(mesh(new THREE.CircleGeometry(0.022, 24), M.tongue, V(0, -0.12, 0.21), [1, 0.45, 1]));
    head.add(smile);
    const frown = mesh(new THREE.TorusGeometry(0.042, 0.011, 8, 24, Math.PI), M.mouth, V(0, -0.118, 0.198));
    head.add(frown);
    const oh = ball(0.028, M.mouth, V(0, -0.1, 0.198), [0.85, 1.15, 0.4]);
    head.add(oh);

    // nose, cheeks
    head.add(ball(0.03, M.skin, V(0, -0.025, 0.205), [0.9, 1.0, 1]));
    for (const s of [-1, 1]) head.add(ball(0.034, M.blush, V(s * 0.115, -0.055, 0.165)));

    // eyebrows: normal, and slanted up in the middle for the sad face (above the glasses)
    const brows = new THREE.Group(), sadBrows = new THREE.Group();
    for (const s of [-1, 1]) {
      brows.add(limb(V(s * 0.115, 0.094, 0.18), V(s * 0.035, 0.108, 0.205), 0.014, M.hair));
      sadBrows.add(limb(V(s * 0.115, 0.082, 0.18), V(s * 0.035, 0.122, 0.205), 0.014, M.hair));
    }
    head.add(brows, sadBrows);

    // eyes (group is scaled on Y to blink)
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.03, 0);
    const er = 0.04;
    for (const s of [-1, 1]) {
      eyes.add(ball(er, M.eyeWhite, V(s * 0.072, 0, 0.165)));
      eyes.add(ball(er * 0.6, M.iris, V(s * 0.07, -0.003, 0.165 + er * 0.8), [1, 1, 0.5]));
      eyes.add(ball(er * 0.3, M.pupil, V(s * 0.07, -0.003, 0.165 + er * 1.03), [1, 1, 0.4]));
      eyes.add(ball(er * 0.15, M.spark, V(s * 0.07 + er * 0.22, er * 0.25, 0.167 + er * 1.12)));
    }
    head.add(eyes);
    return { smile, frown, oh, brows, sadBrows, eyes };
  }

  /**
   * Her face, glam: slim oval, cat-eye almond eyes with winged liner and long lashes, defined arched brows,
   * a small refined nose, full glossy lips with a soft smile, cheekbone blush and a beauty mark.
   */
  function pixarFace(head, M) {
    // front of the (scaled) head ellipsoid at (x, y), so features sit right on the skin
    const surface = (x, y) => 0.2037 * Math.sqrt(Math.max(0, 1 - (x / 0.1974) ** 2 - (y / 0.2268) ** 2));

    // full lips: a cupid's bow and a fuller lower lip; the corners lift for the smile, drop when sad
    const lips = (corner) => {
      const g = new THREE.Group();
      const z = surface(0, -0.105) + 0.006;
      for (const s of [-1, 1]) g.add(ball(1, M.lip, V(s * 0.014, -0.097, z), [0.021, 0.009, 0.011], [0, 0, s * -0.2]));
      g.add(ball(1, M.lip, V(0, -0.112, z - 0.001), [0.027, 0.013, 0.012]));
      g.add(limb(V(-0.027, -0.104, z + 0.005), V(0.027, -0.104, z + 0.005), 0.0022, M.lipLine));
      for (const s of [-1, 1]) g.add(limb(V(s * 0.027, -0.104, z + 0.004), V(s * 0.035, -0.104 + corner, z - 0.001), 0.002, M.lipLine));
      return g;
    };
    const smile = lips(0.006);
    head.add(smile);
    const frown = lips(-0.007);
    head.add(frown);
    const oh = new THREE.Group();
    oh.add(mesh(new THREE.TorusGeometry(0.016, 0.0075, 10, 24), M.lip, V(0, -0.105, surface(0, -0.105) + 0.007), [1, 1.2, 0.8]));
    oh.add(ball(0.013, M.pupil, V(0, -0.105, surface(0, -0.105) + 0.001), [1, 1.2, 0.4]));
    head.add(oh);

    // refined nose, blush high on the cheekbones, a beauty mark
    head.add(ball(0.013, M.skin, V(0, -0.052, surface(0, -0.052) + 0.004), [1.15, 0.85, 1]));
    for (const s of [-1, 1]) head.add(ball(1, M.cheek, V(s * 0.112, -0.035, surface(0.112, -0.035) - 0.004), [0.045, 0.022, 0.012], [0, s * 0.55, s * 0.3]));
    head.add(ball(0.0038, M.lash, V(0.048, -0.082, surface(0.048, -0.082) + 0.001)));

    // thin arched brows
    const brows = new THREE.Group(), sadBrows = new THREE.Group();
    for (const s of [-1, 1]) {
      const p = (x, y) => V(s * x, y, surface(x, y) + 0.004);
      brows.add(limb(p(0.03, 0.088), p(0.084, 0.11), 0.0055, M.brow), limb(p(0.084, 0.11), p(0.12, 0.094), 0.0038, M.brow));
      sadBrows.add(limb(p(0.03, 0.1), p(0.084, 0.104), 0.0055, M.brow), limb(p(0.084, 0.104), p(0.12, 0.086), 0.0038, M.brow));
    }
    head.add(brows, sadBrows);

    // eyes (group is scaled on Y to blink)
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.025, 0);
    const er = 0.047, ex = 0.076;
    for (const s of [-1, 1]) {
      const cx = s * ex, cz = surface(ex, 0.025) - er * 0.3, front = cz + er * 0.6;
      eyes.add(ball(er, M.eyeWhite, V(cx, 0, cz), [1, 0.74, 0.6], [0, 0, s * 0.14]));
      eyes.add(ball(er * 0.72, M.iris, V(cx, -0.002, front - 0.008), [1, 1.04, 0.3]));
      eyes.add(ball(er * 0.42, M.irisLight, V(cx, -er * 0.22, front - 0.004), [1, 0.85, 0.25]));
      eyes.add(ball(er * 0.34, M.pupil, V(cx, -0.002, front + 0.0005), [1, 1.04, 0.25]));
      eyes.add(ball(er * 0.15, M.spark, V(cx - er * 0.22, er * 0.22, front + 0.008), [1, 1.15, 0.3]));
      eyes.add(ball(er * 0.07, M.spark, V(cx + er * 0.26, -er * 0.3, front + 0.007), [1, 1, 0.3]));
      // bold upper lash line with flicks at the outer corner, fine lower lash line, lid crease
      eyes.add(mesh(new THREE.TorusGeometry(er * 0.93, 0.0068, 8, 32, Math.PI), M.lash, V(cx, 0.001, cz + er * 0.3), [1, 0.78, 1], [-0.25, 0, s * 0.14]));
      // winged liner flicking up from the outer corner
      const wing = V(cx + s * er * 0.9, er * 0.12 * s * s + s * 0.003, cz + er * 0.3);
      eyes.add(limb(wing, wing.clone().add(V(s * 0.024, 0.014, -0.006)), 0.0042, M.lash));
      for (const a of [0.25, 0.5]) {
        const base = V(cx + s * er * 0.93 * Math.cos(a), er * 0.98 * Math.sin(a), cz + er * 0.3);
        eyes.add(limb(base, base.clone().add(V(s * 0.012, 0.008, -0.003)), 0.0024, M.lash));
      }
      eyes.add(mesh(new THREE.TorusGeometry(er * 1.05, 0.0022, 6, 28, Math.PI * 0.8), M.lid, V(cx, 0.012, cz + er * 0.2), [1, 1, 1], [-0.3, 0, Math.PI * 0.1]));
    }
    head.add(eyes);
    return { smile, frown, oh, brows, sadBrows, eyes };
  }

  function buildHead(M, look) {
    const head = new THREE.Group();
    const female = look === 'female';
    head.add(ball(0.21, M.skin, V(0, 0, 0), female ? [0.94, 1.08, 0.97] : [1, 1.12, 1]));

    // ears
    for (const s of [-1, 1]) head.add(ball(0.05, M.skin, V(s * 0.205, -0.005, -0.01), [0.45, 0.8, 0.6]));

    const tail = female ? femaleHair(head, M) : maleHair(head, M);

    const { smile, frown, oh, brows, sadBrows, eyes } = female ? pixarFace(head, M) : classicFace(head, M);

    let mood = '';
    const setMood = m => {
      if (m === mood) return;
      mood = m;
      smile.visible = m === 'happy';
      frown.visible = m === 'sad';
      oh.visible = m === 'oh';
      brows.visible = m !== 'sad';
      sadBrows.visible = m === 'sad';
    };
    setMood('happy');
    return { head, eyes, setMood, tail };
  }

  function buildBottle(M) {
    const g = new THREE.Group();
    const profile = [[0, -0.17], [0.04, -0.17], [0.047, -0.158], [0.047, 0.07], [0.04, 0.11], [0.021, 0.14], [0.021, 0.16], [0, 0.16]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const water = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.25, 32), M.water, V(0, -0.042, 0));
    water.renderOrder = 1;
    g.add(water);
    g.add(mesh(new THREE.CylinderGeometry(0.049, 0.049, 0.045, 32, 1, true), M.label, V(0, -0.045, 0)));
    const shell = mesh(new THREE.LatheGeometry(profile, 40), M.bottle);
    shell.renderOrder = 2;
    g.add(shell);
    const cap = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 24), M.cap, V(0, 0.178, 0));
    g.add(cap);
    g.userData = { water, cap };
    return g;
  }

  /** One arm, pivoting at the shoulder. Long sleeves (him) or short sleeves with bare arms (her). */
  function arm(M, L, sh, el, wr) {
    const g = new THREE.Group();
    const r = L.armR;
    if (L.longSleeves) {
      g.add(limb(sh, el, r, M.top));
      g.add(limb(el, lerp(el, wr, 0.85), r * 0.9, M.top));
      g.add(limb(lerp(el, wr, 0.8), lerp(el, wr, 0.95), r * 0.97, M.topDark)); // ribbed cuff
      if (!L.plainSleeves) g.add(limb(lerp(sh, el, 0.15), lerp(el, wr, 0.6), r * 0.25, M.accent).translateZ(r * 0.8)); // sleeve stripe
    } else {
      g.add(limb(sh, el, r, M.skin));
      g.add(limb(el, lerp(el, wr, 0.92), r * 0.88, M.skin));
      g.add(ball(r * 1.8, M.top, lerp(sh, el, 0.2), [1, 1.3, 1])); // puff sleeve
      g.add(mesh(new THREE.TorusGeometry(r * 1.2, r * 0.28, 8, 24), M.top, lerp(sh, el, 0.43), null, [Math.PI / 2, 0, 0])); // gathered cuff
    }
    return g;
  }

  function buildCharacter(M, look) {
    const L = LOOKS[look] || LOOKS.male;
    const female = look === 'female';
    const char = new THREE.Group();

    // legs + sneakers, each in a group that swings at the hip
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = V(s * (female ? 0.1 : 0.115), 0.95, 0);
      const at = (x, y, z) => V(x, y, z).sub(hip);
      const knee = at(s * 0.12, 0.52, 0.015), ankle = at(s * 0.125, 0.13, 0);
      const leg = new THREE.Group();
      leg.position.copy(hip);
      const legMat = L.bareLegs ? M.skin : M.pants;
      leg.add(limb(V(0, 0, 0), knee, L.legR, legMat));
      leg.add(limb(knee, ankle, L.legR * 0.83, legMat));
      if (female) {
        leg.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 28), M.pantsDark, at(s * 0.125, 0.2, 0))); // rolled cuff
        leg.add(limb(at(s * 0.125, 0.16, 0.0), at(s * 0.125, 0.12, 0.0), 0.045, M.skin)); // ankle
      } else {
        leg.add(limb(at(s * 0.2, 0.9, 0), at(s * 0.2, 0.2, 0.0), 0.012, M.accent)); // jogger side stripe
        leg.add(mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.06, 24), M.pantsDark, at(s * 0.125, 0.15, 0))); // gathered cuff
      }
      leg.add(ball(1, M.shoe, at(s * 0.128, 0.068, 0.045), female ? [0.078, 0.058, 0.15] : [0.088, 0.066, 0.165]));
      leg.add(ball(1, M.sole, at(s * 0.128, 0.022, 0.045), female ? [0.083, 0.022, 0.155] : [0.093, 0.026, 0.172]));
      if (female) leg.add(limb(at(s * 0.085, 0.1, 0.09), at(s * 0.17, 0.1, 0.09), 0.009, M.sole)); // loafer strap
      else leg.add(limb(at(s * 0.09, 0.09, 0.11), at(s * 0.165, 0.09, 0.11), 0.01, M.sole)); // laces
      char.add(leg);
      legs.push(leg);
    }
    char.add(ball(1, M.pants, V(0, 0.95, 0), [female ? 0.19 : 0.2, 0.12, 0.13]));

    // torso
    char.add(mesh(new THREE.CapsuleGeometry(0.2, 0.3, 8, 24), M.top, V(0, 1.26, 0), [L.torsoW, 1, 0.8]));
    if (!female) char.add(dropBadge(M.drop, V(0.09, 1.38, 0.16), 1));
    if (female) {
      // black long-sleeve crew-neck top, tucked into high-waist white trousers
      char.add(mesh(new THREE.TorusGeometry(0.058, 0.012, 8, 28), M.topDark, V(0, 1.575, 0.005), [1, 1, 0.85], [Math.PI / 2, 0, 0])); // crew neck
      char.add(mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.14, 40), M.pants, V(0, 1.04, 0), [1, 1, 0.82])); // high waist
      char.add(mesh(new THREE.CylinderGeometry(0.193, 0.193, 0.03, 40), M.pantsDark, V(0, 1.1, 0), [1, 1, 0.83])); // waistband
      char.add(ball(0.011, M.gold, V(0, 1.1, 0.16))); // button
      char.add(limb(V(0.02, 1.08, 0.162), V(0.02, 0.93, 0.13), 0.0035, M.pantsDark)); // fly seam
      for (const s of [-1, 1]) char.add(mesh(new THREE.BoxGeometry(0.012, 0.04, 0.01), M.pantsDark, V(s * 0.1, 1.1, 0.14))); // belt loops
    } else {
      char.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 40), M.topDark, V(0, 1.0, 0), [1, 1, 0.8])); // hem band
      char.add(mesh(new THREE.BoxGeometry(0.012, 0.5, 0.01), M.accent, V(0, 1.27, 0.162))); // zip
      char.add(mesh(new THREE.TorusGeometry(0.13, 0.05, 12, 32, Math.PI * 1.25), M.topDark, V(0, 1.58, -0.06), [1, 0.8, 1], [Math.PI / 2 - 0.25, 0, Math.PI * 0.625])); // hood
      for (const s of [-1, 1]) char.add(limb(V(s * 0.05, 1.55, 0.13), V(s * 0.06, 1.38, 0.16), 0.006, M.accent)); // drawstrings
    }
    for (const s of [-1, 1]) char.add(ball(L.armR * 1.22, M.top, V(s * (L.shoulderX - 0.007), 1.47, 0)));

    // neck + head
    char.add(mesh(new THREE.CylinderGeometry(female ? 0.048 : 0.058, female ? 0.054 : 0.062, 0.17, 24), M.skin, V(0, 1.585, 0)));
    const { head, eyes, setMood, tail } = buildHead(M, look);
    head.position.set(0, female ? 1.9 : 1.84, 0);
    head.scale.setScalar(L.headScale || 1.2);
    char.add(head);

    // right arm raised, bottle held at chin height (pivots at the shoulder)
    const raised = arm(M, L, V(0, 0, 0), V(-0.075, -0.29, 0.07), V(-0.065, -0.07, 0.24));
    raised.position.set(-L.shoulderX, 1.47, 0);
    const bottle = buildBottle(M);
    bottle.position.set(-0.06, 0.06, 0.29);
    bottle.rotation.z = 0.08;
    raised.add(bottle);
    raised.add(ball(0.055, M.skin, V(-0.1, -0.035, 0.28), [0.9, 1.2, 1]));
    for (let i = 0; i < 4; i++) raised.add(limb(V(-0.098, -0.075 + i * 0.024, 0.318), V(-0.03, -0.075 + i * 0.024, 0.33), 0.0135, M.skin));
    raised.add(limb(V(-0.1, 0.0, 0.29), V(-0.065, 0.025, 0.33), 0.014, M.skin));
    char.add(raised);

    // left arm relaxed
    const relaxed = arm(M, L, V(0, 0, 0), V(0.05, -0.29, -0.01), V(0.06, -0.55, 0.04));
    relaxed.position.set(L.shoulderX, 1.47, 0);
    relaxed.add(ball(0.052, M.skin, V(0.062, -0.6, 0.045), [0.85, 1.2, 0.8]));
    if (female) {
      // small white handbag hanging from her hand by a gold handle
      relaxed.add(mesh(new THREE.TorusGeometry(0.045, 0.005, 8, 24, Math.PI), M.gold, V(0.065, -0.68, 0.045), null, [0, Math.PI / 2, Math.PI]));
      relaxed.add(ball(1, M.bag, V(0.065, -0.75, 0.045), [0.09, 0.065, 0.042]));
      relaxed.add(ball(1, M.bag, V(0.065, -0.72, 0.075), [0.08, 0.035, 0.014])); // flap
      relaxed.add(ball(0.009, M.gold, V(0.065, -0.735, 0.09)));
    }
    char.add(relaxed);

    return { char, head, eyes, setMood, tail, raised, relaxed, legs, bottle };
  }

  /** Built-in fallback character, animated by hand. */
  function proceduralRig(look) {
    look = LOOKS[look] ? look : 'male';
    const parts = buildCharacter(buildMaterials(LOOKS[look]), look);
    // Keep the built-in character lean and leave generous space around it in
    // the small reminder window.
    parts.char.scale.set(0.84, 0.96, 0.84);
    if (look === 'female') parts.char.scale.multiplyScalar(0.97);
    const { head, eyes, raised, relaxed, legs, bottle, tail } = parts;
    const { water, cap } = bottle.userData;
    const ease = x => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
    return {
      object: parts.char,
      spout: v => (bottle.visible ? cap.getWorldPosition(v) : null),
      tearFrom: v => eyes.localToWorld(v.set(-0.075, -0.03, 0.21)),
      setWater(level) {
        water.scale.y = Math.max(level, 0.02);
        water.position.y = -0.167 + 0.125 * water.scale.y;
      },
      /** Poses the limbs for the current act (see the director in mountAvatar); k = seconds into it. */
      update(t, mode, k) {
        const idle = Math.sin(t * 2.2);
        const p = {
          headX: 0, headY: Math.sin(t * 0.9) * 0.12, headZ: Math.sin(t * 0.7) * 0.05,
          rX: -0.05 + idle * 0.06, rZ: idle * 0.07, lX: 0, lZ: -idle * 0.03,
          leg0: 0, leg1: 0, leg1z: 0, eyesW: 1, eyesH: t % 4.2 > 4.05 ? 0.12 : 1, mood: 'happy',
        };
        switch (mode) {
          case 'run': {
            const s = Math.sin(t * 22);
            Object.assign(p, { leg0: s * 0.9, leg1: -s * 0.9, rX: -s * 0.6, lX: s * 0.6, rZ: 0, lZ: 0, headX: 0.12, headY: 0 });
            break;
          }
          case 'stumble': {
            // one leg gives way: hop on the other, arms flailing, water sloshing out
            const w = Math.sin(k * 26), down = ease((k - 0.75) / 0.25);
            Object.assign(p, {
              leg1: 0.95 * (1 - down), leg1z: 0.35 * (1 - down),
              rX: -0.2, rZ: (-0.9 + w * 0.45) * (1 - down), lZ: (0.9 - w * 0.45) * (1 - down),
              headX: -0.15, headY: 0, eyesW: 1.2, eyesH: 1.3, mood: 'oh',
            });
            break;
          }
          case 'show':
          case 'idle': {
            // holds the bottle out so you can see the water
            const e = mode === 'show' ? ease(k / 0.5) : 1;
            p.rX = -0.05 - 0.4 * e + idle * 0.04;
            p.rZ = 0.15 * e;
            break;
          }
          case 'sad': {
            const e = ease(k / 0.6);
            Object.assign(p, { headX: 0.38 * e, headY: 0, rX: -0.45 * (1 - e) + 0.12 * e, rZ: 0, lZ: 0, eyesH: 0.65, mood: 'sad' });
            break;
          }
          case 'walkAway': {
            const s = Math.sin(k * 5);
            Object.assign(p, { leg0: s * 0.35, leg1: -s * 0.35, rX: 0.12 - s * 0.15, rZ: 0, lX: s * 0.15, lZ: 0, headX: 0.38, headY: 0, eyesH: 0.65, mood: 'sad' });
            break;
          }
          case 'drink': {
            // lifts the bottle to the mouth, head tipped back, eyes closed while gulping
            const e = ease(k / 0.8);
            Object.assign(p, { rX: -0.05 - 1.3 * e, rZ: 0.7 * e, headX: -0.25 * e, headY: 0, eyesH: k > 1 ? 0.15 : 1 });
            break;
          }
          case 'lower': {
            const e = ease(k / 0.6);
            Object.assign(p, { rX: -1.35 * (1 - e) - 0.05, rZ: 0.7 * (1 - e) });
            break;
          }
          case 'wave': {
            const e = ease(k / 0.35);
            Object.assign(p, { rX: -0.05, rZ: 0, lX: -0.15 * e, lZ: e * (2.55 + Math.sin(k * 14) * 0.35), headZ: Math.sin(k * 7) * 0.08 });
            break;
          }
          case 'leave': {
            // a cheerful walk off
            const s = Math.sin(k * 7);
            Object.assign(p, { leg0: s * 0.5, leg1: -s * 0.5, rX: -0.05 - s * 0.3, rZ: 0, lX: s * 0.3, lZ: 0, headY: 0 });
            break;
          }
        }
        head.rotation.set(p.headX, p.headY, p.headZ);
        raised.rotation.set(p.rX, 0, p.rZ);
        relaxed.rotation.set(p.lX, 0, p.lZ);
        legs[0].rotation.set(p.leg0, 0, 0);
        legs[1].rotation.set(p.leg1, 0, p.leg1z);
        eyes.scale.set(p.eyesW, p.eyesH, 1);
        // after drinking the bottle shrinks away and stays gone for the goodbye
        const gone = mode === 'lower' ? Math.min(Math.max((k - 0.45) / 0.3, 0), 1) : mode === 'wave' || mode === 'leave' ? 1 : 0;
        bottle.scale.setScalar(1 - gone);
        bottle.visible = gone < 1;
        if (tail) {
          // the ponytail swings with the moves: bouncy when running, droopy when sad
          const swing = { run: [22, 0.3], stumble: [14, 0.45], walkAway: [5, 0.12], wave: [7, 0.15], leave: [7, 0.15] }[mode] || [2, 0.06];
          const amp = tail.userData.amp ?? 1;
          tail.rotation.x = amp * ((mode === 'sad' || mode === 'walkAway' ? 0.15 : 0) + Math.sin(t * swing[0]) * swing[1]);
          tail.rotation.z = amp * Math.sin(t * swing[0] * 0.5 + 1) * swing[1] * 0.8;
        }
        parts.setMood(p.mood);
      },
    };
  }

  /** Which clip plays for each act of the director (see mountAvatar). */
  const REAL_CLIPS = {
    run: 'run', stumble: 'stop', show: 'idle', idle: 'idle', sad: 'sad',
    walkAway: 'walk', drink: 'drink', lower: 'idle', wave: 'wave', leave: 'walk',
  };
  const REAL_ONCE = new Set(['stop']);


  /** Clip without its forward travel (the director moves the character itself); the bounce stays. */
  function inPlace(clip) {
    for (const t of clip.tracks) {
      if (t.name !== 'Bip01.position') continue;
      for (let i = 0; i < t.values.length; i += 3) {
        t.values[i] = 0;
        t.values[i + 2] = 0;
      }
    }
    return clip;
  }

  /**
   * A realistic rigged human (Microsoft Rocketbox, MIT) driven by its own motion-captured clips:
   * each act crossfades to its clip, and the water bottle sits in the right hand.
   */
  function realisticRig(gltf, clips, starts) {
    const model = gltf.scene;
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned meshes animate outside their bind-pose bounds
      }
    });
    const measure = () => {
      model.updateMatrixWorld(true);
      model.traverse(o => o.isSkinnedMesh && o.skeleton.update());
      return new THREE.Box3().setFromObject(model, true);
    };
    model.scale.multiplyScalar(1.92 / (measure().getSize(new THREE.Vector3()).y || 1));
    model.position.y -= measure().min.y;
    const object = new THREE.Group();
    object.add(model);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const action = mixer.clipAction(inPlace(clip));
      if (REAL_ONCE.has(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions[name] = action;
    }
    let current = null, currentMode = '', last = 0;
    const play = (name, fade) => {
      const next = actions[name];
      if (!next || next === current) return;
      next.reset();
      next.time = (starts && starts[name]) || 0; // skip the clip's lead-in: the acts are short
      next.play();
      if (current && fade) current.crossFadeTo(next, fade, false);
      else if (current) current.stop();
      current = next;
    };

    // the water bottle, held in the right hand
    const M = buildMaterials(LOOKS.male);
    const bottle = buildBottle(M);
    const hand = model.getObjectByName('Bip01_R_Hand');
    const { water, cap } = bottle.userData;
    if (hand) {
      // pose the idle clip once to find the grip: the gap between thumb tip and middle fingertip
      if (actions.idle) {
        actions.idle.play();
        actions.idle.time = 1;
        mixer.update(0);
        actions.idle.stop();
      }
      model.updateMatrixWorld(true);
      const holder = new THREE.Group();
      hand.add(holder);
      holder.scale.setScalar(0.85 / hand.getWorldScale(new THREE.Vector3()).x); // real bottle size
      const thumb = model.getObjectByName('Bip01_R_Finger02'), middle = model.getObjectByName('Bip01_R_Finger22');
      const grip = thumb && middle
        ? thumb.getWorldPosition(new THREE.Vector3()).lerp(middle.getWorldPosition(new THREE.Vector3()), 0.5)
        : hand.localToWorld(new THREE.Vector3(0.08, 0, 0));
      holder.position.copy(hand.worldToLocal(grip));
      bottle.position.y = 0.04; // held a little below its middle
      bottle.scale.set(0.82, 1, 0.82); // slim enough to fit inside the curled fingers
      holder.add(bottle);
      // the bottle's angle in the hand, set so it stands upright in this pose: kept while drinking,
      // so it tips up to the mouth with the hand
      holder.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(object.getWorldQuaternion(new THREE.Quaternion())));
    }
    const holder = bottle.parent;
    const lips = model.getObjectByName('Bip01_MBottomLip');
    const UP = new THREE.Vector3(0, 1, 0), HEAD_PITCH = new THREE.Vector3(0, 0, 1);
    const qHand = new THREE.Quaternion(), qUp = new THREE.Quaternion(), qStand = new THREE.Quaternion(), qAim = new THREE.Quaternion();
    const pLips = new THREE.Vector3();
    let drinkWeight = 0;
    /**
     * The hand turns a lot in these clips: the bottle stays upright while it follows the hand.
     * While drinking it aims its cap at the lips and slides in the grip so the cap reaches them.
     */
    const gripLocal = holder.position.clone();
    // two-bone arm IK (cyclic coordinate descent on upper arm + forearm), blended in by `weight`
    const armChain = ['Bip01_R_Forearm', 'Bip01_R_UpperArm'].map(n => model.getObjectByName(n)).filter(Boolean);
    const vBone = new THREE.Vector3(), vEnd = new THREE.Vector3(), vGoal = new THREE.Vector3();
    const qDelta = new THREE.Quaternion(), qStep = new THREE.Quaternion(), qParent = new THREE.Quaternion(), qBone = new THREE.Quaternion(), qId = new THREE.Quaternion();
    const reachArm = (goal, weight) => {
      for (let i = 0; i < 10; i++) {
        for (const bone of armChain) {
          bone.getWorldPosition(vBone);
          hand.localToWorld(vEnd.copy(gripLocal)).sub(vBone).normalize();
          vGoal.copy(goal).sub(vBone).normalize();
          qDelta.setFromUnitVectors(vEnd, vGoal);
          qStep.slerpQuaternions(qId, qDelta, weight);
          bone.parent.getWorldQuaternion(qParent).invert();
          bone.quaternion.copy(qParent.multiply(qStep).multiply(bone.getWorldQuaternion(qBone)));
          bone.updateMatrixWorld(true);
        }
      }
    };
    const pForward = new THREE.Vector3(), pSip = new THREE.Vector3(), axis = new THREE.Vector3();
    const SIP_TILT = THREE.MathUtils.degToRad(12); // bottom raised a little: a normal sip, not a chug
    const CAP_REACH = (0.178 + 0.04) * 0.85; // grip to cap centre, in world units
    const orientBottle = (drinking, dt) => {
      if (!hand) return;
      object.updateMatrixWorld(true);
      // the arm only reaches for the lips as the clip's hand comes up, so the bottle travels with the hand
      let target = 0;
      if (drinking && lips) {
        const near = hand.localToWorld(pSip.copy(gripLocal)).distanceTo(lips.getWorldPosition(pLips));
        target = Math.min(Math.max((0.45 - near) / 0.2, 0), 1); // full once the hand is within 25 cm
      }
      drinkWeight += Math.max(Math.min(target - drinkWeight, dt / 0.2), -dt / 0.3);
      hand.getWorldQuaternion(qHand).invert();
      qStand.copy(qHand).multiply(object.getWorldQuaternion(qUp));
      holder.position.copy(gripLocal);
      holder.quaternion.copy(qStand);
      if (!lips || drinkWeight === 0) return;
      // while drinking the cap sits on the lips and the bottle runs back to the hand, out to the side
      // (so it never hides the face), with its bottom only a little higher than the cap
      lips.getWorldPosition(pLips);
      pForward.copy(gripLocal);
      hand.localToWorld(pForward).sub(pLips).setY(0).normalize(); // lips -> hand, level
      axis.copy(pForward).multiplyScalar(-Math.cos(SIP_TILT)).addScaledVector(UP, -Math.sin(SIP_TILT)); // bottom -> cap
      pSip.copy(pLips).addScaledVector(axis, -CAP_REACH); // where the grip has to be
      // the arm brings the hand there (the bottle never leaves the hand), then the bottle tips to the lips
      reachArm(pSip, drinkWeight);
      hand.getWorldQuaternion(qHand).invert();
      qStand.copy(qHand).multiply(object.getWorldQuaternion(qUp));
      qAim.copy(qHand).multiply(qUp.setFromUnitVectors(UP, axis));
      holder.quaternion.slerpQuaternions(qStand, qAim, drinkWeight);
    };
    const head = model.getObjectByName('Bip01_Head');
    const bottleScale = bottle.scale.clone();
    /** After drinking the hand comes down (0.7 s), then the bottle shrinks away; it stays gone for the goodbye. */
    const vanishBottle = (mode, k) => {
      if (mode === 'wave' || mode === 'leave') bottle.visible = false;
      if (mode !== 'lower') return;
      const e = Math.min(Math.max((k - 0.45) / 0.3, 0), 1);
      bottle.scale.copy(bottleScale).multiplyScalar(1 - e);
      bottle.visible = e < 1;
    };

    // sad body language on top of the clips: head hung low (+Z bends it forward on the Rocketbox biped).
    // Only the head: in a Biped the clavicles hang off the neck, so bending neck or spine swings the arms back.
    const slump = [['Bip01_Head', [0, 0, 1], 0.55]]
      .map(([n, ax, angle]) => [model.getObjectByName(n), new THREE.Vector3(...ax), angle]).filter(([b]) => b);

    return {
      object,
      leanScale: 0.35,
      spout: v => (bottle.visible ? cap.getWorldPosition(v) : null),
      tearFrom: v => (head ? head.localToWorld(v.set(0.06, 0.09, 0.03)) : object.localToWorld(v.set(-0.07, 1.75, 0.2))),
      setWater(level) {
        water.scale.y = Math.max(level, 0.02);
        water.position.y = -0.167 + 0.125 * water.scale.y;
      },
      update(t, mode, k) {
        if (mode !== currentMode) {
          currentMode = mode;
          // a heavy, slow walk when sad; a brisk one when leaving happy
          if (actions.walk) actions.walk.timeScale = mode === 'leave' ? 1.1 : 0.8;
          if (actions.drink) actions.drink.timeScale = 1.5; // the clip's arm raise is slow
          play(REAL_CLIPS[mode] || 'idle', currentMode === 'run' ? 0 : 0.3);
        }
        const dt = Math.min(Math.max(t - last, 0), 0.1);
        mixer.update(dt);
        last = t;
        const sad = mode === 'sad' ? Math.min(k / 0.7, 1) : mode === 'walkAway' ? 1 : 0;
        if (sad) for (const [bone, axis, angle] of slump) bone.rotateOnAxis(axis, angle * sad);
        if (head && drinkWeight > 0) head.rotateOnAxis(HEAD_PITCH, -0.22 * drinkWeight); // tips the head back to drink
        orientBottle(mode === 'drink', dt);
        vanishBottle(mode, k);
      },
    };
  }

  /** A user-supplied .glb: scaled to 2 units tall, feet on the ground, its own animations played. */
  function modelRig(gltf, turnDeg) {
    const model = gltf.scene;
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned meshes animate outside their bind-pose bounds
      }
    });
    model.rotation.y = THREE.MathUtils.degToRad(turnDeg || 0);
    // precise=true walks the skinned vertices, so rigs with a scaled armature (e.g. Mixamo's 0.01) fit correctly
    const measure = () => {
      model.updateMatrixWorld(true);
      model.traverse(o => o.isSkinnedMesh && o.skeleton.update());
      return new THREE.Box3().setFromObject(model, true);
    };
    let box = measure();
    const size = box.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(2 / (size.y || 1));
    box = measure();
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    const object = new THREE.Group();
    object.add(model);

    const mixer = new THREE.AnimationMixer(model);
    const clips = gltf.animations || [];
    const find = re => clips.find(c => re.test(c.name));
    const wave = find(/wave|greet|hello|cheer|drink/i);
    const idle = find(/idle|breath|stand/i) || (clips.length && clips[0] !== wave ? clips[0] : null);
    if (wave) {
      const a = mixer.clipAction(wave);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      if (idle) {
        mixer.addEventListener('finished', () => {
          const next = mixer.clipAction(idle);
          next.reset().play();
          a.crossFadeTo(next, 0.5, false);
        });
      }
    } else if (idle) {
      mixer.clipAction(idle).play();
    }

    // Without clips, nod the head bone a little so the model doesn't look frozen.
    let headBone = null;
    if (!clips.length) model.traverse(o => { if (!headBone && o.isBone && /head/i.test(o.name)) headBone = o; });
    const rest = headBone && headBone.rotation.clone();
    let last = 0;
    // A custom model has no known bottle or eyes; use a spot near the right hand / face.
    return {
      object,
      spout: v => object.localToWorld(v.set(-0.3, 1.25, 0.2)),
      tearFrom: v => object.localToWorld(v.set(-0.07, 1.75, 0.2)),
      setWater() {},
      update(t) {
        mixer.update(Math.min(t - last, 0.1));
        last = t;
        if (headBone) {
          headBone.rotation.y = rest.y + Math.sin(t * 0.9) * 0.12;
          headBone.rotation.z = rest.z + Math.sin(t * 0.7) * 0.05;
        }
      },
    };
  }

  /**
   * window.mountAvatar(container, { model, turn, onModel }, onReady) -> true if WebGL works.
   * `model` is a .glb URL; if it's missing or fails to load, the built-in character is used.
   * `onModel(ok, error)` reports how loading the model went.
   */
  window.mountAvatar = function (container, opts, onReady) {
    opts = opts || {};
    if (!window.THREE) return false;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
    } catch (e) {
      return false;
    }
    if (!renderer.getContext()) return false;

    const w = container.clientWidth || 320, h = container.clientHeight || 470;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    if (THREE.RoomEnvironment) {
      // Studio-style image-based lighting: what makes textured PBR models look "rendered".
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
    }
    const camera = new THREE.PerspectiveCamera(26, w / h, 0.1, 50);
    const dist = Math.max(2.35, 1.0 / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(13)));
    camera.position.set(0, 1.1, dist);
    camera.lookAt(0, 1.04, 0);

    const env = scene.environment ? 0.55 : 1;
    scene.add(new THREE.HemisphereLight(0xfff4ea, 0x3a3f4a, 1.3 * env));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.6 * env);
    key.position.set(0.8, 4, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 12 });
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 2.2 * env);
    rim.position.set(-3, 2.5, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe2cc, 0.7 * env);
    fill.position.set(-3, 1, 3);
    scene.add(fill);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // `mover` carries position and sideways lean; the rig object inside it turns to face a direction.
    const mover = new THREE.Group();
    scene.add(mover);
    let rig = null;
    let start = 0;
    const use = r => {
      rig = r;
      mover.add(rig.object);
      start = performance.now();
    };
    if (opts.realistic && THREE.GLTFLoader) {
      // the realistic character: its model plus one small file per motion clip
      const loader = new THREE.GLTFLoader();
      const names = Object.keys(opts.realistic.clips);
      Promise.all([loader.loadAsync(opts.realistic.model), ...names.map(n => loader.loadAsync(opts.realistic.clips[n]))])
        .then(([gltf, ...anims]) => {
          const clips = {};
          names.forEach((n, i) => (clips[n] = anims[i].animations[0]));
          use(realisticRig(gltf, clips, opts.realistic.starts));
        })
        .catch(err => {
          console.error('Water Reminder: could not load the realistic character, using the built-in one.', err);
          use(proceduralRig(opts.look));
        });
    } else if (opts.model && THREE.GLTFLoader) {
      const loader = new THREE.GLTFLoader();
      if (THREE.MeshoptDecoder) loader.setMeshoptDecoder(THREE.MeshoptDecoder);
      loader.load(
        opts.model,
        gltf => {
          use(modelRig(gltf, opts.turn));
          if (opts.onModel) opts.onModel(true);
        },
        undefined,
        err => {
          console.error('Water Reminder: could not load 3D model, using the built-in one.', err);
          use(proceduralRig(opts.look));
          if (opts.onModel) opts.onModel(false, String((err && err.message) || err));
        }
      );
    } else {
      use(proceduralRig(opts.look));
    }

    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';

    // --- water drops: leak from the bottle, splash into puddles, trail behind when flying ---
    const dropGeo = new THREE.SphereGeometry(0.02, 12, 8);
    const dropMat = new THREE.MeshPhysicalMaterial({
      color: 0x5bbcff, emissive: 0x0b4f9e, emissiveIntensity: 0.45, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.9,
    });
    const puddleGeo = new THREE.CircleGeometry(1, 40);
    const puddleMat = new THREE.MeshPhysicalMaterial({ color: 0x3fa4ff, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.5, depthWrite: false });
    const drops = [], puddles = [];
    const tmp = new THREE.Vector3();
    const rand = a => (Math.random() - 0.5) * a;

    function drop(pos, vel, size, life, wet) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.position.copy(pos);
      m.scale.set(size, size * 1.4, size);
      scene.add(m);
      drops.push({ m, v: vel, life, wet });
    }
    function splash(x, z) {
      let p = puddles.find(q => Math.hypot(q.position.x - x, q.position.z - z) < 0.3);
      if (!p && puddles.length < 6) {
        p = new THREE.Mesh(puddleGeo, puddleMat);
        p.rotation.x = -Math.PI / 2;
        p.position.set(x, 0.004 + puddles.length * 0.001, z);
        p.scale.setScalar(0.04);
        scene.add(p);
        puddles.push(p);
      }
      if (p) p.scale.setScalar(Math.min(p.scale.x + 0.018, 0.3));
      for (let i = 0; i < 2; i++) drop(V(x, 0.02, z), V(rand(0.8), 0.8 + Math.random() * 0.5, rand(0.4)), 0.45, 0.5, false);
    }
    function leak(n, spread, push) {
      if (!rig.spout(tmp)) return; // the bottle has been handed over
      for (let i = 0; i < n; i++) {
        drop(tmp, V(push + rand(spread), Math.random() * spread * 1.4, rand(spread * 0.6) + 0.15), 0.7 + Math.random() * 0.5, 2.5, true);
      }
    }
    function stepDrops(dt) {
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.v.y -= 6.5 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.life -= dt;
        const landed = d.m.position.y <= 0.01;
        if (landed || d.life <= 0) {
          if (landed && d.wet) splash(d.m.position.x, d.m.position.z);
          scene.remove(d.m);
          drops.splice(i, 1);
        }
      }
    }

    // --- director: the character's acts, one after another ---
    //   arrival: run in fast -> stumble on one leg, water sloshes out -> show the bottle (prompt appears) -> idle, dripping
    //   "later": sad face, a tear -> walks off slowly and fades
    //   "yes":   drinks from the bottle (~2 s, the water level drops) -> lowers it, it vanishes -> waves bye bye -> walks off
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ease = x => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
    let act = reduced ? 'idle' : 'run', since = 0, lastT = 0;
    let announced = false, splashed = false, cried = false, finished = false, reaction = null;
    let water = 1, leakUntil = 0, nextDrip = 0;
    const go = (next, t) => {
      act = next;
      since = t;
    };
    const announce = () => {
      if (announced) return;
      announced = true;
      if (onReady) onReady();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      reaction.done();
    };

    /** window.avatarReact('yes' | 'later' | 'timeout', { say(text), done() }): plays the goodbye, then calls done. */
    window.avatarReact = function (type, hooks) {
      if (reaction) return;
      reaction = hooks;
      leakUntil = 0; // answered: the bottle stops dripping
      if (!rig || reduced) {
        hooks.say(type === 'yes' ? 'Cheers! 💧' : 'Okay… 😢');
        setTimeout(finish, 900);
      } else if (type === 'yes') {
        go('drink', lastT);
        hooks.say(opts.drinkText || 'Cheers! Let’s both drink 💧');
      } else {
        go('sad', lastT);
        hooks.say(opts.sadText || 'Okay… I’ll come back later 😢');
      }
    };

    function frame(now) {
      requestAnimationFrame(frame);
      if (!rig) return;
      const t = (now - start) / 1000, dt = Math.min(t - lastT, 0.05), k = t - since;
      lastT = t;
      let x = 0, y = 0, z = 0, lean = 0, face = 0, fade = 1, squash = 1;
      switch (act) {
        case 'run':
          x = -2.3 + 2.6 * (k / 0.85);
          y = Math.abs(Math.sin(k * 22)) * 0.06;
          lean = -0.2;
          face = 1.25;
          if (k >= 0.85) go('stumble', t);
          break;
        case 'stumble':
          // brakes too hard: skids past, hops on one leg, wobbles back to the middle
          x = 0.3 + 0.18 * ease(k / 0.3) - 0.48 * ease((k - 0.35) / 0.65);
          y = Math.abs(Math.sin(k * 11)) * 0.08 * Math.max(0, 1 - k);
          lean = 0.3 * Math.sin(k * 13) * Math.exp(-k * 2.5) + (k < 0.3 ? 0.22 : 0);
          face = 1.25 * (1 - ease((k - 0.3) / 0.6));
          if (!splashed) {
            splashed = true;
            leak(22, 1.0, 0.6);
            water -= 0.12;
            leakUntil = t + 4.5;
          }
          if (k >= 1) go('show', t);
          break;
        case 'show':
          if (k >= 0.5) {
            go('idle', t);
            announce();
          }
          break;
        case 'idle':
          face = Math.sin(t * 0.6) * 0.12;
          y = Math.sin(t * 2.2) * 0.012;
          announce();
          break;
        case 'sad':
          if (k > 0.35 && !cried) {
            cried = true;
            drop(rig.tearFrom(tmp), V(0.02, -0.05, 0.25), 0.5, 1.5, false);
          }
          if (k >= 1.1) go('walkAway', t);
          break;
        case 'walkAway':
          face = -1.35 * ease(k / 0.5);
          x = (-2.0 * Math.max(0, k - 0.3)) / 3;
          y = Math.abs(Math.sin(k * 5)) * 0.015;
          fade = 1 - Math.max(0, k - 1.8) / 1.4;
          if (k >= 3.3) finish();
          break;
        case 'drink':
          // steps a little closer and drinks; the bottle empties while it is at the mouth
          z = 0.25 * ease(k / 0.5);
          y = Math.sin(t * 2.2) * 0.008;
          if (k > 0.6) water = Math.max(0.2, water - dt * 0.6);
          if (k >= 1.8) go('lower', t); // hand up in ~0.6 s, then about a second of drinking
          break;
        case 'lower':
          // the hand comes down with the bottle, then the bottle vanishes: the goodbye is empty-handed
          z = 0.25;
          if (k >= 0.9) {
            go('wave', t);
            reaction.say(opts.byeText || 'Bye bye! 👋');
          }
          break;
        case 'wave':
          z = 0.25;
          if (k >= 1.5) go('leave', t);
          break;
        case 'leave':
          // turns away and walks off the other side, fading out
          z = 0.25;
          face = 1.35 * ease(k / 0.5);
          x = (2.0 * Math.max(0, k - 0.3)) / 2.4;
          y = Math.abs(Math.sin(k * 7)) * 0.012;
          fade = 1 - Math.max(0, k - 1.7) / 1.0;
          if (k >= 2.7) finish();
          break;
      }
      if (reduced) {
        x = y = z = lean = face = 0;
        squash = 1;
      }
      if (t < leakUntil && t >= nextDrip) {
        leak(1, 0.15, 0);
        nextDrip = t + 0.18 + Math.random() * 0.25;
      }
      if (t < leakUntil && water > 0.6) water -= dt * 0.05; // the leak alone never takes it below 60 %
      rig.setWater(water);
      stepDrops(dt);

      mover.position.set(x, y, z);
      mover.rotation.z = lean * (rig.leanScale ?? 1);
      mover.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      rig.object.rotation.y = face;
      if (!reduced) rig.update(t, act, k);
      renderer.domElement.style.opacity = Math.max(fade, 0);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    return true;
  };
})();
