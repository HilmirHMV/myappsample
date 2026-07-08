// ── Bike Dash 3D ── WebGL lane runner inspired by the 2D original ──
// Raw WebGL, no dependencies. Behind-the-camera view: switch lanes,
// jump over fish, dodge cars, grab chocolate for a boost.

const canvas3d = document.getElementById('game3d');
const hud3d = document.getElementById('hud3d');
let gl = null;
let g3Ready = false;

// ── 3D gameplay constants ──
const G3_LANES = [-3, -1, 1, 3];
const G3_GRAVITY = 0.018;
const G3_JUMP_VY = 0.28;
const G3_BASE_SPEED = 0.35;
const G3_BOOST_BONUS = 0.5;
const G3_INVULN_TIME = 180;
const G3_SPAWN_Z = -120;
const G3_KILL_Z = 8;

// ── 3D game state ──
let g3Player = { lane: 1, x: G3_LANES[1], y: 0, vy: 0, onGround: true, tilt: 0 };
let g3Cars = [];
let g3Fish = [];
let g3Chocos = [];
let g3Parts = [];
let g3Speed = G3_BASE_SPEED;
let g3Dist = 0;
let g3Invuln = 0;
let g3CarTimer = 0;
let g3FishTimer = 0;
let g3ChocoTimer = 0;
let g3Shake = 0;
let g3Best = 0;
try {
    g3Best = parseInt(localStorage.getItem('bike3dHighScore') || '0');
} catch (e) {
    // localStorage unavailable — high score won't persist
}

function g3LaneX(lane) {
    return G3_LANES[Math.max(0, Math.min(G3_LANES.length - 1, lane))];
}

function g3Score() {
    return Math.floor(g3Dist);
}

// Speed ramps with distance
function g3SpeedFor(dist, invuln) {
    return G3_BASE_SPEED + dist / 4000 + (invuln > 0 ? G3_BOOST_BONUS : 0);
}

// Pure collision helpers (player is at z=0)
function g3HitCar(p, car) {
    return car.lane === p.lane && Math.abs(car.z) < 1.6 && p.y < 2.0;
}
function g3HitFish(p, f) {
    return Math.abs(f.x - p.x) < 1.1 && Math.abs(f.z) < 1.3 && p.y < 0.9 + f.y;
}
function g3HitChoco(p, c) {
    return c.lane === p.lane && Math.abs(c.z) < 1.4 && p.y < 1.8;
}

// ── Mode lifecycle ──
function start3DMode() {
    g3Player = { lane: 1, x: G3_LANES[1], y: 0, vy: 0, onGround: true, tilt: 0 };
    g3Cars = [];
    g3Fish = [];
    g3Chocos = [];
    g3Parts = [];
    g3Speed = G3_BASE_SPEED;
    g3Dist = 0;
    g3Invuln = 0;
    g3CarTimer = 90;
    g3FishTimer = 200;
    g3ChocoTimer = 320;
    g3Shake = 0;
}

function g3MoveLeft() {
    if (g3Player.lane > 0) { g3Player.lane--; SFX.laneSwitch(); }
}
function g3MoveRight() {
    if (g3Player.lane < G3_LANES.length - 1) { g3Player.lane++; SFX.laneSwitch(); }
}
function g3Jump() {
    if (g3Player.onGround) {
        g3Player.vy = G3_JUMP_VY;
        g3Player.onGround = false;
        SFX.nearMiss();
    }
}

// ── Spawners ──
function g3SpawnCar() {
    const lane = Math.floor(Math.random() * 4);
    const colors = [[0.8, 0.2, 0.2], [0.2, 0.4, 0.8], [0.2, 0.7, 0.2], [0.8, 0.8, 0.2], [0.8, 0.4, 0.1], [0.9, 0.9, 0.9]];
    g3Cars.push({
        lane, z: G3_SPAWN_Z,
        fwd: 0.1 + Math.random() * 0.15, // cars drive away, so they approach slower
        color: colors[Math.floor(Math.random() * colors.length)],
        nearMissed: false
    });
}

