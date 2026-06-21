import * as THREE from 'three';
import { OrbitControls } from '/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '/three/examples/jsm/loaders/GLTFLoader.js';

const container = document.getElementById('app');
const seedInput = document.getElementById('seed');
const radiusInput = document.getElementById('radius');
const detailInput = document.getElementById('detail');
const roughnessInput = document.getElementById('roughness');
const waterInput = document.getElementById('water');
const generateButton = document.getElementById('generate');
const randomizeButton = document.getElementById('randomize');
const spaceshipModeButton = document.getElementById('spaceshipMode');
const toggleViewButton = document.getElementById('toggleView');
const toggleMenuButton = document.getElementById('toggleMenu');
const planetTypeInput = document.getElementById('planetType');
const ringTypeInput = document.getElementById('ringType');
const includeMoonInput = document.getElementById('includeMoon');
const asteroidCountInput = document.getElementById('asteroidCount');
const ringTypeLabel = document.getElementById('ringTypeLabel');
const hud = document.querySelector('.hud');
const radiusValue = document.getElementById('radiusValue');
const detailValue = document.getElementById('detailValue');
const roughnessValue = document.getElementById('roughnessValue');
const waterValue = document.getElementById('waterValue');
const asteroidCountValue = document.getElementById('asteroidCountValue');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060913);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 5000);
camera.position.set(0, 2.8, 6.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 30;

const ambientLight = new THREE.AmbientLight(0x446688, 0.35);
scene.add(ambientLight);

const fillLight = new THREE.DirectionalLight(0x4488bb, 0.15);
fillLight.position.set(-4, -2, -3);
scene.add(fillLight);

const stars = createStars(1500);
scene.add(stars);

let planetGroup = new THREE.Group();
scene.add(planetGroup);

let moonGroup = new THREE.Group();
scene.add(moonGroup);

const clock = new THREE.Clock();
const canvas = renderer.domElement;

// --- SPACESHIP MODE VARIABLES ---
let isSpaceshipMode = false;
let isFirstPerson = false;
let currentMaxPlanetRadius = 2.2;

const shipState = {
    thrust: 0,
    rotationSpeed: 0.015,
    maxSpeed: 0.2,
    acceleration: 0.005,
    drag: 0.998
};

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

canvas.addEventListener('click', () => {
    if (isSpaceshipMode && !document.pointerLockElement) {
        canvas.requestPointerLock();
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(spaceship.quaternion);

        euler.y -= movementX * 0.003;
        euler.x -= movementY * 0.003;

        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

        spaceship.quaternion.setFromEuler(euler);
    }
});

// --- STAR GENERATION & SHADERS ---
function generateStarProperties(seed) {
    const rng = mulberry32(seed + 12345);
    const classes = ['M', 'K', 'G', 'F', 'A', 'B', 'O'];

    const rand = rng();
    let classIndex;
    if (rand < 0.40) classIndex = 0;
    else if (rand < 0.70) classIndex = 1;
    else if (rand < 0.85) classIndex = 2;
    else if (rand < 0.95) classIndex = 3;
    else if (rand < 0.98) classIndex = 4;
    else if (rand < 0.995) classIndex = 5;
    else classIndex = 6;

    const selectedClass = classes[classIndex];

    const temps = { M: 3200, K: 4400, G: 5600, F: 6750, A: 8500, B: 20000, O: 33000 };
    const temp = temps[selectedClass] + (rng() - 0.5) * (temps[selectedClass] * 0.2);

    const radii = { M: 0.4, K: 0.8, G: 1.0, F: 1.3, A: 1.8, B: 4.0, O: 8.0 };
    const radius = radii[selectedClass] * (0.8 + rng() * 0.4);

    let color = new THREE.Color();
    if (temp < 3500) color.setRGB(1.0, 0.5, 0.2);
    else if (temp < 4500) color.setRGB(1.0, 0.7, 0.4);
    else if (temp < 5500) color.setRGB(1.0, 0.9, 0.7);
    else if (temp < 6500) color.setRGB(1.0, 1.0, 0.9);
    else if (temp < 8000) color.setRGB(0.9, 0.95, 1.0);
    else if (temp < 15000) color.setRGB(0.7, 0.8, 1.0);
    else color.setRGB(0.5, 0.6, 1.0);

    let darkColor = color.clone().multiplyScalar(0.3);

    return {
        class: selectedClass,
        temp: temp,
        radius: radius,
        color: color,
        darkColor: darkColor,
        name: `Star-${Math.floor(rng() * 999)}`
    };
}

let starProps = generateStarProperties(42);

const starLight = new THREE.DirectionalLight(starProps.color, 2.0);
starLight.position.set(80, 15, 0);
scene.add(starLight);

const starTarget = new THREE.Object3D();
starTarget.position.set(0, 0, 0);
scene.add(starTarget);
starLight.target = starTarget;

let starGroup = new THREE.Group();
scene.add(starGroup);
let starMesh;

function createStarMesh(props) {
    const visualRadius = props.radius * 4.0;
    const geo = new THREE.SphereGeometry(visualRadius, 64, 64);

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uBaseColor: { value: props.color },
            uDarkColor: { value: props.darkColor }
        },
        vertexShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uBaseColor;
            uniform vec3 uDarkColor;

            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            varying vec3 vPosition;

            vec3 hash3(vec3 p) {
                p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                         dot(p, vec3(269.5, 183.3, 246.1)),
                         dot(p, vec3(113.5, 271.9, 124.6)));
                return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
            }

            float noise(in vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                vec3 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(dot(hash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
                                   dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
                               mix(dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
                                   dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
                           mix(mix(dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
                                   dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
                               mix(dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
                                   dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
            }

            float fbm(vec3 p) {
                float f = 0.0;
                float amp = 0.5;
                for(int i=0; i<5; i++) {
                    f += amp * noise(p);
                    p *= 2.0;
                    amp *= 0.5;
                }
                return f;
            }

            void main() {
                vec3 pos = normalize(vPosition) * 4.0;
                float t = uTime * 0.05;

                float n1 = fbm(pos + vec3(t, 0.0, -t));
                float n2 = fbm(pos * 2.0 + vec3(-t, t, 0.0));
                float n3 = fbm(pos * 4.0 + vec3(t*0.5, -t*0.5, t*0.5));
                float n = (n1 + n2 * 0.5 + n3 * 0.25) / 1.75;

                float spots = smoothstep(0.3, 0.7, fbm(pos * 1.2 + vec3(0.0, t*0.2, 0.0)));

                vec3 hotColor = uBaseColor * 1.3;
                vec3 col = mix(uDarkColor, hotColor, smoothstep(-0.2, 0.5, n));
                col = mix(col, uDarkColor * 0.4, spots * 0.5);

                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                float limb = pow(max(0.0, dot(viewDir, normalize(vWorldNormal))), 0.4);
                col *= limb;

                gl_FragColor = vec4(col * 2.5, 1.0);
            }
        `
    });

    const mesh = new THREE.Mesh(geo, mat);

    const glowGeo = new THREE.SphereGeometry(visualRadius * 1.08, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
        uniforms: {
            uBaseColor: { value: props.color }
        },
        vertexShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform vec3 uBaseColor;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            void main() {
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                float fresnel = pow(1.0 - max(0.0, dot(viewDir, normalize(vWorldNormal))), 2.0);
                vec3 glow = uBaseColor * 2.5 * fresnel;
                gl_FragColor = vec4(glow, fresnel * 0.8);
            }
        `,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });

    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glowMesh);

    return mesh;
}

function buildStar() {
    if (starMesh) {
        starGroup.remove(starMesh);
        starMesh.geometry?.dispose();
        starMesh.material?.dispose();
        if (starMesh.children[0]) {
            starMesh.children[0].geometry?.dispose();
            starMesh.children[0].material?.dispose();
        }
    }

    starMesh = createStarMesh(starProps);
    starMesh.position.set(80, 15, 0);
    starGroup.add(starMesh);
}

buildStar();

// --- SPACESHIP MODEL ---
function createSpaceship() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.ConeGeometry(0.2, 1.0, 8);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa0a5b0, metalness: 0.7, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    const cockpitGeo = new THREE.SphereGeometry(0.15, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x224466, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.8 });
    const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
    cockpit.position.set(0, 0.1, 0.1);
    cockpit.rotation.x = -Math.PI / 2;
    group.add(cockpit);

    const wingGeo = new THREE.BoxGeometry(1.6, 0.05, 0.4);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x606570, metalness: 0.6, roughness: 0.4 });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.position.z = -0.2;
    group.add(wings);

    const tipGeo = new THREE.BoxGeometry(0.15, 0.3, 0.3);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff0000, emissiveIntensity: 0.8 });
    const tipL = new THREE.Mesh(tipGeo, tipMat);
    tipL.position.set(-0.8, 0, -0.2);
    group.add(tipL);
    const tipR = new THREE.Mesh(tipGeo, tipMat);
    tipR.position.set(0.8, 0, -0.2);
    group.add(tipR);

    const engineGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8);
    engineGeo.rotateX(Math.PI / 2);
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9, roughness: 0.1 });

    const engineL = new THREE.Mesh(engineGeo, engineMat);
    engineL.position.set(-0.4, -0.05, -0.5);
    group.add(engineL);

    const engineR = new THREE.Mesh(engineGeo, engineMat);
    engineR.position.set(0.4, -0.05, -0.5);
    group.add(engineR);

    const glowGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ccff });
    const glowL = new THREE.Mesh(glowGeo, glowMat);
    glowL.position.set(-0.4, -0.05, -0.65);
    group.add(glowL);

    const glowR = new THREE.Mesh(glowGeo, glowMat);
    glowR.position.set(0.4, -0.05, -0.65);
    group.add(glowR);

    group.scale.set(0.005, 0.005, 0.005);
    return group;
}

