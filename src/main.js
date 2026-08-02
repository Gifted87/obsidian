/**
 * Ovan Cinematic Engine — Skeleton Boot
 *
 * Bootstraps the three.js renderer, scene, camera, and basic lighting.
 * Runs a requestAnimationFrame render loop that logs FPS to the console.
 *
 * @see config/constants.js  — shared constants (FORWARD_AXIS, BASE_SPEED, RPM, etc.)
 */

import * as THREE from 'three';
import {
    FORWARD_AXIS,
    MAIN_RPM,
    TAIL_GEAR_RATIO,
    BASE_SPEED,
    CAMERA_FOV_TRACKING,
} from './config/constants.js';

// ---------------------------------------------------------------------------
// 1. Renderer
// ---------------------------------------------------------------------------

const canvas = document.getElementById('canvas');

if (!canvas) {
    throw new Error('[OVAN] No <canvas id="canvas"> found in the DOM.');
}

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ---------------------------------------------------------------------------
// 2. Scene
// ---------------------------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // sky blue placeholder

// ---------------------------------------------------------------------------
// 3. Camera
// ---------------------------------------------------------------------------

const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_TRACKING,                             // FOV (degrees)
    window.innerWidth / window.innerHeight,          // aspect ratio
    0.5,                                             // near plane
    2000,                                            // far plane
);

camera.position.set(0, 30, 50);
camera.lookAt(0, 0, 0);

// ---------------------------------------------------------------------------
// 4. Lights
// ---------------------------------------------------------------------------

// 4a. Ambient light — fills shadows with cool hue
const ambientLight = new THREE.AmbientLight(0x406080, 0.3);
scene.add(ambientLight);

// 4b. Hemisphere light — sky/ground colour gradient
const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3B2709, 0.4);
scene.add(hemiLight);

// 4c. Directional light (sun) — casts shadows
const sunLight = new THREE.DirectionalLight(0xFFEECC, 1.2);
sunLight.position.set(300, 200, 100);
sunLight.castShadow = true;

sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;

const d = 400;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 500;
sunLight.shadow.bias = -0.001;

scene.add(sunLight);

// (Optional) visualise the sun direction with a small sphere
// const sunHelper = new THREE.DirectionalLightHelper(sunLight, 20);
// scene.add(sunHelper);

// ---------------------------------------------------------------------------
// 5. Simple ground plane (placeholder until Terrain module is ready)
// ---------------------------------------------------------------------------

const groundGeo = new THREE.PlaneGeometry(500, 500, 1, 1);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2a3d1f,
    roughness: 0.9,
    metalness: 0.0,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// 6. Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
let frameCount = 0;
let lastFpsLog = performance.now();

function render() {
    const dt = clock.getDelta();

    // ---- future: update helicopter, camera, audio here ----

    // Render the scene
    renderer.render(scene, camera);

    // FPS counter (log every second)
    frameCount++;
    const now = performance.now();
    if (now - lastFpsLog >= 1000) {
        const fps = Math.round(frameCount / ((now - lastFpsLog) / 1000));
        const info = renderer.info;
        console.log(
            `[OVAN] ${fps} FPS | ` +
            `${info.render.calls} draw calls | ` +
            `${Math.round(info.render.triangles / 1000)}K triangles | ` +
            `${info.memory.textures} textures | ` +
            `${info.memory.geometries} geometries`
        );
        frameCount = 0;
        lastFpsLog = now;
    }

    requestAnimationFrame(render);
}

// ---------------------------------------------------------------------------
// 7. Window resize handling (debounced)
// ---------------------------------------------------------------------------

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;

        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        console.log(`[OVAN] Resized to ${w}×${h}`);
    }, 100);
});

// ---------------------------------------------------------------------------
// 8. Tab visibility pause / resume (optional, good practice)
// ---------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('[OVAN] Tab hidden — pausing render loop clock');
        clock.stop();
    } else {
        console.log('[OVAN] Tab visible — resuming render loop clock');
        clock.start();
    }
});

// ---------------------------------------------------------------------------
// 9. Start
// ---------------------------------------------------------------------------

console.log('[OVAN] Skeleton boot complete.');
console.log(`[OVAN] Constants: FORWARD_AXIS=(%d,%d,%d), MAIN_RPM=%d, TAIL_GEAR_RATIO=%d, BASE_SPEED=%d`,
    FORWARD_AXIS.x, FORWARD_AXIS.y, FORWARD_AXIS.z,
    MAIN_RPM, TAIL_GEAR_RATIO, BASE_SPEED
);
console.log(`[OVAN] Camera FOV (tracking): ${CAMERA_FOV_TRACKING}°`);

render();