function g3SpawnFish() {
    const fromLeft = Math.random() < 0.5;
    g3Fish.push({
        x: fromLeft ? -7 : 7,
        vx: (fromLeft ? 1 : -1) * (0.06 + Math.random() * 0.05),
        y: 0.2 + Math.random() * 0.5,
        z: -60 - Math.random() * 30,
        wob: Math.random() * 6
    });
}

function g3SpawnChoco() {
    g3Chocos.push({ lane: Math.floor(Math.random() * 4), z: G3_SPAWN_Z, spin: 0 });
}

function g3Burst(x, y, z, color, n, spd) {
    for (let i = 0; i < n; i++) {
        g3Parts.push({
            x, y: y + 0.3, z,
            vx: (Math.random() - 0.5) * spd,
            vy: Math.random() * spd * 0.8,
            vz: (Math.random() - 0.5) * spd,
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color,
            size: 0.1 + Math.random() * 0.15
        });
    }
}

// ── Update ──
function update3D() {
    if (state !== 'playing') return;
    const p = g3Player;

    // Lane switching (edge-triggered)
    const left = keys['ArrowLeft'] || keys['KeyA'];
    const right = keys['ArrowRight'] || keys['KeyD'];
    if (left && !p._ml) { g3MoveLeft(); p._ml = true; } else if (!left) p._ml = false;
    if (right && !p._mr) { g3MoveRight(); p._mr = true; } else if (!right) p._mr = false;
    if (keys['Space'] || keys['ArrowUp'] || keys['KeyW']) g3Jump();

    // Physics
    p.x = lerp(p.x, g3LaneX(p.lane), 0.18);
    p.tilt = (g3LaneX(p.lane) - p.x) * 0.4;
    if (!p.onGround) {
        p.y += p.vy;
        p.vy -= G3_GRAVITY;
        if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
    }

    // Speed & distance
    g3Speed = g3SpeedFor(g3Dist, g3Invuln);
    g3Dist += g3Speed * 0.35;
    if (g3Invuln > 0) g3Invuln--;
    if (g3Shake > 0) g3Shake *= 0.85;

    // Spawns
    g3CarTimer--;
    if (g3CarTimer <= 0) {
        g3SpawnCar();
        g3CarTimer = Math.max(35, 100 - g3Score() / 12);
        if (g3Score() > 400 && Math.random() < 0.3) g3SpawnCar();
    }
    g3FishTimer--;
    if (g3FishTimer <= 0) {
        g3SpawnFish();
        g3FishTimer = Math.max(80, 220 - g3Score() / 8);
    }
    g3ChocoTimer--;
    if (g3ChocoTimer <= 0) {
        g3SpawnChoco();
        g3ChocoTimer = 300 + Math.random() * 200;
    }

    // Move world toward the player
    for (const c of g3Cars) c.z += g3Speed - c.fwd;
    g3Cars = g3Cars.filter(c => c.z < G3_KILL_Z && !c.dead);

    for (const f of g3Fish) {
        f.x += f.vx;
        f.z += g3Speed * 0.9;
        f.wob += 0.15;
        f.yy = f.y + Math.sin(f.wob) * 0.15;

        // Splash when crossing the road edge (entering or leaving)
        const onRoad = Math.abs(f.x) < 4.4;
        if (f.wasOnRoad !== undefined && onRoad !== f.wasOnRoad) {
            const edgeX = f.x > 0 ? 4.4 : -4.4;
            g3Burst(edgeX, 0.2, f.z, [0.7, 0.85, 1.0], 8, 0.15);
            g3Burst(edgeX, 0.2, f.z, [1, 1, 1], 4, 0.1);
            if (f.z > -50) SFX.splash(); // only audible when close
        }
        f.wasOnRoad = onRoad;
    }
    g3Fish = g3Fish.filter(f => f.z < G3_KILL_Z && f.x > -9 && f.x < 9 && !f.dead);

    for (const c of g3Chocos) { c.z += g3Speed; c.spin += 0.05; }
    g3Chocos = g3Chocos.filter(c => c.z < G3_KILL_Z && !c.taken);

    for (const pt of g3Parts) {
        pt.x += pt.vx; pt.y += pt.vy; pt.z += pt.vz + g3Speed * 0.5;
        pt.vy -= 0.01;
        pt.life--;
    }
    g3Parts = g3Parts.filter(pt => pt.life > 0);

    // Collisions
    for (const c of g3Cars) {
        if (g3HitCar(p, c)) {
            if (g3Invuln > 0) {
                c.dead = true;
                g3Burst(g3LaneX(c.lane), 0.8, c.z, c.color, 14, 0.3);
                g3Burst(g3LaneX(c.lane), 0.8, c.z, [1, 0.8, 0.2], 8, 0.25);
                g3Shake = 0.4;
                SFX.destroy();
            } else {
                g3Die();
                return;
            }
        }
    }
    for (const f of g3Fish) {
        if (g3HitFish(p, f)) {
            if (g3Invuln > 0) {
                f.dead = true;
                g3Burst(f.x, f.yy || f.y, f.z, [0.3, 0.55, 0.8], 10, 0.25);
                SFX.destroy();
            } else {
                g3Die();
                return;
            }
        }
    }
    for (const c of g3Chocos) {
        if (!c.taken && g3HitChoco(p, c)) {
            c.taken = true;
            g3Invuln = G3_INVULN_TIME;
            g3Burst(g3LaneX(c.lane), 1, c.z, [1, 0.8, 0.2], 12, 0.3);
            SFX.pickup();
            vibrate(40);
        }
    }

    // Remove anything destroyed this frame
    g3Cars = g3Cars.filter(c => !c.dead);
    g3Fish = g3Fish.filter(f => !f.dead);
    g3Chocos = g3Chocos.filter(c => !c.taken);
}