const spaceship = createSpaceship();
spaceship.visible = false;
scene.add(spaceship);

// --- FRIGATE PATROL SYSTEM ---
const SUN_POS = new THREE.Vector3(80, 15, 0);
const frigates = [];
const frigateLoader = new GLTFLoader();

function getSunCollisionRadius() {
    return (starProps ? starProps.radius * 4.0 : 10) + 2.0;
}

function getRandomPatrolPoint() {
    let pos;
    let attempts = 0;
    const sunRad = getSunCollisionRadius();

    while (attempts < 100) {
        const minR = currentMaxPlanetRadius + 2.0;
        const maxR = 120.0;
        const r = minR + Math.random() * (maxR - minR);

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const randY = (Math.random() - 0.5) * 0.5;

        pos = new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            randY,
            r * Math.cos(phi)
        );

        if (pos.distanceTo(SUN_POS) > sunRad + 5.0) {
            return pos;
        }
        attempts++;
    }
    return new THREE.Vector3(15, 5, 15);
}

function pickNewTarget(frigateData) {
    let target;
    let attempts = 0;
    const sunRad = getSunCollisionRadius();

    while (attempts < 50) {
        target = getRandomPatrolPoint();

        if (target.length() > currentMaxPlanetRadius + 2.0 && target.distanceTo(SUN_POS) > sunRad + 5.0) {
            break;
        }
        attempts++;
    }
    frigateData.target.copy(target);
}

frigateLoader.load('./cargo_spaceship.glb', (gltf) => {
    const baseModel = gltf.scene;
    baseModel.scale.set(0.00002, 0.00002, -0.00002);

    for (let i = 0; i < 5; i++) {
        const frigateMesh = baseModel.clone();
        scene.add(frigateMesh);

        const data = {
            mesh: frigateMesh,
            speed: 0.015 + Math.random() * 0.025,
            target: new THREE.Vector3(),
            turnThreshold: 1.0,
            modelForward: new THREE.Vector3(0, 0, 1)
        };

        data.mesh.position.copy(getRandomPatrolPoint());
        pickNewTarget(data);

        frigates.push(data);
    }
}, undefined, (err) => {
    console.error('Failed to load frigate.glb:', err);
});

function updateFrigates() {
    const planetCenter = new THREE.Vector3(0, 0, 0);
    const moonPos = moonGroup.position;
    const moonRad = moonGroup.userData.collisionRadius || 0;
    const sunRad = getSunCollisionRadius();

    for (const f of frigates) {
        const pos = f.mesh.position;
        const dir = new THREE.Vector3().subVectors(f.target, pos);
        const distToTarget = dir.length();

        if (distToTarget < f.turnThreshold) {
            pickNewTarget(f);
            dir.subVectors(f.target, pos);
        }

        dir.normalize();
        pos.addScaledVector(dir, f.speed);

        let collided = false;

        const distToPlanet = pos.distanceTo(planetCenter);
        const planetSafeRad = currentMaxPlanetRadius + 0.3;
        if (distToPlanet < planetSafeRad) {
            const normal = pos.clone().sub(planetCenter).normalize();
            pos.copy(planetCenter).addScaledVector(normal, planetSafeRad);
            collided = true;
        }

        if (moonRad > 0) {
            const distToMoon = pos.distanceTo(moonPos);
            const moonSafeRad = moonRad + 0.3;
            if (distToMoon < moonSafeRad) {
                const normal = pos.clone().sub(moonPos).normalize();
                pos.copy(moonPos).addScaledVector(normal, moonSafeRad);
                collided = true;
            }
        }

        const distToSun = pos.distanceTo(SUN_POS);
        if (distToSun < sunRad) {
            const normal = pos.clone().sub(SUN_POS).normalize();
            pos.copy(SUN_POS).addScaledVector(normal, sunRad);
            collided = true;
        }

        // Asteroid collision
        let asteroidHit = false;
        for (const belt of asteroidBelts) {
            for (const a of belt.asteroids) {
                const distToAsteroid = pos.distanceTo(a.mesh.position);
                const hitRadius = a.collisionRadius + 0.4;
                if (distToAsteroid < hitRadius) {
                    const normal = pos.clone().sub(a.mesh.position).normalize();
                    if (normal.lengthSq() < 0.0001) normal.set(0, 1, 0);
                    pos.copy(a.mesh.position).add(normal.multiplyScalar(hitRadius));
                    asteroidHit = true;
                    break;
                }
            }
            if (asteroidHit) break;
        }
        if (asteroidHit) {
            pickNewTarget(f);
            collided = true;
        }

        if (collided) {
            pickNewTarget(f);
        }

        const targetQuat = new THREE.Quaternion().setFromUnitVectors(f.modelForward, dir);
        f.mesh.quaternion.slerp(targetQuat, 0.05);
    }
}

spaceshipModeButton.addEventListener('click', () => {
    isSpaceshipMode = !isSpaceshipMode;
    spaceship.visible = isSpaceshipMode && !isFirstPerson;
    controls.enabled = !isSpaceshipMode;
    toggleViewButton.style.display = isSpaceshipMode ? '' : 'none';

    if (isSpaceshipMode) {
        spaceshipModeButton.textContent = 'Exit Spaceship';

        const startDist = currentMaxPlanetRadius * 1.2;
        spaceship.position.set(0, 0, startDist);
        spaceship.quaternion.identity();
        shipState.thrust = 0;

        canvas.requestPointerLock();

        document.querySelector('.hint').innerHTML = `
            <strong>Spaceship Controls:</strong><br>
            Mouse: Look around (Click canvas to lock)<br>
            E / R: Thrust / Reverse<br>
            ESC: Unlock mouse
        `;

        updateCameraNearPlane();
    } else {
        spaceshipModeButton.textContent = 'Spaceship Mode';
        isFirstPerson = false;
        toggleViewButton.textContent = 'First Person';

        if (document.pointerLockElement) document.exitPointerLock();

        camera.position.set(0, 2.8, 6.5);
        camera.lookAt(0, 0, 0);
        controls.enabled = true;
        controls.target.set(0, 0, 0);
        controls.update();

        document.querySelector('.hint').innerHTML = `
            Drag to orbit, scroll to zoom.<br>
            <strong>System Star:</strong> Class ${starProps.class} (${Math.round(starProps.temp)}K)
        `;

        updateCameraNearPlane();
    }
});

toggleViewButton.addEventListener('click', () => {
    isFirstPerson = !isFirstPerson;
    if (isFirstPerson) {
        toggleViewButton.textContent = 'Third Person';
        spaceship.visible = false;
    } else {
        toggleViewButton.textContent = 'First Person';
        spaceship.visible = true;
    }
});

// --- NOISE & MATH FUNCTIONS ---
function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }
function smoothstepEdge(edge0, edge1, value) {
    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return smoothstep(t);
}
function hash3(x, y, z, seed) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 0.001) * 43758.5453123;
    return s - Math.floor(s);
}

function valueNoise3(x, y, z, seed) {
    const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
    const xf = x - xi; const yf = y - yi; const zf = z - zi;
    const u = smoothstep(xf); const v = smoothstep(yf); const w = smoothstep(zf);

    const n000 = hash3(xi, yi, zi, seed); const n100 = hash3(xi + 1, yi, zi, seed);
    const n010 = hash3(xi, yi + 1, zi, seed); const n110 = hash3(xi + 1, yi + 1, zi, seed);
    const n001 = hash3(xi, yi, zi + 1, seed); const n101 = hash3(xi + 1, yi, zi + 1, seed);
    const n011 = hash3(xi, yi + 1, zi + 1, seed); const n111 = hash3(xi + 1, yi + 1, zi + 1, seed);

    const x00 = lerp(n000, n100, u); const x10 = lerp(n010, n110, u);
    const x01 = lerp(n001, n101, u); const x11 = lerp(n011, n111, u);

    const y0 = lerp(x00, x10, v); const y1 = lerp(x01, x11, v);
    return lerp(y0, y1, w);
}

function fbm3(x, y, z, seed, octaves = 5) {
    let total = 0, amplitude = 0.5, frequency = 1, normalizer = 0;
    for (let i = 0; i < octaves; i += 1) {
        total += valueNoise3(x * frequency, y * frequency, z * frequency, seed + i * 19.17) * amplitude;
        normalizer += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return total / normalizer;
}

function ridgeNoise3(x, y, z, seed, octaves = 4) {
    let total = 0, amplitude = 0.55, frequency = 1, normalizer = 0;
    for (let i = 0; i < octaves; i += 1) {
        const noise = valueNoise3(x * frequency, y * frequency, z * frequency, seed + i * 31.91);
        const ridge = 1 - Math.abs(noise * 2 - 1);
        total += ridge * amplitude;
        normalizer += amplitude;
        amplitude *= 0.55;
        frequency *= 2.2;
    }
    return total / normalizer;
}

function createStars(count) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
        const radius = 150 + Math.random() * 350;
        const theta = Math.acos(2 * Math.random() - 1);
        const phi = Math.random() * Math.PI * 2;
        positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
        positions[i * 3 + 1] = radius * Math.cos(theta);
        positions[i * 3 + 2] = radius * Math.sin(theta) * Math.sin(phi);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xb8d3ff, size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.9,
    });
    return new THREE.Points(geometry, material);
}

