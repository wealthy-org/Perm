import * as THREE from "three";

export type SceneStop = { n: string; label: string; p: number; a: number };
export type SceneController = {
  stops: SceneStop[];
  setTarget(progress: number): void;
  dispose(): void;
};

type SceneOptions = {
  onReady?: () => void;
  onProgress?: (progress: number) => void;
};

type CameraKey = {
  at: number;
  position: THREE.Vector3;
  look: THREE.Vector3;
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/**
 * A purpose-built Perm world: a dark glass exchange corridor, route branches,
 * fee rings, a settlement ledger, verified hook nodes, and a final loop portal.
 * It shares no model or texture assets with the reference website.
 */
export function createPermScene(canvas: HTMLCanvasElement, options: SceneOptions = {}): SceneController {
  const mobile = matchMedia("(max-width: 840px)").matches;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    powerPreference: "high-performance",
  });
  const pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.35 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071a17);
  scene.fog = new THREE.FogExp2(0x09231f, 0.0082);

  const camera = new THREE.PerspectiveCamera(mobile ? 58 : 46, innerWidth / innerHeight, 0.1, 900);
  const clock = new THREE.Clock();
  const animated: Array<(time: number) => void> = [];
  const disposableTextures: THREE.Texture[] = [];

  const mint = new THREE.Color(0x68e3ad);
  const cyan = new THREE.Color(0x71eadf);
  const pale = new THREE.Color(0xe2fff4);
  const emerald = new THREE.Color(0x159a69);

  // Sky dome with a restrained emerald aurora and a pale horizon.
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x020b0a) },
      uHorizon: { value: new THREE.Color(0x174f43) },
      uGlow: { value: new THREE.Color(0x82f4cc) },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform float uTime;
      void main() {
        vec3 d = normalize(vWorld);
        float h = clamp(d.y * .5 + .5, 0.0, 1.0);
        vec3 color = mix(uHorizon, uTop, smoothstep(.18, .86, h));
        float band = exp(-pow((d.y - .08 - sin(d.x * 3.0 + uTime * .03) * .025) * 8.5, 2.0));
        color += uGlow * band * .075;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 18), skyMaterial);
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xbfffe7, 0x02120f, 1.55));
  const keyLight = new THREE.DirectionalLight(0xd9fff0, 3.2);
  keyLight.position.set(18, 32, 20);
  scene.add(keyLight);
  const edgeLight = new THREE.PointLight(0x51e6c8, 28, 110, 1.6);
  edgeLight.position.set(-18, 12, -80);
  scene.add(edgeLight);

  const stone = new THREE.MeshStandardMaterial({
    color: 0xbccfc8,
    roughness: 0.38,
    metalness: 0.05,
  });
  const darkStone = new THREE.MeshStandardMaterial({
    color: 0x102c27,
    roughness: 0.5,
    metalness: 0.12,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x67e4bd,
    transparent: true,
    opacity: 0.24,
    roughness: 0.16,
    metalness: 0.12,
    emissive: 0x0d5b43,
    emissiveIntensity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glow = (color: THREE.ColorRepresentation, intensity = 1.5) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.26,
      metalness: 0.08,
    });

  // Procedural floor texture: no external scene asset.
  const floorCanvas = document.createElement("canvas");
  floorCanvas.width = floorCanvas.height = 512;
  const floorContext = floorCanvas.getContext("2d")!;
  floorContext.fillStyle = "#09211d";
  floorContext.fillRect(0, 0, 512, 512);
  const gradient = floorContext.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "rgba(105,231,181,.025)");
  gradient.addColorStop(0.5, "rgba(255,255,255,.08)");
  gradient.addColorStop(1, "rgba(64,210,185,.02)");
  for (let i = -512; i < 1024; i += 56) {
    floorContext.strokeStyle = gradient;
    floorContext.lineWidth = 1;
    floorContext.beginPath();
    floorContext.moveTo(i, 0);
    floorContext.lineTo(i - 512, 512);
    floorContext.stroke();
  }
  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(18, 18);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  disposableTextures.push(floorTexture);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({
      color: 0x0b211d,
      map: floorTexture,
      roughness: 0.24,
      metalness: 0.32,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.42, -100);
  scene.add(floor);

  // The main route is a glass ribbon with a luminous settlement line.
  const routeDeck = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.52, 246), darkStone);
  routeDeck.position.set(0, 0, -91);
  scene.add(routeDeck);
  const routeInset = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.1, 244), glass);
  routeInset.position.set(0, 0.32, -91);
  scene.add(routeInset);
  const routeLineMaterial = glow(mint, 2.6);
  const routeLine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 244), routeLineMaterial);
  routeLine.position.set(0, 0.42, -91);
  scene.add(routeLine);

  // A sequence of original squared loop-gates gives depth and a circular-flow motif.
  const gateGroup = new THREE.Group();
  const pillarGeometry = new THREE.BoxGeometry(0.55, 7.6, 0.55);
  const beamGeometry = new THREE.BoxGeometry(10.2, 0.55, 0.55);
  const pillarCount = mobile ? 32 : 46;
  const pillars = new THREE.InstancedMesh(pillarGeometry, stone, pillarCount * 2);
  const beams = new THREE.InstancedMesh(beamGeometry, stone, pillarCount);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < pillarCount; i++) {
    const z = 21 - i * (224 / (pillarCount - 1));
    const breathing = 1 + Math.sin(i * 0.72) * 0.055;
    for (let side = 0; side < 2; side++) {
      matrix.compose(
        new THREE.Vector3(side ? 4.45 : -4.45, 4.05, z),
        new THREE.Quaternion(),
        new THREE.Vector3(breathing, 1, breathing),
      );
      pillars.setMatrixAt(i * 2 + side, matrix);
    }
    matrix.compose(
      new THREE.Vector3(0, 7.88, z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, breathing, breathing),
    );
    beams.setMatrixAt(i, matrix);
  }
  pillars.instanceMatrix.needsUpdate = true;
  beams.instanceMatrix.needsUpdate = true;
  gateGroup.add(pillars, beams);
  scene.add(gateGroup);

  const platform = (x: number, z: number) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.7, 0.52, 48), darkStone);
    base.position.y = 0.05;
    group.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.65, 0.07, 8, 72), glow(mint, 1.7));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.36;
    group.add(rim);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x) - 2.4, 0.38, 2.4), darkStone);
    bridge.position.set(-x * 0.52, -0.02, 0);
    group.add(bridge);
    scene.add(group);
    return group;
  };

  const addTube = (
    parent: THREE.Object3D,
    points: THREE.Vector3[],
    color: THREE.ColorRepresentation,
    radius = 0.055,
  ) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const material = glow(color, 2.2);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 8, false), material);
    parent.add(mesh);
    return { mesh, material };
  };

  // I — route comparison: three candidates converge into one selected line.
  {
    const group = platform(12.5, -30);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 6, 24), glass);
    core.position.y = 3.4;
    group.add(core);
    const colors = [0x4abf93, 0x6ee0cd, 0xa4f4c9];
    const branches: THREE.Mesh[] = [];
    [-2.4, 0, 2.4].forEach((x, index) => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12), glow(colors[index], 2));
      orb.position.set(x, 5.4 - index * 0.45, 0);
      group.add(orb);
      const tube = addTube(group, [V(x, 5.4 - index * 0.45, 0), V(x * 0.7, 4.2, 0), V(0, 2.4, 0)], colors[index], index === 1 ? 0.11 : 0.055).mesh;
      branches.push(tube);
    });
    const selected = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.1, 10, 80), glow(cyan, 2.8));
    selected.rotation.x = Math.PI / 2;
    selected.position.y = 6.65;
    group.add(selected);
    animated.push((time) => {
      selected.rotation.z = time * 0.28;
      branches.forEach((branch, index) => {
        branch.scale.setScalar(1 + Math.sin(time * 1.4 + index) * 0.025);
      });
    });
  }

  // II — fee rebate: gross fee ring becomes a smaller net fee ring.
  {
    const group = platform(-12.5, -70);
    const rings: THREE.Mesh[] = [];
    [2.35, 1.75, 1.12].forEach((radius, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, index === 1 ? 0.13 : 0.07, 10, 96),
        glow(index === 1 ? cyan : mint, 1.7 + index * 0.5),
      );
      ring.rotation.set(Math.PI / 2 + index * 0.24, index * 0.32, 0);
      ring.position.y = 3.7;
      group.add(ring);
      rings.push(ring);
    });
    const minus = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.24, 0.24), glow(pale, 2.4));
    minus.position.y = 3.7;
    group.add(minus);
    const rebateDrop = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), glow(cyan, 3));
    rebateDrop.position.set(0, 6.75, 0);
    group.add(rebateDrop);
    animated.push((time) => {
      rings.forEach((ring, index) => {
        ring.rotation.z = time * (index % 2 ? -0.33 : 0.22) + index;
      });
      rebateDrop.position.y = 6.75 + Math.sin(time * 1.25) * 0.3;
    });
  }

  // III — proof: a glass settlement receipt fills line by line.
  {
    const group = platform(12.5, -110);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 6.6, 0.2), glass);
    panel.position.y = 4.1;
    panel.rotation.y = -0.16;
    group.add(panel);
    const lines: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(i === 0 ? 3.4 : 2.35 + (i % 3) * 0.45, 0.08, 0.07),
        glow(i === 0 || i === 6 ? cyan : 0xbdeedf, i === 6 ? 2.6 : 1.15),
      );
      line.position.set(-0.45 + (i % 2) * 0.28, 6.3 - i * 0.72, 0.18);
      panel.add(line);
      lines.push(line);
    }
    const seal = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.48, 32), glow(mint, 2.5));
    seal.position.set(1.65, -2.35, 0.18);
    panel.add(seal);
    animated.push((time) => {
      lines.forEach((line, index) => {
        const phase = (time * 0.42 - index * 0.11) % 1;
        line.scale.x = 0.25 + 0.75 * smooth(clamp01(phase * 2.2));
      });
      seal.rotation.z = -time * 0.25;
    });
  }

  // IV — verified hooks: a hooked curve wraps only around its own pool node.
  {
    const group = platform(-12.5, -150);
    const pool = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 20), glass);
    pool.position.y = 3.8;
    group.add(pool);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 1), glow(emerald, 2.7));
    core.position.copy(pool.position);
    group.add(core);
    const hookCurve = new THREE.CatmullRomCurve3([
      V(-2.7, 6.5, 0), V(-1.2, 7.1, 0), V(0.6, 6.4, 0), V(1.8, 5.1, 0),
      V(1.55, 3.6, 0), V(0.4, 3.1, 0), V(-0.3, 3.75, 0),
    ]);
    const hook = new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 72, 0.12, 10, false), glow(cyan, 2.45));
    group.add(hook);
    const nodes: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), glow(i === 0 ? pale : mint, 2.3));
      node.position.set(Math.cos(angle) * 2.3, 3.8 + Math.sin(angle) * 1.35, Math.sin(angle) * 0.45);
      group.add(node);
      nodes.push(node);
    }
    animated.push((time) => {
      core.rotation.x = time * 0.24;
      core.rotation.y = time * 0.45;
      nodes.forEach((node, index) => {
        node.scale.setScalar(0.8 + Math.max(0, Math.sin(time * 2.1 - index * 0.75)) * 0.65);
      });
    });
  }

  // Final settlement portal: concentric loops and the supplied Perm mark.
  const portal = new THREE.Group();
  portal.position.set(0, 0, -202);
  scene.add(portal);
  const portalBase = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9.3, 0.85, 64), darkStone);
  portalBase.position.y = 0.12;
  portal.add(portalBase);
  const portalRings: THREE.Mesh[] = [];
  [4.5, 3.55, 2.7].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.12 - index * 0.02, 12, 128),
      glow(index === 1 ? cyan : mint, 2.2 + index * 0.35),
    );
    ring.position.y = 5.2;
    ring.rotation.set(index * 0.035, index * 0.07, index * 0.22);
    portal.add(ring);
    portalRings.push(ring);
  });
  const portalCore = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 9.2, 36), glass);
  portalCore.position.y = 4.9;
  portal.add(portalCore);
  const logoTexture = new THREE.TextureLoader().load("/perm-mark.png");
  logoTexture.colorSpace = THREE.SRGBColorSpace;
  disposableTextures.push(logoTexture);
  const logoSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: logoTexture, transparent: true, depthWrite: false }));
  logoSprite.position.set(0, 6.2, 0);
  logoSprite.scale.set(4.7, 4.7, 1);
  portal.add(logoSprite);
  animated.push((time) => {
    portalRings.forEach((ring, index) => {
      ring.rotation.z = time * (index % 2 ? -0.24 : 0.17) + index * 0.7;
    });
    logoSprite.position.y = 6.2 + Math.sin(time * 0.85) * 0.22;
  });

  // Route packets flow toward settlement and make the optimization legible.
  const particleCount = mobile ? 90 : 170;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleOffsets = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    particleOffsets[i] = Math.random();
    particlePositions[i * 3] = (Math.random() - 0.5) * 0.72;
    particlePositions[i * 3 + 1] = 0.55 + Math.random() * 0.32;
    particlePositions[i * 3 + 2] = 24 - particleOffsets[i] * 230;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x9fffe1,
    size: mobile ? 0.11 : 0.095,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);
  animated.push((time) => {
    const position = particleGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < particleCount; i++) {
      const travel = (particleOffsets[i] + time * 0.035) % 1;
      position.setZ(i, 24 - travel * 230);
      position.setX(i, Math.sin(travel * Math.PI * 8 + i) * 0.32);
    }
    position.needsUpdate = true;
  });

  // Sparse motes create scale without hiding copy.
  const moteCount = mobile ? 180 : 360;
  const moteData = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    moteData[i * 3] = (Math.random() - 0.5) * 100;
    moteData[i * 3 + 1] = 1 + Math.random() * 36;
    moteData[i * 3 + 2] = 45 - Math.random() * 310;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(moteData, 3));
  const motes = new THREE.Points(
    moteGeometry,
    new THREE.PointsMaterial({ color: 0x8bd8bf, size: 0.075, transparent: true, opacity: 0.36, depthWrite: false }),
  );
  scene.add(motes);

  // The positions intentionally pause at each product story.
  const keys: CameraKey[] = [
    { at: 0, position: V(0, 52, 100), look: V(0, 7, -125) },
    { at: 0.095, position: V(0, 16, 40), look: V(0, 4.5, -38) },
    { at: 0.19, position: V(0, 3.7, 12), look: V(0, 3.8, -34) },
    { at: 0.30, position: V(-1.2, 3.6, -24), look: V(12.5, 4.1, -30) },
    { at: 0.43, position: V(1.2, 3.6, -64), look: V(-12.5, 4.1, -70) },
    { at: 0.56, position: V(-1.2, 3.6, -104), look: V(12.5, 4.4, -110) },
    { at: 0.69, position: V(1.2, 3.6, -144), look: V(-12.5, 4.5, -150) },
    { at: 0.80, position: V(33, 30, -90), look: V(0, 1.5, -125) },
    { at: 0.91, position: V(0, 4.4, -169), look: V(0, 5.6, -202) },
    { at: 1, position: V(0, 4.2, -186), look: V(0, 6.2, -202) },
  ];

  const stops: SceneStop[] = [
    { n: "I", label: "Route", p: 0.30, a: 0.24 },
    { n: "II", label: "Rebate", p: 0.43, a: 0.37 },
    { n: "III", label: "Proof", p: 0.56, a: 0.50 },
    { n: "IV", label: "Hooks", p: 0.69, a: 0.63 },
    { n: "V", label: "Settle", p: 0.97, a: 0.88 },
  ];

  const cameraPosition = new THREE.Vector3();
  const cameraLook = new THREE.Vector3();
  const readCamera = (progress: number) => {
    let upper = 1;
    while (upper < keys.length && progress > keys[upper].at) upper++;
    if (upper >= keys.length) upper = keys.length - 1;
    const lower = Math.max(0, upper - 1);
    const first = keys[lower];
    const second = keys[upper];
    const span = Math.max(0.0001, second.at - first.at);
    const local = upper === lower ? 0 : smooth(clamp01((progress - first.at) / span));
    cameraPosition.lerpVectors(first.position, second.position, local);
    cameraLook.lerpVectors(first.look, second.look, local);
  };

  let target = 0;
  let current = 0;
  let frameId = 0;
  let disposed = false;
  let firstFrame = true;
  let pointerX = 0;
  let pointerY = 0;

  const onPointer = (event: PointerEvent) => {
    pointerX = (event.clientX / innerWidth - 0.5) * 2;
    pointerY = (event.clientY / innerHeight - 0.5) * 2;
  };
  addEventListener("pointermove", onPointer, { passive: true });

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = innerWidth / innerHeight < 0.78 ? 62 : 46;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize, { passive: true });
  resize();

  const render = () => {
    if (disposed) return;
    const delta = Math.min(clock.getDelta(), 0.12);
    const elapsed = clock.elapsedTime;
    const damping = reducedMotion ? 20 : 4.6;
    current += (target - current) * (1 - Math.exp(-delta * damping));
    if (Math.abs(target - current) < 0.00001) current = target;

    readCamera(current);
    const parallax = reducedMotion ? 0 : 1;
    camera.position.set(
      cameraPosition.x + pointerX * 0.17 * parallax,
      cameraPosition.y - pointerY * 0.08 * parallax + Math.sin(elapsed * 0.42) * 0.045 * parallax,
      cameraPosition.z,
    );
    camera.lookAt(cameraLook);
    sky.position.copy(camera.position);
    skyMaterial.uniforms.uTime.value = elapsed;
    routeLineMaterial.emissiveIntensity = 2.25 + Math.sin(elapsed * 1.2) * 0.35;
    if (!reducedMotion || firstFrame) animated.forEach((animate) => animate(elapsed));
    renderer.render(scene, camera);
    options.onProgress?.(current);
    if (firstFrame) firstFrame = false;
    frameId = requestAnimationFrame(render);
  };
  // The interface can become usable as soon as the world is constructed. The
  // first GPU frame may still compile for a moment on low-power devices.
  options.onReady?.();
  frameId = requestAnimationFrame(render);

  return {
    stops,
    setTarget(progress: number) {
      target = clamp01(progress);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onPointer);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => material?.dispose?.());
      });
      disposableTextures.forEach((texture) => texture.dispose());
      renderer.dispose();
    },
  };
}