function g3Die() {
    g3Burst(g3Player.x, 0.8, 0, [0.87, 0.2, 0.13], 20, 0.4);
    g3Burst(g3Player.x, 0.8, 0, [0.5, 0.5, 0.5], 12, 0.3);
    g3Shake = 1;
    hitStop = 30;
    state = 'dead';
    stopMusic();
    SFX.death();
    vibrate([100, 50, 200]);

    const sc = g3Score();
    if (sc > g3Best) {
        g3Best = sc;
        try { localStorage.setItem('bike3dHighScore', g3Best); } catch (e) {}
    }
    overlay.textContent = '';
    const h = document.createElement('h1');
    h.style.color = '#ff4444';
    h.textContent = 'WIPEOUT!';
    const pStats = document.createElement('p');
    pStats.textContent = `Distance: ${sc}`;
    const pBest = document.createElement('p');
    pBest.textContent = `Best: ${g3Best}`;
    const pRetry = document.createElement('p');
    pRetry.className = 'blink';
    pRetry.style.marginTop = '16px';
    pRetry.textContent = 'Press ENTER or tap to retry';
    const pMenu = document.createElement('p');
    pMenu.style.fontSize = '11px';
    pMenu.style.color = '#555';
    pMenu.style.marginTop = '8px';
    pMenu.textContent = 'Press M for menu';
    overlay.append(h, pStats, pBest, pRetry, pMenu);
    overlay.classList.remove('hidden');
}