// --- PLANET GENERATION ---
function createPlanet({ seed, radius, detail, roughness, waterLevel }) {
    const rng = mulberry32(seed);
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const positionAttribute = geometry.attributes.position;
    const colors = new Float32Array(positionAttribute.count * 3);
    const color = new THREE.Color();

    const continentalScale = 1.05 + rng() * 0.7;
    const detailScale = 2.4 + rng() * 1.2;
    const mountainScale = 5.5 + rng() * 1.6;
    const moistureScale = 3.4 + rng() * 0.9;
    const oceanColor = new THREE.Color(0x0a3558);
    const coastColor = new THREE.Color(0xd8c68c);
    const desertColor = new THREE.Color(0xcda86a);
    const grassColor = new THREE.Color(0x568c49);
    const forestColor = new THREE.Color(0x2f663f);
    const rockColor = new THREE.Color(0x8c8176);
    const snow = new THREE.Color(0xf4f7fb);
    const seaRadius = radius + (waterLevel - 0.5) * roughness * 0.2;

    for (let i = 0; i < positionAttribute.count; i += 1) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i).normalize();
        const sample = vertex.clone();
        const latitude = Math.abs(sample.y);

        const continentNoise = fbm3(sample.x * continentalScale + seed * 0.01, sample.y * continentalScale + seed * 0.02, sample.z * continentalScale + seed * 0.03, seed + 100, 5);
        const continentMask = smoothstepEdge(0.44 - waterLevel * 0.05, 0.67 - waterLevel * 0.04, continentNoise);
        const detailNoise = fbm3(sample.x * detailScale + seed * 0.11, sample.y * detailScale + seed * 0.13, sample.z * detailScale + seed * 0.17, seed + 220, 4);
        const ridge = ridgeNoise3(sample.x * mountainScale + 100, sample.y * mountainScale + 200, sample.z * mountainScale + 300, seed + 800, 4);
        const moisture = fbm3(sample.x * moistureScale + 400, sample.y * moistureScale + 500, sample.z * moistureScale + 600, seed + 500, 4);

        const subtropicalBand = 1 - Math.min(1, Math.abs(latitude - 0.38) / 0.18);
        const mountainMask = Math.pow(continentMask, 1.6) * ridge * (0.4 + 0.6 * detailNoise);
        const landHeight = continentMask * roughness * (0.05 + detailNoise * 0.08 + mountainMask * 0.24);
        const oceanDepth = (1 - continentMask) * roughness * (0.09 + (1 - detailNoise) * 0.05);

        const finalRadius = seaRadius + landHeight - oceanDepth;
        positionAttribute.setXYZ(i, vertex.x * finalRadius, vertex.y * finalRadius, vertex.z * finalRadius);

        if (finalRadius < seaRadius - roughness * 0.01) {
            const depthFactor = THREE.MathUtils.clamp((seaRadius - finalRadius) / Math.max(roughness * 0.18, 0.0001), 0, 1);
            color.copy(oceanColor).lerp(new THREE.Color(0x041a2d), depthFactor);
        } else {
            const heightAboveSea = finalRadius - seaRadius;
            const beach = smoothstepEdge(-roughness * 0.008, roughness * 0.02, heightAboveSea);
            const mountainTint = smoothstepEdge(roughness * 0.09, roughness * 0.22, heightAboveSea);
            const polarIce = smoothstepEdge(0.58, 0.88, latitude) * smoothstepEdge(roughness * 0.02, roughness * 0.2, heightAboveSea);
            const desert = continentMask * subtropicalBand * smoothstepEdge(0.2, 0.74, 1 - moisture) * smoothstepEdge(0.0, roughness * 0.18, heightAboveSea);
            const vegetation = continentMask * (1 - desert) * (1 - polarIce);

            if (polarIce > 0.45) color.copy(snow).lerp(rockColor, mountainTint * 0.35);
            else if (desert > 0.5) {
                color.copy(coastColor).lerp(desertColor, desert);
                color.lerp(rockColor, mountainTint * 0.25);
            } else if (vegetation > 0.5) {
                const forestMix = THREE.MathUtils.clamp(moisture * 1.35 - 0.25, 0, 1);
                color.copy(grassColor).lerp(forestColor, forestMix);
                color.lerp(rockColor, mountainTint * 0.4);
            } else {
                color.copy(coastColor).lerp(grassColor, vegetation);
                color.lerp(rockColor, mountainTint * 0.3);
            }

            if (beach > 0.5) color.lerp(coastColor, THREE.MathUtils.clamp(1 - beach, 0, 1));
            if (finalRadius > seaRadius + roughness * 0.14 || polarIce > 0.55) {
                color.lerp(snow, THREE.MathUtils.clamp(mountainTint * 0.8 + polarIce * 0.5, 0, 1));
            }
        }

        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0.01 });
    const planet = new THREE.Mesh(geometry, material);

    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.035, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0x67b7ff, transparent: true, opacity: 0.08, side: THREE.BackSide })
    );

    const oceanMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uDeepColor: { value: new THREE.Color(0x7ab8d4) },
            uShallowColor: { value: new THREE.Color(0xc0e0f0) },
            uSunDirection: { value: new THREE.Vector3(80, 15, 0).normalize() },
            uSunColor: { value: starProps.color.clone() },
            uSunIntensity: { value: 2.0 + (starProps.temp / 30000) },
            uAmbientColor: { value: new THREE.Color(0x446688) },
            uAmbientIntensity: { value: 0.35 },
            uFillDirection: { value: fillLight.position.clone().normalize() },
            uFillColor: { value: new THREE.Color(0x4488bb) },
            uFillIntensity: { value: 0.15 },
        },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `
            uniform float uTime;
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;
            varying float vDepth;

            float wave(vec3 p) {
                float w1 = sin((p.x + p.z) * 10.0 + uTime * 1.6);
                float w2 = sin((p.x - p.y) * 13.0 - uTime * 1.1);
                float w3 = sin((p.z + p.y) * 17.0 + uTime * 1.9);
                return (w1 + w2 + w3) * 0.0028;
            }

            void main() {
                vec3 norm = normalize(position);
                vec4 baseWorldPos = modelMatrix * vec4(position, 1.0);
                float dist = distance(cameraPosition, baseWorldPos.xyz);
                float waveFade = clamp(1.0 - (dist - 5.0) / 15.0, 0.0, 1.0);
                float disp = wave(norm) * waveFade;
                vec3 displaced = position + norm * disp;

                vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
                vWorldPosition = worldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * norm);
                vDepth = abs(disp);
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uDeepColor;
            uniform vec3 uShallowColor;
            uniform vec3 uSunDirection;
            uniform vec3 uSunColor;
            uniform float uSunIntensity;
            uniform vec3 uAmbientColor;
            uniform float uAmbientIntensity;
            uniform vec3 uFillDirection;
            uniform vec3 uFillColor;
            uniform float uFillIntensity;
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;
            varying float vDepth;

            void main() {
                vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
                vec3 normal = normalize(vWorldNormal);
                vec3 sunDir  = normalize(uSunDirection);
                vec3 fillDir = normalize(uFillDirection);

                float depthFrac = clamp(vDepth * 80.0, 0.0, 1.0);
                vec3 baseColor = mix(uShallowColor, uDeepColor, depthFrac);

                float NdotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
                float fresnel = pow(1.0 - NdotV, 3.0);

                vec3 ambient = baseColor * uAmbientColor * uAmbientIntensity;
                float NdotL = max(dot(normal, sunDir), 0.0);
                vec3 diffuseLight = baseColor * uSunColor * uSunIntensity * NdotL * 0.318;

                float fillNdotL = max(dot(normal, fillDir), 0.0);
                vec3 fillDiffuse = baseColor * uFillColor * uFillIntensity * fillNdotL * 0.318;

                vec3 halfDir = normalize(sunDir + viewDirection);
                float NdotH = max(dot(normal, halfDir), 0.0);
                float specular = pow(NdotH, 256.0);
                vec3 specularLight = uSunColor * specular * uSunIntensity * (1.0 + fresnel * 2.0);

                vec3 finalColor = ambient + diffuseLight + fillDiffuse + specularLight;
                float rim = pow(1.0 - NdotV, 2.0);
                finalColor += vec3(0.3, 0.5, 0.8) * rim * 0.15;

                float alpha = 0.4 + 0.5 * (1.0 - depthFrac * depthFrac);
                alpha = max(alpha, fresnel * 0.35);

                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
    });

    const oceanLayer = new THREE.Mesh(new THREE.SphereGeometry(seaRadius * 1.0025, 96, 96), oceanMaterial);
    const group = new THREE.Group();
    group.add(planet, oceanLayer, atmosphere);
    group.userData.oceanMaterial = oceanMaterial;
    return group;
}

function createAsteroid({ seed, radius, detail, roughness }) {
    const rng = mulberry32(seed + 555555);
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const positionAttribute = geometry.attributes.position;
    const colors = new Float32Array(positionAttribute.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < positionAttribute.count; i += 1) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i).normalize();
        const noise = fbm3(vertex.x * roughness * 2 + seed * 0.1, vertex.y * roughness * 2 + seed * 0.2, vertex.z * roughness * 2 + seed * 0.3, seed + 555555, 4);
        const displacement = (noise - 0.5) * roughness * 0.5;
        const finalRadius = radius + displacement;
        positionAttribute.setXYZ(i, vertex.x * finalRadius, vertex.y * finalRadius, vertex.z * finalRadius);

        const gray = 0.4 + noise * 0.6;
        color.setRGB(gray, gray, gray);
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const asteroid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1 }));
    return asteroid;
}

function createMoon({ seed, radius, detail, roughness }) {
    const rng = mulberry32(seed + 999999);
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const positionAttribute = geometry.attributes.position;
    const colors = new Float32Array(positionAttribute.count * 3);
    const color = new THREE.Color();

    const craterScale = 3.2 + rng() * 1.5;
    const detailScale = 6.8 + rng() * 2.2;
    const largeCraterScale = 1.4 + rng() * 0.8;

    const darkGray = new THREE.Color(0x3a3a3a);
    const midGray = new THREE.Color(0x6b6b6b);
    const lightGray = new THREE.Color(0x9a9a9a);
    const brightGray = new THREE.Color(0xb8b8b8);

    for (let i = 0; i < positionAttribute.count; i += 1) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i).normalize();
        const sample = vertex.clone();

        const largeTerrain = fbm3(sample.x * largeCraterScale + seed * 0.05, sample.y * largeCraterScale + seed * 0.07, sample.z * largeCraterScale + seed * 0.09, seed + 1000, 4);
        const craterNoise = fbm3(sample.x * craterScale + seed * 0.15, sample.y * craterScale + seed * 0.17, sample.z * craterScale + seed * 0.19, seed + 1200, 5);
        const craters = 1 - Math.abs(craterNoise * 2 - 1);
        const detailNoise = fbm3(sample.x * detailScale + seed * 0.25, sample.y * detailScale + seed * 0.27, sample.z * detailScale + seed * 0.29, seed + 1400, 3);

        const terrainHeight = largeTerrain * 0.6 + craters * 0.3 + detailNoise * 0.1;
        const displacement = (terrainHeight - 0.5) * roughness * 0.15;
        const finalRadius = radius + displacement;

        positionAttribute.setXYZ(i, vertex.x * finalRadius, vertex.y * finalRadius, vertex.z * finalRadius);

        const heightFactor = THREE.MathUtils.clamp((displacement / (roughness * 0.15) + 0.5), 0, 1);
        if (heightFactor < 0.35) color.copy(darkGray).lerp(midGray, heightFactor / 0.35);
        else if (heightFactor < 0.65) color.copy(midGray).lerp(lightGray, (heightFactor - 0.35) / 0.3);
        else color.copy(lightGray).lerp(brightGray, (heightFactor - 0.65) / 0.35);

        const craterDarkening = craters * 0.15;
        color.multiplyScalar(1 - craterDarkening);

        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const moon = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 }));
    return moon;
}

// --- GAS GIANT GENERATION ---
function generateGasGiantColors(seed) {
    const rng = mulberry32(seed);
    const typeRand = rng();

    let hueRange, satRange, lightRange, typeName;
    if (typeRand < 0.28) {
        hueRange = [18, 48]; satRange = [0.40, 0.70]; lightRange = [0.30, 0.60]; typeName = 'Jovian';
    } else if (typeRand < 0.52) {
        hueRange = [32, 55]; satRange = [0.45, 0.75]; lightRange = [0.35, 0.62]; typeName = 'Saturnian';
    } else if (typeRand < 0.72) {
        hueRange = [205, 240]; satRange = [0.55, 0.85]; lightRange = [0.30, 0.58]; typeName = 'Neptunian';
    } else if (typeRand < 0.88) {
        hueRange = [155, 200]; satRange = [0.40, 0.75]; lightRange = [0.32, 0.60]; typeName = 'Ice Giant';
    } else {
        const exotic = rng();
        if (exotic < 0.5) { hueRange = [85, 150]; satRange = [0.45, 0.80]; lightRange = [0.30, 0.55]; }
        else { hueRange = [280, 330]; satRange = [0.40, 0.70]; lightRange = [0.32, 0.58]; }
        typeName = 'Exotic';
    }

    const colors = [];
    for (let i = 0; i < 4; i += 1) {
        const h = (hueRange[0] + rng() * (hueRange[1] - hueRange[0])) / 360;
        const s = satRange[0] + rng() * (satRange[1] - satRange[0]);
        const l = lightRange[0] + rng() * (lightRange[1] - lightRange[0]);
        colors.push(new THREE.Color().setHSL(h, s, l));
    }
    return { colors, typeName };
}

function createGasGiant({ seed, radius, detail, hasRings }) {
    const rng = mulberry32(seed);
    const { colors } = generateGasGiantColors(seed);
    const stormStrength = 0.15 + rng() * 0.75;
    const segments = Math.max(48, Math.min(192, detail * 16));

    const bodyGeo = new THREE.SphereGeometry(radius, segments, segments);
    const bodyMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor1: { value: colors[0] },
            uColor2: { value: colors[1] },
            uColor3: { value: colors[2] },
            uColor4: { value: colors[3] },
            uStormStrength: { value: stormStrength },
            uSeed: { value: seed },
            uSunDirection: { value: new THREE.Vector3(80, 15, 0).normalize() },
            uRotate: { value: 1.0 }
        },
        vertexShader: `
            varying vec3 vPosition;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            void main() {
                vPosition = position;
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform vec3 uColor3;
            uniform vec3 uColor4;
            uniform float uStormStrength;
            uniform float uSeed;
            uniform vec3 uSunDirection;
            uniform float uRotate;
            varying vec3 vPosition;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;

            vec3 hash3(vec3 p) {
                p = vec3(
                    dot(p, vec3(127.1, 311.7, 74.7)),
                    dot(p, vec3(269.5, 183.3, 246.1)),
                    dot(p, vec3(113.5, 271.9, 124.6))
                );
                return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
            }

            float noise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                vec3 u = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(
                        mix( dot(hash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
                             dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x ),
                        mix( dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
                             dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x ), u.y ),
                    mix(
                        mix( dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
                             dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x ),
                        mix( dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
                             dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x ), u.y ), u.z );
            }

            float fbm(vec3 p) {
                float f = 0.0;
                float amp = 0.5;
                for (int i = 0; i < 5; i++) {
                    f += amp * noise(p);
                    p *= 2.0;
                    amp *= 0.5;
                }
                return f;
            }

            void main() {
                vec3 norm = normalize(vPosition);
                float lat = norm.y;
                float absLat = abs(lat);

                float rotationSpeed = 0.025 + (1.0 - absLat) * 0.07;
                float angle = uTime * rotationSpeed * uRotate;
                float ca = cos(angle);
                float sa = sin(angle);

                vec3 samplePos = vec3(
                    norm.x * ca - norm.z * sa,
                    lat,
                    norm.x * sa + norm.z * ca
                );

                float driftT = uTime * 0.014;
                vec3 warpSeed1 = samplePos * 2.0 + vec3(driftT * 0.9, driftT * 0.3, -driftT * 0.6) + vec3(uSeed * 0.01);
                float warp1 = fbm(warpSeed1) * 0.26;

                float driftT2 = uTime * 0.028;
                vec3 warpSeed2 = samplePos * 5.0 + vec3(-driftT2 * 0.5, 0.0, driftT2 * 0.7) + vec3(uSeed * 0.03);
                float warp2 = fbm(warpSeed2) * 0.09;

                float warpedLat = lat + warp1 + warp2;

                float pocketT = uTime * 0.020;
                float pocket = fbm(samplePos * 3.2 + vec3(pocketT, -pocketT * 0.8, pocketT * 0.5));
                float pocketMask = abs(sin(warpedLat * 16.0));
                warpedLat += pocket * 0.07 * pocketMask;

                float b_primary   = sin(warpedLat * 16.0) * 0.5 + 0.5;
                float b_secondary = sin(warpedLat *  9.0 + 1.1) * 0.5 + 0.5;
                float b_fine      = sin(warpedLat * 30.0 + 0.3) * 0.5 + 0.5;

                vec3 color = mix(uColor1, uColor2, b_primary);
                color = mix(color, uColor3, b_secondary * 0.55);
                color = mix(color, uColor4, b_fine * 0.22);

                float bandEdge = 1.0 - abs(sin(warpedLat * 16.0));
                float jetT = uTime * 1.4;
                float edgeTurb = fbm(samplePos * 9.0 + vec3(jetT, 0.0, jetT * 0.4));
                color += mix(uColor2, uColor1, b_secondary) * bandEdge * edgeTurb * 0.20;

                float shearT = uTime * 0.9;
                float shear = fbm(samplePos * 14.0 + vec3(shearT * 1.1, 0.0, -shearT * 0.6)) * 0.5 + 0.5;
                float shearMask = b_fine * (1.0 - b_primary) * 0.5;
                color = mix(color, mix(uColor3, uColor4, shear), shearMask * 0.28);

                float sa1 = fract(uSeed * 0.000173) * 6.28318;
                float sa2 = fract(uSeed * 0.000379) * 6.28318;
                float sa3 = fract(uSeed * 0.000612) * 6.28318;
                float sa4 = fract(uSeed * 0.000891) * 6.28318;
                float sl1 = fract(uSeed * 0.000251) * 2.0 - 1.0;
                float sl2 = fract(uSeed * 0.000437) * 2.0 - 1.0;
                float sl3 = fract(uSeed * 0.000583) * 2.0 - 1.0;
                float sl4 = fract(uSeed * 0.000719) * 2.0 - 1.0;

                vec3 grs_dir = normalize(vec3(cos(sa1), -0.30 + sl1 * 0.08, sin(sa1)));
                float d1 = acos(clamp(dot(samplePos, grs_dir), -1.0, 1.0)) / 3.14159;

                vec3 toCenter1 = normalize(grs_dir - dot(samplePos, grs_dir) * samplePos);
                vec3 tangent1  = normalize(cross(samplePos, toCenter1));
                float grsRotT = uTime * 0.55;
                float swirlAmt1 = smoothstep(0.22, 0.0, d1) * 2.5 + grsRotT;
                vec3 swirled1 = samplePos
                    + tangent1  * sin(swirlAmt1) * 0.22
                    + toCenter1 * (1.0 - cos(swirlAmt1)) * 0.08;

                float s1_noise = fbm(swirled1 * 5.0 + vec3(uTime * 0.45, 0.0, uTime * 0.28));
                float s1_mask  = smoothstep(0.20, 0.0, d1) * (0.35 + 0.65 * s1_noise);
                vec3  s1_col   = mix(uColor4, vec3(0.88, 0.32, 0.12), 0.65);
                color = mix(color, s1_col, s1_mask * uStormStrength * 0.90);

                vec3 ov_dir = normalize(vec3(cos(sa2), 0.30 + sl2 * 0.10, sin(sa2)));
                float d2 = acos(clamp(dot(samplePos, ov_dir), -1.0, 1.0)) / 3.14159;

                vec3 toCenter2 = normalize(ov_dir - dot(samplePos, ov_dir) * samplePos);
                vec3 tangent2  = normalize(cross(samplePos, toCenter2));
                float ovalRotT = -uTime * 0.40;
                float swirlAmt2 = smoothstep(0.13, 0.0, d2) * 2.0 + ovalRotT;
                vec3 swirled2 = samplePos
                    + tangent2  * sin(swirlAmt2) * 0.15
                    + toCenter2 * (1.0 - cos(swirlAmt2)) * 0.06;

                float s2_noise = fbm(swirled2 * 7.0 + vec3(uTime * 0.55, 0.0, -uTime * 0.38));
                float s2_mask  = smoothstep(0.12, 0.0, d2) * (0.3 + 0.7 * s2_noise);
                vec3  s2_col   = mix(uColor2, vec3(0.96, 0.93, 0.88), 0.88);
                color = mix(color, s2_col, s2_mask * uStormStrength * 0.70);

                vec3 dk_dir = normalize(vec3(cos(sa3), 0.48 + sl3 * 0.07, sin(sa3)));
                float d3 = acos(clamp(dot(samplePos, dk_dir), -1.0, 1.0)) / 3.14159;
                vec3 toCenter3 = normalize(dk_dir - dot(samplePos, dk_dir) * samplePos);
                vec3 tangent3  = normalize(cross(samplePos, toCenter3));
                float darkRotT = uTime * 0.85;
                float swirlAmt3 = smoothstep(0.08, 0.0, d3) * 3.0 + darkRotT;
                vec3 swirled3 = samplePos
                    + tangent3 * sin(swirlAmt3) * 0.10
                    + toCenter3 * (1.0 - cos(swirlAmt3)) * 0.04;
                float s3_noise = fbm(swirled3 * 8.0 + vec3(uTime * 0.70, 0.0, uTime * 0.45));
                float s3_mask  = smoothstep(0.08, 0.0, d3) * (0.2 + 0.8 * s3_noise);
                color = mix(color, uColor1 * 0.45, s3_mask * uStormStrength * 0.55);

                vec3 sp_dir = normalize(vec3(cos(sa4), -0.52 + sl4 * 0.10, sin(sa4)));
                float d4 = acos(clamp(dot(normalize(samplePos), sp_dir), -1.0, 1.0)) / 3.14159;

                vec3 toCenter4 = normalize(sp_dir - dot(normalize(samplePos), sp_dir) * normalize(samplePos));
                vec3 tangent4  = normalize(cross(normalize(samplePos), toCenter4));

                float fastTime   = uTime * 14.0;
                float swirlAng4  = smoothstep(0.075, 0.0, d4) * 6.0 + fastTime;
                vec3  swirled4   = samplePos
                    + tangent4  * sin(swirlAng4) * d4 * 0.5
                    + toCenter4 * (cos(swirlAng4) - 1.0) * d4 * 0.15;

                float sp_n1 = fbm(swirled4 * 12.0 + vec3(fastTime * 0.28, 0.0, fastTime * 0.18));
                float sp_n2 = fbm(swirled4 * 24.0 - vec3(0.0, fastTime * 0.40, fastTime * 0.12));
                float sp_noise = sp_n1 * 0.60 + sp_n2 * 0.40;

                float s4_mask = smoothstep(0.065, 0.0, d4) * (0.28 + 0.72 * sp_noise);
                vec3 sp_core = mix(vec3(1.00, 0.88, 0.62), vec3(0.90, 0.95, 1.00), smoothstep(0.03, 0.0, d4));
                color = mix(color, sp_core, s4_mask * uStormStrength * 0.95);

                vec3 worldNorm = normalize(vWorldNormal);
                vec3 lightDir  = normalize(uSunDirection);
                float NdotL    = max(dot(worldNorm, lightDir), 0.0);
                float ambient  = 0.20;

                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                float NdotV  = max(dot(worldNorm, viewDir), 0.0);
                float rim = pow(1.0 - NdotV, 2.5);

                vec3 finalColor = color * (ambient + NdotL * 0.80);
                finalColor += color * rim * 0.30;
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });

    const body = new THREE.Mesh(bodyGeo, bodyMat);

    const atmoColor = new THREE.Color().copy(colors[0]).lerp(colors[1], 0.5);
    const atmoColor2 = new THREE.Color().copy(colors[2]).lerp(colors[3], 0.4);
    const atmosphereMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime:   { value: 0 },
            uColor1: { value: atmoColor },
            uColor2: { value: atmoColor2 },
            uSeed:   { value: seed }
        },
        vertexShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3  uColor1;
            uniform vec3  uColor2;
            uniform float uSeed;
            varying vec3  vWorldNormal;
            varying vec3  vWorldPosition;
            varying vec3  vPosition;

            vec3 hash3v(vec3 p) {
                p = vec3(dot(p,vec3(127.1,311.7,74.7)),
                         dot(p,vec3(269.5,183.3,246.1)),
                         dot(p,vec3(113.5,271.9,124.6)));
                return -1.0 + 2.0*fract(sin(p)*43758.5453123);
            }
            float noise(vec3 p){
                vec3 i=floor(p); vec3 f=fract(p);
                vec3 u=f*f*(3.0-2.0*f);
                return mix(mix(mix(dot(hash3v(i+vec3(0,0,0)),f-vec3(0,0,0)),dot(hash3v(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                               mix(dot(hash3v(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hash3v(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
                           mix(mix(dot(hash3v(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hash3v(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                               mix(dot(hash3v(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hash3v(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
            }
            float fbm(vec3 p){
                float f=0.0; float a=0.5;
                for(int i=0;i<4;i++){f+=a*noise(p);p*=2.0;a*=0.5;}
                return f;
            }

            void main() {
                vec3 norm = normalize(vPosition);
                float lat  = norm.y;
                float absLat = abs(lat);

                float hazeT = uTime * 0.018;
                float ca = cos(hazeT); float sa = sin(hazeT);
                vec3 sp = vec3(norm.x*ca - norm.z*sa, lat, norm.x*sa + norm.z*ca);

                float wT1 = uTime * 0.011;
                float w1 = fbm(sp * 2.1 + vec3(wT1 * 0.8, wT1 * 0.4, -wT1 * 0.6) + vec3(uSeed * 0.007));
                float wT2 = uTime * 0.022;
                float w2 = fbm(sp * 4.8 + vec3(-wT2 * 0.5, 0.0, wT2 * 0.9) + vec3(uSeed * 0.013));
                float warpedLat = lat + w1 * 0.20 + w2 * 0.08;

                float bandAlign = abs(sin(warpedLat * 16.0));
                float hazeNoise = fbm(sp * 5.5 + vec3(uTime * 0.03, 0.0, uTime * 0.02)) * 0.5 + 0.5;
                float haze = bandAlign * hazeNoise;

                vec3 hazeCol = mix(uColor1, uColor2, hazeNoise * 0.6);

                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                float NdotV  = max(dot(normalize(vWorldNormal), viewDir), 0.0);
                float fresnel = pow(1.0 - NdotV, 2.2);

                float alpha = haze * fresnel * 0.22 + fresnel * 0.05;
                alpha *= (1.0 - absLat * 0.5);
                alpha = clamp(alpha, 0.0, 0.30);

                gl_FragColor = vec4(hazeCol, alpha);
            }
        `,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.04, 48, 48),
        atmosphereMat
    );

    const group = new THREE.Group();
    group.add(body, atmosphere);
    group.userData.bodyMaterial = bodyMat;
    group.userData.atmosphereMaterial = atmosphereMat;
    group.userData.isGasGiant = true;
    group.userData.rotateUniform = bodyMat.uniforms.uRotate;

    if (hasRings) {
        const rings = createRings({ seed: seed, innerRadius: radius * 1.5, outerRadius: radius * 2.4 });
        group.add(rings);
    }

    return group;
}

function createRings({ seed, innerRadius, outerRadius }) {
    const rng = mulberry32(seed + 888888);

    const baseHue = (18 + rng() * 40) / 360;
    const color1 = new THREE.Color().setHSL(baseHue, 0.35 + rng() * 0.30, 0.32 + rng() * 0.18);
    const color2 = new THREE.Color().setHSL(baseHue + 0.04, 0.28 + rng() * 0.25, 0.52 + rng() * 0.18);
    const color3 = new THREE.Color().setHSL(baseHue - 0.02, 0.20 + rng() * 0.20, 0.62 + rng() * 0.14);

    const tiltX = (rng() - 0.5) * 0.30;
    const tiltZ = (rng() - 0.5) * 0.30;

    const gap1 = 0.38 + rng() * 0.10;
    const gap2 = 0.58 + rng() * 0.08;
    const gap3 = 0.80 + rng() * 0.08;

    const ringGeo = new THREE.RingGeometry(innerRadius, outerRadius, 256, 12);
    ringGeo.rotateX(-Math.PI / 2);

    const ringMat = new THREE.ShaderMaterial({
        uniforms: {
            uColor1: { value: color1 },
            uColor2: { value: color2 },
            uColor3: { value: color3 },
            uSeed: { value: seed },
            uGap1: { value: gap1 },
            uGap2: { value: gap2 },
            uGap3: { value: gap3 },
            uInnerR: { value: innerRadius },
            uOuterR: { value: outerRadius }
        },
        vertexShader: `
            varying vec3 vLocalPos;
            varying vec2 vUv;
            void main() {
                vLocalPos = position;
                vUv = uv;
                gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3  uColor1;
            uniform vec3  uColor2;
            uniform vec3  uColor3;
            uniform float uSeed;
            uniform float uGap1;
            uniform float uGap2;
            uniform float uGap3;
            uniform float uInnerR;
            uniform float uOuterR;
            varying vec3  vLocalPos;
            varying vec2  vUv;

            float hash(float n) { return fract(sin(n) * 43758.5453); }
            float noise1D(float x) {
                float i = floor(x);
                float f = fract(x);
                f = f * f * (3.0 - 2.0 * f);
                return mix(hash(i), hash(i + 1.0), f);
            }
            float noise2D(vec2 p) {
                vec2 i = floor(p); vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i.x + i.y * 57.0);
                float b = hash(i.x + 1.0 + i.y * 57.0);
                float c = hash(i.x + (i.y + 1.0) * 57.0);
                float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            void main() {
                float trueRadius = length(vLocalPos.xz);
                float r = clamp((trueRadius - uInnerR) / (uOuterR - uInnerR), 0.0, 1.0);

                float rl1 = sin(r * 160.0) * 0.5 + 0.5;
                float rl2 = sin(r * 320.0 + 0.7) * 0.5 + 0.5;
                float rl3 = sin(r *  55.0 - 1.2) * 0.5 + 0.5;
                float ringlets = rl1 * 0.55 + rl2 * 0.25 + rl3 * 0.20;

                float cRing      = smoothstep(0.0, 0.04, r) * smoothstep(uGap1 + 0.02, uGap1 - 0.01, r) * 0.42;
                float bRing      = smoothstep(uGap1-0.01, uGap1 + 0.03, r) * smoothstep(uGap2 + 0.02, uGap2 - 0.01, r);
                float cassiniGap = 1.0 - smoothstep(uGap2 - 0.012, uGap2, r)
                                       * smoothstep(uGap2 + 0.028, uGap2 + 0.014, r);
                float aRing      = smoothstep(uGap2+0.014, uGap2 + 0.04, r) * smoothstep(uGap3 + 0.01, uGap3 - 0.01, r) * 0.72;
                float fRing      = smoothstep(uGap3 - 0.01, uGap3 + 0.02, r) * smoothstep(1.0, 0.97, r) * 0.26;
                float zoneDensity = (cRing + bRing + aRing + fRing) * cassiniGap;

                float angle  = atan(vLocalPos.z, vLocalPos.x);
                float angVar = noise2D(vec2(angle * 3.0, r * 4.0)) * 0.10 + 0.90;
                float radVar = noise1D(r * 30.0 + uSeed * 0.001) * 0.12 + 0.88;

                float finalDensity = (ringlets * 0.60 + zoneDensity * 0.40) * angVar * radVar;

                vec3 ringColor = mix(uColor1, uColor2, r);
                ringColor = mix(ringColor, uColor3, bRing * 0.50);
                ringColor *= 0.45 + ringlets * 0.55;

                float innerFade = smoothstep(0.0, 0.12, r);
                float outerFade = smoothstep(1.0, 0.88, r);
                float outerDim  = 1.0 - smoothstep(0.75, 1.0, r) * 0.40;
                float alpha = clamp(finalDensity * innerFade * outerFade * outerDim, 0.0, 0.93);

                gl_FragColor = vec4(ringColor, alpha);
            }
        `,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.renderOrder = 1;

    const ringPointsGeo = new THREE.BufferGeometry();
    const ringPointsCount = 60000;
    const positions = new Float32Array(ringPointsCount * 3);
    const ringWidth = outerRadius - innerRadius;

    for (let i = 0; i < ringPointsCount; i++) {
        const theta = Math.PI * 2.0 * Math.random();
        const r = innerRadius + Math.random() * ringWidth;
        const yScatter = (Math.random() - 0.5) * ringWidth * 0.012;
        positions[i * 3 + 0] = r * Math.cos(theta);
        positions[i * 3 + 1] = yScatter;
        positions[i * 3 + 2] = r * Math.sin(theta);
    }

    ringPointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const ringPointsMat = new THREE.PointsMaterial({
        color: color2.clone().lerp(color3, 0.4),
        size: 0.018,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    const ringPoints = new THREE.Points(ringPointsGeo, ringPointsMat);
    ringPoints.renderOrder = 2;

    const ringGroup = new THREE.Group();
    ringGroup.rotation.x = tiltX;
    ringGroup.rotation.z = tiltZ;
    ringGroup.add(ringMesh);
    ringGroup.add(ringPoints);

    return ringGroup;
}

// --- ASTEROID SYSTEM (auto-distributed) ---
let asteroidBelts = [];

function createOrbitalAsteroid({ seed, radius, detail, roughness, orbitRadius, orbitSpeed, orbitPhase, inclination, eccentricity, rotationAxis, rotationSpeed, center }) {
    const mesh = createAsteroid({ seed, radius, detail, roughness });
    return {
        mesh,
        collisionRadius: radius * 1.3,
        orbitRadius, orbitSpeed, orbitPhase, inclination, eccentricity, rotationAxis, rotationSpeed,
        center: center ? center.clone() : new THREE.Vector3(0, 0, 0)
    };
}

function createAsteroidBelt({ seed, count, innerRadius, outerRadius, inclinationSpread = 0.18, center, sizeScale = 1.0 }) {
    const rng = mulberry32(seed);
    const group = new THREE.Group();
    const asteroids = [];
    const beltCenter = center ? center.clone() : new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < count; i++) {
        const orbitRadius = innerRadius + rng() * (outerRadius - innerRadius);
        const baseSpeed = 0.085;
        const orbitSpeed = (baseSpeed / Math.sqrt(orbitRadius)) * (0.65 + rng() * 0.7);
        const orbitPhase = rng() * Math.PI * 2;
        const inclination = (rng() - 0.5) * inclinationSpread;
        const eccentricity = rng() * 0.10;
        const rotationAxis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        const rotationSpeed = (rng() - 0.5) * 0.04;

        let radius;
        const sizeRoll = rng();
        if (sizeRoll < 0.60) radius = (0.025 + rng() * 0.035) * sizeScale;
        else if (sizeRoll < 0.90) radius = (0.060 + rng() * 0.060) * sizeScale;
        else radius = (0.120 + rng() * 0.100) * sizeScale;

        const detail = radius < 0.06 ? 1 : 2;
        const roughness = 0.5 + rng() * 0.4;

        const data = createOrbitalAsteroid({
            seed: seed * 1000 + i * 17,
            radius, detail, roughness,
            orbitRadius, orbitSpeed, orbitPhase, inclination, eccentricity,
            rotationAxis, rotationSpeed,
            center: beltCenter
        });

        data.mesh.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
        group.add(data.mesh);
        asteroids.push(data);
    }

    return { type: 'belt', group, asteroids, seed };
}

// Sparse 3D cluster of asteroids placed at a random point in the system.
// Each rock self-rotates; the patch itself stays roughly where it's placed.
function createAsteroidField({ seed, count }) {
    const rng = mulberry32(seed);
    const group = new THREE.Group();
    const asteroids = [];

    // Pick a random center in space, away from both the planet and the star
    const sunRad = getSunCollisionRadius();
    let centerX = 0, centerY = 0, centerZ = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
        const r = 20 + rng() * 100;          // 20..110 from planet
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(2 * rng() - 1);
        const cx = r * Math.sin(phi) * Math.cos(theta);
        const cy = r * Math.sin(phi) * Math.sin(theta) * 0.02; // slightly flatter
        const cz = r * Math.cos(phi);

        const distToPlanet = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const dx = cx - SUN_POS.x, dy = cy - SUN_POS.y, dz = cz - SUN_POS.z;
        const distToStar = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distToPlanet > currentMaxPlanetRadius + 15 && distToStar > sunRad + 15) {
            centerX = cx; centerY = cy; centerZ = cz;
            break;
        }
    }
    group.position.set(centerX, centerY, centerZ);

    // Field size scales with count
    const fieldSize = 20 + count * 1.2;

    for (let i = 0; i < count; i++) {
        const radius = 0.05 + rng() * 0.18;
        const detail = radius < 0.1 ? 1 : 2;
        const roughness = 0.5 + rng() * 0.4;

        const x = (rng() - 0.5) * fieldSize;
        const y = (rng() - 0.5) * fieldSize * 0.6;
        const z = (rng() - 0.5) * fieldSize;

        const mesh = createAsteroid({ seed: seed * 1000 + i * 17, radius, detail, roughness });
        mesh.position.set(x, y, z);
        mesh.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);

        const rotationAxis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        const rotationSpeed = (rng() - 0.5) * 0.02;

        group.add(mesh);
        asteroids.push({
            mesh,
            rotationAxis,
            rotationSpeed,
            collisionRadius: radius * 1.3
        });
    }

    return { type: 'field', group, asteroids, seed };
}

function buildAsteroids(settings) {
    // Dispose old belts/fields
    for (const belt of asteroidBelts) {
        scene.remove(belt.group);
        for (const a of belt.asteroids) {
            a.mesh.geometry?.dispose();
            a.mesh.material?.dispose();
        }
    }
    asteroidBelts = [];

    if (settings.asteroidCount <= 0) return;

    const total = settings.asteroidCount;

    // Auto-distribution:
    //   50%  → belt around the star
    //   20%  → weak belt around the planet
    //   30%  → split between 2 random fields
    let starCount, planetCount, fieldsTotal;
    if (total < 10) {
        starCount = total;
        planetCount = 0;
        fieldsTotal = 0;
    } else {
        starCount = Math.max(1, Math.floor(total * 0.5));
        planetCount = Math.max(0, Math.floor(total * 0.2));
        fieldsTotal = total - starCount - planetCount;
    }

    // 1) Star belt — orbits the sun
    if (starCount > 0) {
        const starBelt = createAsteroidBelt({
            seed: settings.seed * 31,
            count: starCount,
            innerRadius: starProps.radius * 6.0 + 0.6,
            outerRadius: starProps.radius * 6.5 + 2.0,
            inclinationSpread: 0.18,
            center: SUN_POS.clone()
        });
        scene.add(starBelt.group);
        asteroidBelts.push(starBelt);
    }

    // 2) Planet belt — weak/sparse, orbits the planet
    /* if (planetCount > 0) {
        const planetBelt = createAsteroidBelt({
            seed: settings.seed * 47,
            count: planetCount,
            innerRadius: currentMaxPlanetRadius*1.4 + 0.4,
            outerRadius: currentMaxPlanetRadius*1.5 + 0.9,
            inclinationSpread: 0.06,
            center: new THREE.Vector3(0, 0, 0),
            sizeScale: 0.55
        });
        scene.add(planetBelt.group);
        asteroidBelts.push(planetBelt);
    }*/

    // Another belt around the sun, but with a different seed → different distribution, for variety

    let pos_sun_adj = SUN_POS.clone().add(new THREE.Vector3(0, -15, 0)); // slightly above the sun's center, to avoid z-fighting with star belt
    if (planetCount > 0) {
        const planetBelt = createAsteroidBelt({
            seed: settings.seed * 47,
            count: planetCount,
            innerRadius: starProps.radius * 7.2 + 1.0,
            outerRadius: starProps.radius * 7.6 + 2.5,
            inclinationSpread: 0.06,
            center: pos_sun_adj,
            sizeScale: 0.55
        });
        scene.add(planetBelt.group);
        asteroidBelts.push(planetBelt);
    }

    // 3) Random fields — 2 patches scattered in space
    if (fieldsTotal > 0) {
        const fieldCount = 12;
        const perField = Math.ceil(fieldsTotal / fieldCount);
        for (let f = 0; f < fieldCount; f++) {
            const field = createAsteroidField({
                seed: settings.seed * 71 + f * 13,
                count: perField
            });
            scene.add(field.group);
            asteroidBelts.push(field);
        }
    }
}

function updateAsteroids(elapsed) {
    for (const belt of asteroidBelts) {
        if (belt.type === 'field') {
            // Static patch — just spin each rock on its own axis
            for (const a of belt.asteroids) {
                a.mesh.rotateOnAxis(a.rotationAxis, a.rotationSpeed);
            }
            continue;
        }

        // Belt — orbital motion around belt.center
        for (const a of belt.asteroids) {
            const angle = a.orbitPhase + elapsed * a.orbitSpeed;
            const sm = a.orbitRadius;
            const sm2 = a.orbitRadius * (1 - a.eccentricity);

            const x = Math.cos(angle) * sm;
            const z = Math.sin(angle) * sm2;
            const y = z * Math.sin(a.inclination);
            const zIncl = z * Math.cos(a.inclination);

            a.mesh.position.set(
                a.center.x + x,
                a.center.y + y,
                a.center.z + zIncl
            );
            a.mesh.rotateOnAxis(a.rotationAxis, a.rotationSpeed);
        }
    }
}

// --- SETTINGS & BUILD ---
function readSettings() {
    return {
        seed: Number(seedInput.value) || 1,
        radius: Number(radiusInput.value),
        detail: Number(detailInput.value),
        roughness: Number(roughnessInput.value),
        waterLevel: Number(waterInput.value),
        planetType: planetTypeInput.value,
        ringType: ringTypeInput.value,
        includeMoon: includeMoonInput.checked,
        asteroidCount: Number(asteroidCountInput.value)
    };
}

function updateLabels() {
    radiusValue.textContent = Number(radiusInput.value).toFixed(1);
    detailValue.textContent = detailInput.value;
    roughnessValue.textContent = Number(roughnessInput.value).toFixed(2);
    waterValue.textContent = Number(waterInput.value).toFixed(2);
    asteroidCountValue.textContent = asteroidCountInput.value;
    ringTypeLabel.textContent = ringTypeInput.value === 'rings' ? 'Has Rings' : 'None';
}

function buildPlanet() {
    const settings = readSettings();
    updateLabels();

    if (isSpaceshipMode) {
        isSpaceshipMode = false;
        spaceship.visible = false;
        controls.enabled = true;
        spaceshipModeButton.textContent = 'Spaceship Mode';
        toggleViewButton.style.display = 'none';
        isFirstPerson = false;
        toggleViewButton.textContent = 'First Person';
        if (document.pointerLockElement) document.exitPointerLock();
        camera.position.set(0, 2.8, 6.5);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();

        updateCameraNearPlane();
    }

    starProps = generateStarProperties(settings.seed);
    starLight.color.copy(starProps.color);
    starLight.intensity = 2.0 + (starProps.temp / 30000);
    buildStar();

    document.querySelector('.hint').innerHTML = `
        Drag to orbit, scroll to zoom.<br>
        <strong>System Star:</strong> Class ${starProps.class} (${Math.round(starProps.temp)}K)
        ${settings.planetType === 'gasGiant' ? '<br><strong>Body Type:</strong> Gas Giant' + (settings.ringType === 'rings' ? ' w/ Rings' : '') : ''}
    `;

    scene.remove(planetGroup);
    planetGroup.traverse((object) => {
        if (object.isMesh || object.isPoints) {
            object.geometry?.dispose?.();
            if (object.material) {
                if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
                else object.material.dispose();
            }
        }
    });

    scene.remove(moonGroup);
    moonGroup.traverse((object) => {
        if (object.isMesh) {
            object.geometry?.dispose?.();
            object.material?.dispose?.();
        }
    });

    if (settings.planetType === 'gasGiant') {
        planetGroup = createGasGiant({
            seed: settings.seed,
            radius: settings.radius,
            detail: settings.detail,
            hasRings: settings.ringType === 'rings'
        });
        planetGroup.rotation.x = 0.12;
    } else {
        planetGroup = createPlanet(settings);
        planetGroup.rotation.x = 0.18;
    }
    scene.add(planetGroup);

    moonGroup.userData.collisionRadius = 0;
    moonGroup.userData.orbitRadius = 0;
    moonGroup.userData.orbitSpeed = 0;

    if (settings.includeMoon) {
        const moonSettings = {
            seed: settings.seed,
            radius: settings.radius * 0.27,
            detail: Math.max(3, settings.detail - 1),
            roughness: settings.roughness * 1.3,
        };

        moonGroup.userData.collisionRadius = moonSettings.radius + moonSettings.roughness * 0.15 + 0.05;

        const moon = createMoon(moonSettings);
        moonGroup.add(moon);
        moonGroup.userData.orbitRadius = settings.radius * 3.5;
        moonGroup.userData.orbitSpeed = 0.08;
        scene.add(moonGroup);
    } else {
        if (moonGroup.parent) {
            moonGroup.parent.remove(moonGroup);
        }
    }

    if (settings.planetType === 'gasGiant') {
        currentMaxPlanetRadius = settings.radius + 0.1;
    } else {
        currentMaxPlanetRadius = settings.radius + settings.roughness * 0.6 + 0.05;
    }

    // Build asteroids — must run AFTER currentMaxPlanetRadius is set
    buildAsteroids(settings);
}

function updateCameraNearPlane() {
    camera.near = isSpaceshipMode ? 0.001 : 0.05;
    camera.updateProjectionMatrix();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setMenuCollapsed(collapsed) {
    hud.classList.toggle('collapsed', collapsed);
    toggleMenuButton.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleMenuButton.setAttribute('aria-expanded', String(!collapsed));
}

generateButton.addEventListener('click', buildPlanet);
randomizeButton.addEventListener('click', () => {
    seedInput.value = Math.floor(Math.random() * 1_000_000);
    buildPlanet();
});

toggleMenuButton.addEventListener('click', () => {
    setMenuCollapsed(!hud.classList.contains('collapsed'));
});

[radiusInput, detailInput, roughnessInput, waterInput, asteroidCountInput].forEach((input) => {
    input.addEventListener('input', updateLabels);
});

planetTypeInput.addEventListener('change', () => {
    const isGasGiant = planetTypeInput.value === 'gasGiant';
    ringTypeInput.disabled = !isGasGiant;
    if (!isGasGiant) {
        ringTypeInput.value = 'none';
    }
    document.querySelectorAll('.terrain-only').forEach((el) => {
        el.classList.toggle('hidden', isGasGiant);
    });
    updateLabels();
});

ringTypeInput.addEventListener('change', updateLabels);
includeMoonInput.addEventListener('change', updateLabels);

window.addEventListener('resize', onResize);

setMenuCollapsed(false);

// --- ROTATION DIALOG ---
let planetRotates = true;

(function showRotationDialog() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:9999;
        background:rgba(4,10,24,0.82);
        display:flex; align-items:center; justify-content:center;
        font-family:inherit;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background:#0d1a2e; border:1px solid #2a4a6a;
        border-radius:12px; padding:36px 44px; max-width:340px;
        text-align:center; color:#c8daf0;
        box-shadow:0 8px 40px rgba(0,0,0,0.7);
    `;

    box.innerHTML = `
        <div style="font-size:2rem;margin-bottom:12px;">🌀</div>
        <h2 style="margin:0 0 10px;font-size:1.15rem;color:#e8f4ff;letter-spacing:.04em;">
            Planetary Rotation
        </h2>
        <p style="margin:0 0 24px;font-size:.88rem;line-height:1.55;color:#7aaacf;">
            Should the planet spin on its axis?<br>
            <span style="font-size:.78rem;opacity:.7;">(Storms always animate regardless)</span>
        </p>
    `;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:14px;justify-content:center;';

    function makeBtn(label, value) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding:10px 28px; border-radius:8px; border:1px solid #2a4a6a;
            background:${value ? '#1a3a5c' : '#1a1a2e'}; color:#c8daf0;
            font-size:.95rem; cursor:pointer; transition:background .15s;
        `;
        btn.onmouseenter = () => btn.style.background = value ? '#2a5a8c' : '#2a2a4e';
        btn.onmouseleave = () => btn.style.background = value ? '#1a3a5c' : '#1a1a2e';
        btn.addEventListener('click', () => {
            planetRotates = value;
            overlay.remove();
            buildPlanet();
        });
        return btn;
    }

    btnRow.appendChild(makeBtn('Yes', true));
    btnRow.appendChild(makeBtn('No', false));
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
})();

// --- ANIMATION LOOP ---
function animate() {
    const elapsed = clock.getElapsedTime();

    const sunDir = new THREE.Vector3(80, 15, 0).normalize();

    if (starMesh) {
        starMesh.rotation.y += 0.0005;
        if (starMesh.material.uniforms) {
            starMesh.material.uniforms.uTime.value = elapsed;
        }
    }

    if (planetGroup.userData.oceanMaterial) {
        planetGroup.userData.oceanMaterial.uniforms.uTime.value = elapsed;
        planetGroup.userData.oceanMaterial.uniforms.uSunDirection.value.copy(sunDir);
    }

    if (planetGroup.userData.bodyMaterial) {
        planetGroup.userData.bodyMaterial.uniforms.uTime.value = elapsed;
    }

    if (planetGroup.userData.atmosphereMaterial) {
        planetGroup.userData.atmosphereMaterial.uniforms.uTime.value = elapsed;
    }

    if (planetRotates && !isSpaceshipMode) {
        planetGroup.rotation.y += 0.003;
    }

    stars.position.copy(camera.position);

    if (isSpaceshipMode) {
        if (!document.pointerLockElement) {
            const euler = new THREE.Euler(0, 0, 0, 'YXZ');
            euler.setFromQuaternion(spaceship.quaternion);
            if (keys['ArrowUp']) euler.x -= shipState.rotationSpeed;
            if (keys['ArrowDown']) euler.x += shipState.rotationSpeed;
            if (keys['ArrowLeft']) euler.y += shipState.rotationSpeed;
            if (keys['ArrowRight']) euler.y -= shipState.rotationSpeed;
            euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
            spaceship.quaternion.setFromEuler(euler);
        }

        if (keys['KeyE']) shipState.thrust = Math.min((shipState.thrust + shipState.acceleration), shipState.maxSpeed);
        else if (keys['KeyR']) shipState.thrust = Math.max((shipState.thrust - shipState.acceleration), -shipState.maxSpeed / 2);
        else {
            shipState.thrust *= shipState.drag;
            if (Math.abs(shipState.thrust) < 0.00001) shipState.thrust = 0;
        }

        const transformFactor = (isFirstPerson) ? -1 : 1;
        const forward = new THREE.Vector3(0, 0, 1 * transformFactor);
        forward.applyQuaternion(spaceship.quaternion);
        spaceship.position.addScaledVector(forward, shipState.thrust);

        const distToPlanetCenter = spaceship.position.length();
        if (distToPlanetCenter < currentMaxPlanetRadius) {
            const normal = spaceship.position.clone().normalize();
            spaceship.position.copy(normal.multiplyScalar(currentMaxPlanetRadius));
            shipState.thrust = 0;
        }

        const moonPos = moonGroup.position;
        const distToMoonCenter = spaceship.position.distanceTo(moonPos);
        const moonCollisionRadius = moonGroup.userData.collisionRadius || 0;

        if (moonCollisionRadius > 0 && distToMoonCenter < moonCollisionRadius) {
            const moonNormal = spaceship.position.clone().sub(moonPos).normalize();
            spaceship.position.copy(moonPos).add(moonNormal.multiplyScalar(moonCollisionRadius));
            shipState.thrust = 0;
        }

        // Asteroid collision (works for both belt + field types)
        for (const belt of asteroidBelts) {
            for (const a of belt.asteroids) {
                const distToAsteroid = spaceship.position.distanceTo(a.mesh.position);
                const hitRadius = a.collisionRadius + 0.15;
                if (distToAsteroid < hitRadius) {
                    const normal = spaceship.position.clone().sub(a.mesh.position).normalize();
                    if (normal.lengthSq() < 0.0001) normal.set(0, 1, 0);
                    spaceship.position.copy(a.mesh.position).add(normal.multiplyScalar(hitRadius));
                    shipState.thrust *= 0.4;
                }
            }
        }

        if (isFirstPerson) {
            const fpOffset = new THREE.Vector3(0, 0.005, 0.015);
            fpOffset.applyQuaternion(spaceship.quaternion);
            camera.position.copy(spaceship.position).add(fpOffset);
            camera.quaternion.copy(spaceship.quaternion);
        } else {
            const cameraOffset = new THREE.Vector3(0, 0.08, -0.25);
            cameraOffset.applyQuaternion(spaceship.quaternion);
            const targetCamPos = spaceship.position.clone().add(cameraOffset);
            camera.position.lerp(targetCamPos, 0.15);
            camera.lookAt(spaceship.position);
        }

    } else {
        planetGroup.rotation.y += 0.0022;
        controls.update();
    }

    if (moonGroup.userData.orbitRadius) {
        const moonAngle = elapsed * moonGroup.userData.orbitSpeed;
        const moonOrbitRadius = moonGroup.userData.orbitRadius;
        moonGroup.position.set(
            Math.cos(moonAngle) * moonOrbitRadius,
            Math.sin(moonAngle * 0.3) * moonOrbitRadius * 0.15,
            Math.sin(moonAngle) * moonOrbitRadius
        );
        if (moonGroup.children[0]) moonGroup.children[0].rotation.y = -moonAngle;
    }

    updateAsteroids(elapsed);
    updateFrigates();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

animate();

// --- INITIAL POPUP HANDLING ---
const enterButton = document.getElementById('enter');
enterButton.addEventListener('click', () => {
    const popup = document.querySelector('.popup');
    popup.style.display = 'none';
    hud.style.display = 'block';
});

hud.style.display = 'none';