// ── WebGL renderer ──
const G3_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
uniform mat4 uVP;
uniform vec4 uPosScaleX; // x,y,z,scaleX
uniform vec4 uScaleYZ;   // scaleY, scaleZ, 0, 0
uniform vec3 uColor;
varying vec3 vColor;
varying float vDist;
void main() {
    vec3 world = aPos * vec3(uPosScaleX.w, uScaleYZ.x, uScaleYZ.y) + uPosScaleX.xyz;
    gl_Position = uVP * vec4(world, 1.0);
    vec3 lightDir = normalize(vec3(0.4, 0.9, 0.3));
    float l = 0.55 + 0.45 * max(dot(normalize(aNorm), lightDir), 0.0);
    vColor = uColor * l;
    vDist = -(uVP * vec4(world, 1.0)).z;
    vDist = length(world - vec3(0.0, 3.5, 7.0));
}`;

const G3_FS = `
precision mediump float;
varying vec3 vColor;
varying float vDist;
uniform vec3 uFog;
void main() {
    float fog = clamp((vDist - 40.0) / 80.0, 0.0, 0.85);
    gl_FragColor = vec4(mix(vColor, uFog, fog), 1.0);
}`;

let g3Prog = null;
let g3Uni = {};
let g3CubeIdxCount = 0;

function g3Compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
}

function init3D() {
    if (g3Ready || !canvas3d) return g3Ready;
    const ctx3d = canvas3d.getContext('webgl') || canvas3d.getContext('experimental-webgl');
    if (!ctx3d || typeof ctx3d.createShader !== 'function') return false;
    gl = ctx3d;

    g3Prog = gl.createProgram();
    gl.attachShader(g3Prog, g3Compile(gl.VERTEX_SHADER, G3_VS));
    gl.attachShader(g3Prog, g3Compile(gl.FRAGMENT_SHADER, G3_FS));
    gl.linkProgram(g3Prog);
    if (!gl.getProgramParameter(g3Prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(g3Prog));
    }
    gl.useProgram(g3Prog);

    // Unit cube: 24 verts (per-face normals), 36 indices
    const P = [
        // +x
        [1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1],
        // -x
        [-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1],
        // +y
        [-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1],
        // -y
        [-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1],
        // +z
        [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
        // -z
        [1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],
    ];
    const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const verts = [];
    for (let f = 0; f < 6; f++) {
        for (let v = 0; v < 4; v++) {
            const pos = P[f * 4 + v];
            verts.push(pos[0] * 0.5, pos[1] * 0.5, pos[2] * 0.5, N[f][0], N[f][1], N[f][2]);
        }
    }
    const idx = [];
    for (let f = 0; f < 6; f++) {
        const b = f * 4;
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    g3CubeIdxCount = idx.length;

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(g3Prog, 'aPos');
    const aNorm = gl.getAttribLocation(g3Prog, 'aNorm');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aNorm);
    gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 24, 12);

    g3Uni.vp = gl.getUniformLocation(g3Prog, 'uVP');
    g3Uni.posScaleX = gl.getUniformLocation(g3Prog, 'uPosScaleX');
    g3Uni.scaleYZ = gl.getUniformLocation(g3Prog, 'uScaleYZ');
    g3Uni.color = gl.getUniformLocation(g3Prog, 'uColor');
    g3Uni.fog = gl.getUniformLocation(g3Prog, 'uFog');

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    g3Ready = true;
    return true;
}

function resize3D() {
    if (!canvas3d) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas3d.width = Math.floor(window.innerWidth * dpr);
    canvas3d.height = Math.floor(window.innerHeight * dpr);
    canvas3d.style.width = window.innerWidth + 'px';
    canvas3d.style.height = window.innerHeight + 'px';
    if (gl) gl.viewport(0, 0, canvas3d.width, canvas3d.height);
}
window.addEventListener('resize', resize3D);

// Column-major mat4 multiply: out = a * b
function g3Mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
    }
    return o;
}

function g3Persp(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    ]);
}

function g3LookAt(ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    // x = cross(up, z) with up = (0,1,0)
    let xx = zz, xy = 0, xz = -zx;
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xz /= xl;
    // y = cross(z, x)
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1
    ]);
}

function g3Box(x, y, z, sx, sy, sz, color) {
    gl.uniform4f(g3Uni.posScaleX, x, y, z, sx);
    gl.uniform4f(g3Uni.scaleYZ, sy, sz, 0, 0);
    gl.uniform3f(g3Uni.color, color[0], color[1], color[2]);
    gl.drawElements(gl.TRIANGLES, g3CubeIdxCount, gl.UNSIGNED_SHORT, 0);
}

function g3Hex(hex) {
    return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
    ];
}

function render3D() {
    if (!g3Ready) return;

    // Theme cycles with distance, borrowing the 2D road themes
    const themeIdx = Math.floor(g3Score() / 500) % ROAD_THEMES.length;
    const theme = ROAD_THEMES[themeIdx];
    const sky = g3Hex(theme.sky);
    const road = g3Hex(theme.road);
    const grass = g3Hex(theme.grass);

    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3f(g3Uni.fog, sky[0], sky[1], sky[2]);

    const p = g3Player;
    const shakeX = g3Shake > 0.02 ? (Math.random() - 0.5) * g3Shake : 0;
    const shakeY = g3Shake > 0.02 ? (Math.random() - 0.5) * g3Shake * 0.5 : 0;
    const aspect = canvas3d.width / Math.max(1, canvas3d.height);
    const proj = g3Persp(1.0, aspect, 0.5, 220);
    const view = g3LookAt(p.x * 0.5 + shakeX, 3.5 + p.y * 0.4 + shakeY, 7, p.x * 0.8, 1.0, -12);
    gl.uniformMatrix4fv(g3Uni.vp, false, g3Mul(proj, view));

    // Ground / grass
    g3Box(0, -0.6, -55, 60, 1, 160, grass);
    // Road
    g3Box(0, -0.09, -55, 8.6, 1, 160, road);
    // Road edges
    g3Box(-4.4, 0.42, -55, 0.25, 0.04, 160, g3Hex(theme.edge));
    g3Box(4.4, 0.42, -55, 0.25, 0.04, 160, g3Hex(theme.edge));

    // Lane dashes scroll with distance
    const dash = g3Hex(theme.dash);
    const off = (g3Dist * 2) % 8;
    for (let li = 0; li < 3; li++) {
        const lx = -2 + li * 2;
        for (let z = -128; z < 6; z += 8) {
            g3Box(lx, 0.42, z + off, 0.12, 0.03, 2.4, dash);
        }
    }

    // Roadside posts for a sense of speed
    for (let z = -120; z < 6; z += 16) {
        const pz = z + (g3Dist * 2) % 16;
        g3Box(-5.5, 0.6, pz, 0.15, 1.2, 0.15, [0.9, 0.9, 0.9]);
        g3Box(5.5, 0.6, pz, 0.15, 1.2, 0.15, [0.9, 0.9, 0.9]);
    }

    // Chocolate pickups
    for (const c of g3Chocos) {
        if (c.taken) continue;
        const cy = 0.9 + Math.sin(c.spin * 2) * 0.15;
        g3Box(g3LaneX(c.lane), cy, c.z, 0.8, 0.5, 0.5, [0.42, 0.23, 0.1]);
        g3Box(g3LaneX(c.lane), cy + 0.15, c.z, 0.6, 0.25, 0.35, [0.55, 0.32, 0.16]);
    }

    // Cars (box + cabin + wheels)
    for (const c of g3Cars) {
        const cx = g3LaneX(c.lane);
        g3Box(cx, 0.55, c.z, 1.5, 0.7, 2.6, c.color);
        g3Box(cx, 1.1, c.z + 0.2, 1.2, 0.5, 1.3, [c.color[0] * 0.6, c.color[1] * 0.6, c.color[2] * 0.6]);
        g3Box(cx, 1.15, c.z - 0.5, 1.1, 0.35, 0.1, [0.6, 0.85, 1.0]);
        for (const dx of [-0.7, 0.7]) {
            g3Box(cx + dx, 0.25, c.z - 0.9, 0.25, 0.5, 0.5, [0.1, 0.1, 0.1]);
            g3Box(cx + dx, 0.25, c.z + 0.9, 0.25, 0.5, 0.5, [0.1, 0.1, 0.1]);
        }
    }

    // Fish (body + tail + eye)
    for (const f of g3Fish) {
        const fy = 0.5 + (f.yy || f.y);
        const dir = f.vx > 0 ? 1 : -1;
        g3Box(f.x, fy, f.z, 1.0, 0.5, 0.4, [0.27, 0.53, 0.8]);
        g3Box(f.x - dir * 0.6, fy + 0.1, f.z, 0.35, 0.35, 0.15, [0.2, 0.4, 0.67]);
        g3Box(f.x + dir * 0.35, fy + 0.1, f.z - 0.18, 0.12, 0.12, 0.08, [1, 1, 1]);
    }

    // Player biker (styled by 2D progression unlocks)
    const fr = currentFrame();
    const frameCol = g3Hex(fr.color);
    const shirtCol = g3Hex(fr.shirt);
    const py = p.y;
    const px = p.x + p.tilt * 0.3;
    // Wheels
    g3Box(px, 0.3 + py, 0.8, 0.2, 0.6, 0.6, [0.15, 0.15, 0.15]);
    g3Box(px, 0.3 + py, -0.8, 0.2, 0.6, 0.6, [0.15, 0.15, 0.15]);
    // Frame
    g3Box(px, 0.55 + py, 0, 0.15, 0.15, 1.6, frameCol);
    g3Box(px, 0.8 + py, 0.55, 0.12, 0.5, 0.12, frameCol);
    // Body
    g3Box(px, 1.15 + py, 0.1, 0.5, 0.7, 0.35, shirtCol);
    // Arms reaching handlebars
    g3Box(px, 1.25 + py, 0.45, 0.65, 0.15, 0.5, shirtCol);
    // Head + hair
    g3Box(px, 1.75 + py, 0.1, 0.35, 0.35, 0.35, [1.0, 0.8, 0.6]);
    g3Box(px, 1.98 + py, 0.05, 0.38, 0.15, 0.38, [0.87, 0.2, 0.13]);
    // Invulnerability aura
    if (g3Invuln > 0 && Math.floor(g3Invuln / 3) % 2 === 0) {
        g3Box(px, 1.1 + py, 0, 0.9, 1.6, 1.9, [1.0, 0.85, 0.3]);
    }

    // Particles
    for (const pt of g3Parts) {
        g3Box(pt.x, pt.y, pt.z, pt.size, pt.size, pt.size, pt.color);
    }
}

// ── DOM HUD ──
function updateHUD3D() {
    if (!hud3d) return;
    const boost = g3Invuln > 0 ? ` BOOST ${Math.ceil(g3Invuln / 60)}` : '';
    const paused = state === 'paused' ? ' — PAUSED (P)' : '';
    hud3d.textContent = `DIST ${g3Score()}  BEST ${g3Best}${boost}${paused}`;
    hud3d.style.color = g3Invuln > 0 ? '#ffcc00' : '#ffffff';
}

// 3D touch: left/right thirds steer, middle jumps
function g3Touch(clientX) {
    const frac = clientX / window.innerWidth;
    if (frac < 0.35) g3MoveLeft();
    else if (frac > 0.65) g3MoveRight();
    else g3Jump();
}

// ── Engine hum: continuous low drone whose pitch follows speed ──
let g3HumOsc = null;
let g3HumGain = null;

function g3Hum() {
    // Never create the AudioContext here — that must happen on a user
    // gesture (unlockAudio). Only attach once the context exists.
    if (!audioCtx) return;
    if (!g3HumOsc) {
        g3HumOsc = audioCtx.createOscillator();
        g3HumGain = audioCtx.createGain();
        g3HumOsc.type = 'sawtooth';
        g3HumOsc.frequency.value = 70;
        g3HumGain.gain.value = 0;
        g3HumOsc.connect(g3HumGain);
        g3HumGain.connect(audioCtx.destination);
        g3HumOsc.start();
    }
    const active = state === 'playing' && gameMode === '3d';
    const t = audioCtx.currentTime;
    g3HumGain.gain.setTargetAtTime(active ? 0.02 : 0, t, 0.1);
    if (active) {
        // Pitch rises with speed; boost adds an extra growl
        const freq = 55 + g3Speed * 90 + (g3Invuln > 0 ? 45 : 0);
        g3HumOsc.frequency.setTargetAtTime(freq, t, 0.15);
    }
}
