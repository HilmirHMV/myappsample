// ── Bike Dash Mode ──

const ROAD_LEFT = 32;
const ROAD_RIGHT = W - 32;

// ── Gameplay constants ──
const DEATH_TIMER_FRAMES = 60;
const DEATH_BLINK_FRAMES = 30;
const INVULN_DURATION = 180;          // ~3 seconds at 60fps
const INVULN_SPEED_BONUS = 2.5;
const CAR_SPEED_UP = 0.8;             // cars moving against traffic
const CAR_SPEED_DOWN = 1.5;           // cars moving with traffic
const TRUCK_SPEED_DOWN = 1.2;         // trucks are slower than cars
const CHOCO_SPEED = 1.2;
const VERT_MOVE_SPEED = 2.5;
const COLLISION_PAD_X = 1;
const COLLISION_PAD_Y = 2;
const COLLISION_PAD_W = 2;
const COLLISION_PAD_H = 2;
const LANE_CHANGE_COOLDOWN = 60;
const LANE_CHANGE_PROXIMITY = 30;
const CAR_BLOCKING_DIST = 40;
const SCORE_DIVISOR = 8;
const INITIAL_SPAWN_CAR = 60;
const INITIAL_SPAWN_FISH = 120;
const INITIAL_SPAWN_CHOCO = 80;

// ── Bike state ──
let bike = {
    x: W / 2 - 5, y: H - 40, lane: 1,
    w: 10, h: 14, alive: true, deathTimer: 0,
    tilt: 0, pedalFrame: 0, pedalTimer: 0
};
let bikeSpeed = 1.0;
let bikeScroll = 0;
let bikeObstacles = [];
let bikeFish = [];
let bikeChocolates = [];
let bikeNextSpawn = 0;
let bikeFishTimer = 0;
let bikeChocoTimer = 0;
let bikeHighScore = 0;
try {
    bikeHighScore = parseInt(localStorage.getItem('bikeHighScore') || '0');
} catch (e) {
    // localStorage unavailable (private browsing) — high score won't persist
}
let bikeLanes = [];

// ── Near-miss system ──
let nearMissCombo = 0;
let nearMissTimer = 0;
const NEAR_MISS_DIST = 6;
const NEAR_MISS_DECAY = 60;

// ── Level system ──
let level = 1;
let levelScroll = 0;
let levelComplete = false;
let levelCompleteTimer = 0;
let levelFlash = 0;
const LEVEL_TRANSITION_TIME = 90;

function levelDistance(lvl) {
    return 150 + lvl * 50;
}

function levelCarSpawnRate() {
    return Math.max(28, 92 - level * 6);
}
function levelFishSpawnRate() {
    return Math.max(48, 135 - level * 8);
}
function levelChocoSpawnRate() {
    return Math.max(90, 170 + level * 10);
}
function levelBaseSpeed() {
    return 0.9 + level * 0.1;
}

const ROAD_THEMES = [
    { road: '#555555', grass: '#44aa44', grassDark: '#3d9a3d', grassLight: '#55bb55', sky: '#88bbdd', edge: '#888888', dash: '#cccccc', weather: null, name: 'Suburbia' },
    { road: '#444455', grass: '#338833', grassDark: '#2d7a2d', grassLight: '#44aa44', sky: '#667799', edge: '#777788', dash: '#aaaacc', weather: 'rain', name: 'Downpour' },
    { road: '#665544', grass: '#aa8833', grassDark: '#997722', grassLight: '#bbaa44', sky: '#dd9955', edge: '#887766', dash: '#ddccaa', weather: 'dust', name: 'Desert' },
    { road: '#333344', grass: '#225533', grassDark: '#1a4428', grassLight: '#336644', sky: '#223355', edge: '#555566', dash: '#8888aa', weather: null, name: 'Midnight' },
    { road: '#554444', grass: '#cc5533', grassDark: '#aa4422', grassLight: '#dd7744', sky: '#cc7744', edge: '#776655', dash: '#ddbbaa', weather: 'leaves', name: 'Autumn' },
    { road: '#3a3a4a', grass: '#4488aa', grassDark: '#337799', grassLight: '#55aacc', sky: '#445577', edge: '#6677aa', dash: '#aabbdd', weather: 'snow', name: 'Frost' },
];

function currentTheme() {
    return ROAD_THEMES[(level - 1) % ROAD_THEMES.length];
}

// ── Power-ups (beyond chocolate) ──
let bikePickups = [];
let bikePickupTimer = 0;
let bikeShield = false;
let magnetTimer = 0;
const PICKUP_TYPES = ['shield', 'bell', 'magnet'];
const PICKUP_SPAWN_MIN = 700;   // frames between pickup spawns
const PICKUP_SPAWN_RANGE = 500;
const MAGNET_DURATION = 360;    // ~6 seconds
const MAGNET_RANGE = 70;
const SHIELD_MERCY_FRAMES = 45; // brief invulnerability after shield breaks

// ── Boss (every 5th level) ──
let boss = null;
const BOSS_LEVEL_INTERVAL = 5;
const BOSS_HP = 3;

function isBossLevel(lvl) {
    return lvl % BOSS_LEVEL_INTERVAL === 0;
}

// ── Missions (optional per-level objective) ──
let mission = null;
const MISSION_REWARD = 100;
const MISSION_TYPES = [
    { type: 'nearmiss', n: 3, text: 'GET 3 NEAR MISSES' },
    { type: 'choco', n: 1, text: 'GRAB A CHOCOLATE' },
    { type: 'destroy', n: 2, text: 'SMASH 2 VEHICLES' },
];

function pickMission() {
    const m = MISSION_TYPES[Math.floor(Math.random() * MISSION_TYPES.length)];
    return { type: m.type, n: m.n, text: m.text, progress: 0, done: false };
}

function missionProgress(type, amount) {
    if (!mission || mission.done || mission.type !== type) return;
    mission.progress += amount || 1;
    if (mission.progress >= mission.n) {
        mission.done = true;
        score += MISSION_REWARD;
        SFX.mission();
        spawnFloatingText(W / 2, H / 2 - 40, 'MISSION! +' + MISSION_REWARD, '#44ff88');
    }
}

// ── Wave pacing: brief calm windows between intense stretches ──
let waveTimer = 0;
const WAVE_CYCLE = 900;   // ~15s cycle
const WAVE_CALM = 240;    // last ~4s of each cycle is calm

function inCalmWindow() {
    return (waveTimer % WAVE_CYCLE) >= (WAVE_CYCLE - WAVE_CALM);
}

// ── Persistent progression: total distance unlocks bike frame colors ──
let totalDistance = 0;
try {
    totalDistance = parseInt(localStorage.getItem('bikeTotalDist') || '0');
} catch (e) {
    // localStorage unavailable — progression won't persist
}
// Each unlock restyles the whole rig: frame, shirt, wheels, and a
// colored trail while riding — visible at a glance, not just 5 pixels.
const FRAME_UNLOCKS = [
    { dist: 0,     color: '#444444', hi: '#777777', shirt: '#2a2a3a', shirtHi: '#3a3a4e', trail: null,      name: 'CLASSIC' },
    { dist: 1000,  color: '#aa2222', hi: '#ff5555', shirt: '#8a1f1f', shirtHi: '#b54545', trail: '#ff5544', name: 'RED ROCKET' },
    { dist: 2500,  color: '#2255bb', hi: '#66aaff', shirt: '#1f3f8a', shirtHi: '#4568b5', trail: '#44aaff', name: 'BLUE BLAZE' },
    { dist: 5000,  color: '#bb9911', hi: '#ffdd44', shirt: '#8a6d1f', shirtHi: '#b59945', trail: '#ffcc44', name: 'GOLD GLIDER' },
    { dist: 10000, color: '#aa44aa', hi: '#ff77ff', shirt: '#7a1f8a', shirtHi: '#a545b5', trail: '#ff44ff', name: 'NEON NIGHT' },
];

function currentFrame() {
    let best = FRAME_UNLOCKS[0];
    for (const u of FRAME_UNLOCKS) {
        if (totalDistance >= u.dist) best = u;
    }
    return best;
}

function newUnlocks(before, after) {
    return FRAME_UNLOCKS.filter(u => u.dist > before && u.dist <= after);
}

// ── Start bike mode ──
function startBikeMode() {
    const roadW = ROAD_RIGHT - ROAD_LEFT;
    const laneW = roadW / 4;
    bikeLanes = [];
    for (let i = 0; i < 4; i++) {
        bikeLanes.push(ROAD_LEFT + laneW * i + laneW / 2);
    }

    bike.lane = 1;
    bike.x = bikeLanes[1] - 5;
    bike.y = H - 40;
    bike.alive = true;
    bike.deathTimer = 0;
    bike.tilt = 0;
    bike.pedalFrame = 0;
    bike.pedalTimer = 0;
    bikeSpeed = 1.0;
    bikeScroll = 0;
    bikeObstacles = [];
    bikeFish = [];
    bikeChocolates = [];
    bikeNextSpawn = INITIAL_SPAWN_CAR;
    bikeFishTimer = INITIAL_SPAWN_FISH;
    bikeChocoTimer = INITIAL_SPAWN_CHOCO;
    level = 1;
    levelScroll = 0;
    levelComplete = false;
    levelCompleteTimer = 0;
    levelFlash = 0;
    nearMissCombo = 0;
    nearMissTimer = 0;
    bikePickups = [];
    bikePickupTimer = PICKUP_SPAWN_MIN;
    bikeShield = false;
    magnetTimer = 0;
    waveTimer = 0;
    hitStop = 0;
    startLevel();
}

// Per-level setup: mission and boss
function startLevel() {
    mission = pickMission();
    boss = null;
    if (isBossLevel(level)) {
        boss = {
            x: W / 2 - 8, y: -30, w: 16, h: 28,
            lane: 1, hp: BOSS_HP,
            laneTimer: 0, hitFlash: 0,
            nearMissed: true // bosses don't count for near-miss
        };
    }
}

// ── Spawners ──
function spawnCarObstacle() {
    const occupiedLanes = new Set();
    for (const ob of bikeObstacles) {
        if (ob.y < 40 || ob.y > H - 40) occupiedLanes.add(ob.lane);
    }
    const freeLanes = [0, 1, 2, 3].filter(l => !occupiedLanes.has(l));
    if (freeLanes.length === 0) return;
    const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
    const lx = bikeLanes[lane];
    const carColors = ['#cc3333', '#3366cc', '#33aa33', '#cccc33', '#cc66cc', '#ff8833', '#eeeeee'];
    const color = carColors[Math.floor(Math.random() * carColors.length)];
    const goingUp = Math.random() < 0.3;

    // Higher levels: trucks (wider, slower)
    const isTruck = level >= 4 && Math.random() < 0.2;
    bikeObstacles.push({
        x: lx - (isTruck ? 7 : 6), y: goingUp ? H + 20 : -24,
        w: isTruck ? 14 : 12, h: isTruck ? 24 : 20,
        vy: goingUp ? -CAR_SPEED_UP * bikeSpeed : (isTruck ? TRUCK_SPEED_DOWN : CAR_SPEED_DOWN) * bikeSpeed,
        color, type: isTruck ? 'truck' : 'car',
        lane, laneChangeTimer: 0,
        nearMissed: false
    });
}

function spawnBikeFish() {
    const fromLeft = Math.random() < 0.5;
    const fy = 20 + Math.random() * (H - 60);
    const patterns = ['straight', 'wave', 'dive'];
    const pat = patterns[Math.floor(Math.random() * patterns.length)];
    bikeFish.push({
        x: fromLeft ? -12 : W + 12,
        y: fy, w: 10, h: 6,
        vx: (fromLeft ? 1 : -1) * (0.5 + Math.random() * 0.6),
        pattern: pat, originY: fy, timer: 0,
        nearMissed: false
    });
}

function spawnBikeChocolate() {
    const lane = Math.floor(Math.random() * 4);
    const lx = bikeLanes[lane];
    bikeChocolates.push({
        x: lx - 5, y: -12,
        w: 10, h: 8,
        vy: CHOCO_SPEED * bikeSpeed,
        collected: false, animTimer: 0
    });
}

function spawnBikePickup() {
    const lane = Math.floor(Math.random() * 4);
    const lx = bikeLanes[lane];
    const type = PICKUP_TYPES[Math.floor(Math.random() * PICKUP_TYPES.length)];
    bikePickups.push({
        x: lx - 5, y: -12,
        w: 10, h: 10,
        vy: CHOCO_SPEED * bikeSpeed,
        type, collected: false, animTimer: 0
    });
}

// ── Near-miss detection ──
function checkNearMiss(b) {
    const bCx = b.x + b.w / 2;
    const bCy = b.y + b.h / 2;

    for (const ob of bikeObstacles) {
        if (ob.nearMissed || invulnTimer > 0) continue;
        const oCx = ob.x + ob.w / 2;
        const oCy = ob.y + ob.h / 2;
        const dx = Math.abs(bCx - oCx);
        const dy = Math.abs(bCy - oCy);
        const close = dx < ob.w / 2 + NEAR_MISS_DIST && dy < ob.h / 2 + NEAR_MISS_DIST;
        const hit = aabb(b, ob);
        if (close && !hit) {
            ob.nearMissed = true;
            nearMissCombo++;
            nearMissTimer = NEAR_MISS_DECAY;
            const bonus = 5 * nearMissCombo;
            score += bonus;
            if (nearMissCombo >= 3) {
                SFX.combo();
                spawnFloatingText(bCx, b.y - 8, 'COMBO x' + nearMissCombo + '!', '#ff44ff');
            } else {
                SFX.nearMiss();
                spawnFloatingText(bCx, b.y - 8, 'CLOSE! +' + bonus, '#44ffff');
            }
            spawnParticles(bCx, bCy, '#44ffff', 3, 1.5);
            vibrate(20);
            missionProgress('nearmiss');
        }
    }

    for (const f of bikeFish) {
        if (f.nearMissed || invulnTimer > 0) continue;
        const fCx = f.x + f.w / 2;
        const fCy = f.y + f.h / 2;
        const dx = Math.abs(bCx - fCx);
        const dy = Math.abs(bCy - fCy);
        const close = dx < f.w / 2 + NEAR_MISS_DIST && dy < f.h / 2 + NEAR_MISS_DIST;
        const hit = aabb(b, f);
        if (close && !hit) {
            f.nearMissed = true;
            nearMissCombo++;
            nearMissTimer = NEAR_MISS_DECAY;
            const bonus = 5 * nearMissCombo;
            score += bonus;
            SFX.nearMiss();
            spawnFloatingText(bCx, b.y - 8, 'CLOSE! +' + bonus, '#44ffff');
            spawnParticles(bCx, bCy, '#44ffff', 3, 1.5);
            vibrate(20);
            missionProgress('nearmiss');
        }
    }
}

// ── Bike update ──
function updateBike() {
    if (state !== 'playing') return;
    const b = bike;

    if (!b.alive) {
        b.deathTimer++;
        if (b.deathTimer > DEATH_TIMER_FRAMES) {
            state = 'dead';
            stopMusic();
            if (score > bikeHighScore) {
                bikeHighScore = score;
                try {
                    localStorage.setItem('bikeHighScore', bikeHighScore);
                } catch (e) {
                    // localStorage unavailable — high score won't persist
                }
            }
            // Persistent progression: bank this run's distance
            const prevTotal = totalDistance;
            totalDistance += score;
            try {
                localStorage.setItem('bikeTotalDist', totalDistance);
            } catch (e) {
                // localStorage unavailable — progression won't persist
            }
            const unlocked = newUnlocks(prevTotal, totalDistance);
            if (unlocked.length > 0) SFX.unlock();

            overlay.textContent = '';
            const h = document.createElement('h1');
            h.style.color = '#ff4444';
            h.textContent = 'WIPEOUT!';
            const pStats = document.createElement('p');
            pStats.textContent = `Level: ${level} | Distance: ${score}`;
            const pBest = document.createElement('p');
            pBest.textContent = `Best: ${bikeHighScore}`;
            const pTotal = document.createElement('p');
            pTotal.style.fontSize = '11px';
            pTotal.style.color = '#888';
            pTotal.textContent = `Total distance: ${totalDistance}`;
            overlay.append(h, pStats, pBest, pTotal);
            for (const u of unlocked) {
                const pU = document.createElement('p');
                pU.style.color = u.hi;
                pU.style.marginTop = '8px';
                pU.textContent = `★ NEW BIKE UNLOCKED: ${u.name}!`;
                overlay.append(pU);
            }
            const nextU = FRAME_UNLOCKS.find(u => u.dist > totalDistance);
            if (nextU) {
                const pN = document.createElement('p');
                pN.style.fontSize = '11px';
                pN.style.color = '#666';
                pN.textContent = `Next bike at ${nextU.dist} total`;
                overlay.append(pN);
            }
            const pRetry = document.createElement('p');
            pRetry.className = 'blink';
            pRetry.style.marginTop = '16px';
            pRetry.textContent = 'Press ENTER or tap to retry';
            const pMenu = document.createElement('p');
            pMenu.style.fontSize = '11px';
            pMenu.style.color = '#555';
            pMenu.textContent = 'Press M for menu';
            overlay.append(pRetry, pMenu);
            overlay.classList.remove('hidden');
        }
        return;
    }

    // Input: combine keyboard + dpad
    let moveLeft = keys['ArrowLeft'] || keys['KeyA'] || dpadLeft;
    let moveRight = keys['ArrowRight'] || keys['KeyD'] || dpadRight;
    let moveUp = keys['ArrowUp'] || keys['KeyW'] || dpadUp;
    let moveDown = keys['ArrowDown'] || keys['KeyS'] || dpadDown;

    const dir = (moveLeft ? -1 : 0) + (moveRight ? 1 : 0);
    if (dir < 0 && !b._movedLeft) {
        const prev = b.lane;
        b.lane = Math.max(0, b.lane - 1);
        if (b.lane !== prev) SFX.laneSwitch();
        b._movedLeft = true;
    } else if (!moveLeft) { b._movedLeft = false; }
    if (dir > 0 && !b._movedRight) {
        const prev = b.lane;
        b.lane = Math.min(3, b.lane + 1);
        if (b.lane !== prev) SFX.laneSwitch();
        b._movedRight = true;
    } else if (!moveRight) { b._movedRight = false; }

    if (moveUp) b.y -= VERT_MOVE_SPEED;
    if (moveDown) b.y += VERT_MOVE_SPEED;

    if (touchActive) {
        const bikerCenterX = b.x + b.w / 2;
        const bikerCenterY = b.y + b.h / 2;
        const dx = touchGameX - bikerCenterX;
        const dy = touchGameY - bikerCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 3) {
            const moveSpeed = Math.min(dist * 0.15, 3.5);
            b.x += (dx / dist) * moveSpeed;
            b.y += (dy / dist) * moveSpeed;
        }
        let closestLane = 0;
        let closestDist = Infinity;
        for (let i = 0; i < bikeLanes.length; i++) {
            const ld = Math.abs((b.x + b.w / 2) - bikeLanes[i]);
            if (ld < closestDist) { closestDist = ld; closestLane = i; }
        }
        b.lane = closestLane;
    }

    b.y = clamp(b.y, 16, H - 20);
    b.x = clamp(b.x, ROAD_LEFT + 2, ROAD_RIGHT - b.w - 2);

    if (!touchActive) {
        const targetX = bikeLanes[b.lane] - 5;
        b.x = lerp(b.x, targetX, 0.18);
    }
    b.tilt = (bikeLanes[b.lane] - b.x - b.w / 2) * 0.3;

    b.pedalTimer++;
    if (b.pedalTimer > Math.max(3, 10 - bikeSpeed * 2)) {
        b.pedalTimer = 0;
        b.pedalFrame = 1 - b.pedalFrame;
    }

    // Level transition
    if (levelComplete) {
        levelCompleteTimer--;
        levelFlash = Math.max(0, levelFlash - 1);
        bikeScroll += 0.3;
        score = Math.floor(bikeScroll / SCORE_DIVISOR);
        bikeObstacles = bikeObstacles.filter(ob => { ob.y += ob.vy; return ob.y > -40 && ob.y < H + 40; });
        bikeFish = bikeFish.filter(f => { f.x += f.vx; return f.x > -20 && f.x < W + 20; });
        bikeChocolates = [];
        bikePickups = [];
        updateScenery(0.3);
        if (levelCompleteTimer <= 0) {
            levelComplete = false;
            levelScroll = 0;
        }
        updateParticles();
        updateFloatingTexts();
        decayScreenShake();
        return;
    }

    // Score & speed
    const baseSpeed = levelBaseSpeed() + score / 800;
    bikeSpeed = invulnTimer > 0 ? baseSpeed + INVULN_SPEED_BONUS : baseSpeed;
    bikeScroll += bikeSpeed;
    levelScroll += bikeSpeed;
    score = Math.floor(bikeScroll / SCORE_DIVISOR);

    // Update scenery parallax
    updateScenery(bikeSpeed);

    // Weather
    const theme = currentTheme();
    if (theme.weather) updateWeather(theme.weather, theme.weather === 'rain' ? 0.4 : 0.15);

    // Near-miss combo decay
    if (nearMissTimer > 0) {
        nearMissTimer--;
        if (nearMissTimer <= 0) nearMissCombo = 0;
    }

    // Biker trail: invulnerability > unlock trail > speed dust
    const rideFrame = currentFrame();
    if (invulnTimer > 0 && gameTime % 2 === 0) {
        spawnParticles(b.x + 5, b.y + 14, '#ffee44', 1, 0.8);
    } else if (rideFrame.trail && gameTime % 3 === 0) {
        spawnParticles(b.x + 2 + Math.random() * 6, b.y + 13, rideFrame.trail, 1, 0.7);
    } else if (bikeSpeed > 2.5 && gameTime % 3 === 0) {
        spawnParticles(b.x + 5, b.y + 14, '#888888', 1, 0.5);
    }

    // Level completion (boss levels require the boss defeated first)
    const needed = levelDistance(level);
    if (levelScroll / SCORE_DIVISOR >= needed && !boss) {
        level++;
        levelComplete = true;
        levelCompleteTimer = LEVEL_TRANSITION_TIME;
        levelFlash = 20;
        screenShake = 3;
        SFX.levelUp();
        spawnFloatingText(W / 2, H / 2 - 30, 'LEVEL ' + (level - 1) + ' CLEAR!', '#ffcc00');
        for (let i = 0; i < 8; i++) {
            spawnParticles(W / 2 + (Math.random() - 0.5) * 100, H / 2 + (Math.random() - 0.5) * 60, '#ffcc00', 4, 3);
            spawnParticles(W / 2 + (Math.random() - 0.5) * 100, H / 2 + (Math.random() - 0.5) * 60, '#44ff44', 3, 2);
        }
        startLevel();
    }

    // Wave pacing
    waveTimer++;
    const calm = inCalmWindow();

    // Spawn obstacles (paused during calm windows)
    bikeNextSpawn--;
    if (bikeNextSpawn <= 0 && !calm) {
        spawnCarObstacle();
        bikeNextSpawn = levelCarSpawnRate();
        if (level >= 4 && Math.random() < 0.25) spawnCarObstacle();
    }

    bikeFishTimer--;
    if (bikeFishTimer <= 0 && !calm) {
        spawnBikeFish();
        bikeFishTimer = levelFishSpawnRate();
    }

    bikeChocoTimer--;
    if (bikeChocoTimer <= 0) {
        spawnBikeChocolate();
        bikeChocoTimer = levelChocoSpawnRate();
    }

    bikePickupTimer--;
    if (bikePickupTimer <= 0) {
        spawnBikePickup();
        bikePickupTimer = PICKUP_SPAWN_MIN + Math.random() * PICKUP_SPAWN_RANGE;
    }

    // Boss AI: hovers in the top half, hunts the player's lane
    if (boss) {
        boss.y = lerp(boss.y, 36, 0.03);
        boss.laneTimer--;
        boss.hitFlash = Math.max(0, boss.hitFlash - 1);
        if (boss.laneTimer <= 0) {
            if (boss.lane < b.lane) boss.lane++;
            else if (boss.lane > b.lane) boss.lane--;
            boss.laneTimer = Math.max(45, 85 - level * 2);
        }
        boss.x = lerp(boss.x, bikeLanes[boss.lane] - boss.w / 2, 0.05);
        if (gameTime % 8 === 0) {
            spawnParticles(boss.x + boss.w / 2, boss.y + boss.h, '#666666', 1, 1);
        }
    }

    // Update cars
    for (const ob of bikeObstacles) {
        ob.y += ob.vy;
        ob.laneChangeTimer = Math.max(0, (ob.laneChangeTimer || 0) - 1);

        let blocked = false;
        for (const other of bikeObstacles) {
            if (other === ob || other.lane !== ob.lane) continue;
            const dy = other.y - ob.y;
            if (ob.vy > 0 && dy > 0 && dy < CAR_BLOCKING_DIST) blocked = true;
            if (ob.vy < 0 && dy < 0 && dy > -CAR_BLOCKING_DIST) blocked = true;
        }

        if (blocked && ob.laneChangeTimer <= 0) {
            const tryLanes = [];
            if (ob.lane > 0) tryLanes.push(ob.lane - 1);
            if (ob.lane < 3) tryLanes.push(ob.lane + 1);
            for (const nl of tryLanes) {
                let laneFree = true;
                for (const other of bikeObstacles) {
                    if (other === ob || other.lane !== nl) continue;
                    if (Math.abs(other.y - ob.y) < LANE_CHANGE_PROXIMITY) { laneFree = false; break; }
                }
                if (laneFree) {
                    ob.lane = nl;
                    ob.laneChangeTimer = LANE_CHANGE_COOLDOWN;
                    break;
                }
            }
        }

        const tgtX = bikeLanes[ob.lane] - (ob.type === 'truck' ? 7 : 6);
        ob.x = lerp(ob.x, tgtX, 0.08);
    }
    bikeObstacles = bikeObstacles.filter(ob => ob.y > -40 && ob.y < H + 40);

    // Update fish
    for (const f of bikeFish) {
        f.timer += 0.05;
        f.x += f.vx * bikeSpeed;
        switch (f.pattern) {
            case 'wave': f.y = f.originY + Math.sin(f.timer * 3) * 15; break;
            case 'dive': f.y = f.originY + Math.sin(f.timer * 1.5) * 30; break;
        }
    }
    bikeFish = bikeFish.filter(f => f.x > -20 && f.x < W + 20);

    // Update chocolates (magnet pulls them toward the biker)
    for (const ch of bikeChocolates) {
        ch.y += ch.vy;
        ch.animTimer++;
        if (magnetTimer > 0) magnetPull(ch, b);
    }
    bikeChocolates = bikeChocolates.filter(ch => ch.y < H + 20);

    // Update pickups
    for (const pu of bikePickups) {
        pu.y += pu.vy;
        pu.animTimer++;
        if (magnetTimer > 0) magnetPull(pu, b);
    }
    bikePickups = bikePickups.filter(pu => pu.y < H + 20);

    if (invulnTimer > 0) invulnTimer--;
    if (magnetTimer > 0) {
        magnetTimer--;
        if (gameTime % 4 === 0) spawnParticles(b.x + 5, b.y + 7, '#ff6688', 1, 1.2);
    }

    // Near-miss check (before collision, so we detect near misses on the same frame)
    const bNear = { x: b.x + COLLISION_PAD_X, y: b.y + COLLISION_PAD_Y, w: b.w - COLLISION_PAD_W, h: b.h - COLLISION_PAD_H };
    checkNearMiss(bNear);

    // Collision
    const bHit = { x: b.x + COLLISION_PAD_X, y: b.y + COLLISION_PAD_Y, w: b.w - COLLISION_PAD_W, h: b.h - COLLISION_PAD_H };

    for (const ob of bikeObstacles) {
        if (aabb(bHit, ob)) {
            if (invulnTimer > 0) {
                ob.destroyed = true;
                spawnParticles(ob.x + 6, ob.y + 10, ob.color, 12, 4);
                spawnParticles(ob.x + 6, ob.y + 10, '#ffcc00', 6, 3);
                screenShake = 4;
                SFX.destroy();
                missionProgress('destroy');
            } else if (bikeShield) {
                shieldAbsorb(ob, b);
            } else {
                killBiker(b, ob.color);
                return;
            }
        }
    }
    bikeObstacles = bikeObstacles.filter(ob => !ob.destroyed);

    for (const f of bikeFish) {
        if (aabb(bHit, f)) {
            if (invulnTimer > 0) {
                f.destroyed = true;
                spawnParticles(f.x + 5, f.y + 3, PAL.fishBody, 10, 4);
                spawnParticles(f.x + 5, f.y + 3, '#ffcc00', 6, 3);
                screenShake = 3;
                SFX.destroy();
            } else if (bikeShield) {
                shieldAbsorb(f, b);
            } else {
                killBiker(b, PAL.fishBody);
                return;
            }
        }
    }
    bikeFish = bikeFish.filter(f => !f.destroyed);

    // Boss collision
    if (boss && aabb(bHit, boss)) {
        if (invulnTimer > 0) {
            // hitFlash doubles as a damage cooldown so one overlap = one hit
            if (boss.hitFlash <= 0) {
                boss.hp--;
                boss.hitFlash = 20;
                boss.y -= 15; // knockback
                screenShake = 6;
                spawnParticles(boss.x + boss.w / 2, boss.y + boss.h / 2, '#883333', 10, 4);
                if (boss.hp <= 0) {
                    spawnParticles(boss.x + boss.w / 2, boss.y + boss.h / 2, '#ffcc00', 20, 5);
                    spawnParticles(boss.x + boss.w / 2, boss.y + boss.h / 2, '#ff4444', 15, 4);
                    score += 200;
                    spawnFloatingText(W / 2, H / 2 - 20, 'BOSS DOWN! +200', '#ffcc00');
                    SFX.bossDown();
                    screenShake = 10;
                    boss = null;
                    missionProgress('destroy');
                } else {
                    SFX.bossHit();
                }
            }
        } else if (bikeShield) {
            shieldAbsorb(null, b); // shield saves you but doesn't hurt the boss
        } else {
            killBiker(b, '#883333');
            return;
        }
    }

    for (const ch of bikeChocolates) {
        if (!ch.collected && aabb(bHit, ch)) {
            ch.collected = true;
            invulnTimer = INVULN_DURATION;
            screenShake = 3;
            spawnParticles(ch.x + 5, ch.y + 4, '#ffcc00', 12, 4);
            spawnParticles(ch.x + 5, ch.y + 4, PAL.choco, 8, 3);
            SFX.pickup();
            vibrate(40);
            spawnFloatingText(ch.x + 5, ch.y - 4, 'SUPER SPEED!', '#ffcc00');
            missionProgress('choco');
        }
    }

    for (const pu of bikePickups) {
        if (!pu.collected && aabb(bHit, pu)) {
            pu.collected = true;
            vibrate(40);
            applyPickup(pu, b);
        }
    }
    bikePickups = bikePickups.filter(pu => !pu.collected);

    updateParticles();
    updateFloatingTexts();
    decayScreenShake();
}

// ── Power-up / collision helpers ──

function magnetPull(item, b) {
    const dx = (b.x + b.w / 2) - (item.x + item.w / 2);
    const dy = (b.y + b.h / 2) - (item.y + item.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1 && dist < MAGNET_RANGE) {
        const pull = 2.2 * (1 - dist / MAGNET_RANGE) + 0.6;
        item.x += (dx / dist) * pull;
        item.y += (dy / dist) * pull;
    }
}

function shieldAbsorb(obstacle, b) {
    bikeShield = false;
    invulnTimer = SHIELD_MERCY_FRAMES;
    if (obstacle) obstacle.destroyed = true;
    screenShake = 6;
    spawnParticles(b.x + 5, b.y + 7, '#44aaff', 15, 4);
    SFX.shieldBreak();
    vibrate(80);
    spawnFloatingText(b.x + 5, b.y - 8, 'SHIELD LOST!', '#44aaff');
}

function killBiker(b, color) {
    b.alive = false;
    b.deathTimer = 0;
    hitStop = 30; // slow-motion death
    screenShake = 10;
    spawnParticles(b.x + 5, b.y + 7, color, 15, 4);
    spawnParticles(b.x + 5, b.y + 7, '#888', 10, 3);
    SFX.death();
    vibrate([100, 50, 200]);
}

function applyPickup(pu, b) {
    if (pu.type === 'shield') {
        bikeShield = true;
        spawnParticles(pu.x + 5, pu.y + 5, '#44aaff', 12, 4);
        SFX.shield();
        spawnFloatingText(pu.x + 5, pu.y - 4, 'SHIELD!', '#44aaff');
    } else if (pu.type === 'bell') {
        // Shockwave: clears every car and fish on screen
        let cleared = 0;
        for (const f of bikeFish) {
            spawnParticles(f.x + 5, f.y + 3, PAL.fishBody, 8, 4);
            cleared++;
        }
        bikeFish = [];
        for (const ob of bikeObstacles) {
            spawnParticles(ob.x + ob.w / 2, ob.y + ob.h / 2, ob.color, 10, 4);
            spawnParticles(ob.x + ob.w / 2, ob.y + ob.h / 2, '#ffdd44', 5, 3);
            missionProgress('destroy');
            cleared++;
        }
        bikeObstacles = [];
        // Expanding ring of particles from the biker
        for (let a = 0; a < 16; a++) {
            const ang = (a / 16) * Math.PI * 2;
            particles.push({
                x: b.x + 5, y: b.y + 7,
                vx: Math.cos(ang) * 4, vy: Math.sin(ang) * 4,
                life: 25, maxLife: 25, color: '#ffdd44', size: 2
            });
        }
        screenShake = 8;
        SFX.bell();
        spawnFloatingText(pu.x + 5, pu.y - 4, cleared > 0 ? 'SHOCKWAVE!' : 'RING!', '#ffdd44');
    } else if (pu.type === 'magnet') {
        magnetTimer = MAGNET_DURATION;
        spawnParticles(pu.x + 5, pu.y + 5, '#ff6688', 12, 4);
        SFX.magnet();
        spawnFloatingText(pu.x + 5, pu.y - 4, 'MAGNET!', '#ff6688');
    }
}

// ── Bike drawing ──

function drawBikeRoad() {
    const t = currentTheme();

    bctx.fillStyle = t.sky;
    bctx.fillRect(0, 0, W, H);

    bctx.fillStyle = t.grass;
    bctx.fillRect(0, 0, ROAD_LEFT, H);
    bctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H);

    const grassScroll = (bikeScroll * 0.6) % 8;
    for (let gy = -8; gy < H; gy += 8) {
        const ry = gy + grassScroll;
        drawPixel(5, ry, t.grassDark);
        drawPixel(18, ry + 3, t.grassLight);
        drawPixel(12, ry + 5, t.grassDark);
        drawPixel(W - 10, ry + 1, t.grassDark);
        drawPixel(W - 22, ry + 5, t.grassLight);
        drawPixel(W - 16, ry + 3, t.grassDark);
    }

    // Draw scenery behind road
    drawAllScenery(t);

    bctx.fillStyle = t.road;
    bctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);

    drawRect(ROAD_LEFT, 0, 2, H, t.edge);
    drawRect(ROAD_RIGHT - 2, 0, 2, H, t.edge);

    const dashLen = 12;
    const gapLen = 10;
    const totalDash = dashLen + gapLen;
    const dashOffset = (bikeScroll * 1.5) % totalDash;
    for (let li = 1; li < 4; li++) {
        const lx = ROAD_LEFT + (ROAD_RIGHT - ROAD_LEFT) * li / 4;
        for (let dy = -dashLen + dashOffset; dy < H + dashLen; dy += totalDash) {
            drawRect(lx - 1, dy, 2, dashLen, t.dash);
        }
    }
}

function drawBikeCar(ob) {
    const x = Math.round(ob.x);
    const y = Math.round(ob.y);

    if (ob.type === 'truck') {
        drawRect(x, y + 2, 14, 18, ob.color);
        drawRect(x + 2, y + 4, 10, 8, darkenColor(ob.color));
        drawRect(x + 2, y + 2, 10, 3, '#88ccff');
        drawPixel(x + 3, y + 2, '#aaddff');
        drawRect(x + 2, y + 18, 10, 2, '#6699bb');
        drawRect(x - 1, y + 3, 2, 5, '#222');
        drawRect(x - 1, y + 16, 2, 5, '#222');
        drawRect(x + 13, y + 3, 2, 5, '#222');
        drawRect(x + 13, y + 16, 2, 5, '#222');
        drawPixel(x + 2, y + 1, '#ffee88');
        drawPixel(x + 11, y + 1, '#ffee88');
        drawPixel(x + 2, y + 20, '#ff4444');
        drawPixel(x + 11, y + 20, '#ff4444');
        drawRect(x + 1, y + 2, 12, 1, lightenColor(ob.color));
    } else {
        drawRect(x, y + 4, 12, 12, ob.color);
        drawRect(x + 2, y + 6, 8, 6, darkenColor(ob.color));
        drawRect(x + 2, y + 4, 8, 3, '#88ccff');
        drawPixel(x + 3, y + 4, '#aaddff');
        drawRect(x + 2, y + 14, 8, 2, '#6699bb');
        drawRect(x - 1, y + 5, 2, 4, '#222');
        drawRect(x - 1, y + 13, 2, 4, '#222');
        drawRect(x + 11, y + 5, 2, 4, '#222');
        drawRect(x + 11, y + 13, 2, 4, '#222');
        drawPixel(x + 2, y + 3, '#ffee88');
        drawPixel(x + 9, y + 3, '#ffee88');
        drawPixel(x + 2, y + 16, '#ff4444');
        drawPixel(x + 9, y + 16, '#ff4444');
        drawRect(x + 1, y + 4, 10, 1, lightenColor(ob.color));
    }

    // Headlight glow for cars coming toward player
    if (ob.vy > 0) {
        bctx.globalAlpha = 0.15;
        drawRect(x + 1, y + ob.h, 3, 4, '#ffee88');
        drawRect(x + ob.w - 4, y + ob.h, 3, 4, '#ffee88');
        bctx.globalAlpha = 1;
    }
}

function drawBikeFishSprite(f) {
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    const facingRight = f.vx > 0;
    const tailWag = Math.sin(f.timer * 3) > 0 ? 1 : 0;
    drawFish(x, y, facingRight, tailWag);
}

function drawBiker(bx, by) {
    const x = Math.round(bx);
    const y = Math.round(by);
    const frame = bike.pedalFrame;

    if (invulnTimer > 0) {
        const pulse = Math.sin(invulnTimer * 0.3) * 0.3 + 0.5;
        bctx.globalAlpha = pulse * (invulnTimer > 30 ? 1 : invulnTimer / 30);
        drawRect(x - 2, y - 2, 14, 18, '#ffcc00');
        bctx.globalAlpha = 1;
        if (invulnTimer % 3 === 0) {
            spawnParticles(bx + Math.random() * 10, by + Math.random() * 14, '#ffee44', 1, 1.5);
        }
    }

    // Shield bubble
    if (bikeShield) {
        const pulse = Math.sin(gameTime * 0.15) * 0.15 + 0.3;
        bctx.globalAlpha = pulse;
        drawRect(x - 3, y - 3, 16, 20, '#44aaff');
        bctx.globalAlpha = 1;
        drawPixel(x - 3, y + 3, '#88ccff');
        drawPixel(x + 12, y + 8, '#88ccff');
    }

    // Bicycle (whole rig styled by progression unlocks)
    const fr = currentFrame();
    drawRect(x + 1, y + 11, 3, 3, '#444');
    drawPixel(x + 2, y + 12, fr.hi);
    drawRect(x + 7, y + 11, 3, 3, '#444');
    drawPixel(x + 8, y + 12, fr.hi);
    drawRect(x + 3, y + 10, 5, 1, fr.color);
    drawRect(x + 4, y + 9, 1, 2, fr.color);
    drawRect(x + 6, y + 9, 1, 2, fr.color);
    drawRect(x + 3, y + 9, 3, 1, fr.hi);
    drawRect(x + 7, y + 8, 2, 1, fr.hi);

    if (frame === 0) {
        drawRect(x + 3, y + 8, 2, 2, PAL.pants);
        drawRect(x + 6, y + 7, 2, 2, PAL.pants);
        drawRect(x + 3, y + 10, 2, 1, PAL.shoe);
        drawRect(x + 6, y + 9, 2, 1, PAL.shoe);
    } else {
        drawRect(x + 3, y + 7, 2, 2, PAL.pants);
        drawRect(x + 6, y + 8, 2, 2, PAL.pants);
        drawRect(x + 3, y + 9, 2, 1, PAL.shoe);
        drawRect(x + 6, y + 10, 2, 1, PAL.shoe);
    }
    drawRect(x + 3, y + 4, 5, 4, fr.shirt);
    drawPixel(x + 4, y + 4, fr.shirtHi);
    drawRect(x + 7, y + 5, 2, 2, PAL.skin);
    drawPixel(x + 2, y + 5, PAL.skin);
    drawRect(x + 3, y + 1, 5, 3, PAL.skin);
    drawRect(x + 3, y, 5, 2, PAL.hair);
    drawRect(x + 2, y, 6, 1, PAL.hair);
    drawPixel(x + 4, y, PAL.hairHi);
    drawPixel(x + 6, y, PAL.hairHi);
    drawPixel(x + 2, y - 1, PAL.hair);
    drawPixel(x + 3, y - 1, PAL.hairHi);

    // Hair blowing at high speed
    if (bikeSpeed > 2) {
        drawPixel(x + 1, y - 1, PAL.hair);
        if (bikeSpeed > 3) drawPixel(x, y - 1, PAL.hairHi);
    }

    drawPixel(x + 5, y + 2, PAL.black);
    drawPixel(x + 7, y + 2, PAL.black);
}

// ── Bike render ──
function renderBike() {
    bctx.clearRect(0, 0, W, H);

    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    bctx.save();
    bctx.translate(shakeX, shakeY);

    drawBikeRoad();

    // Speed lines behind everything
    drawSpeedLines(bikeSpeed, invulnTimer > 0);

    for (const ch of bikeChocolates) {
        if (!ch.collected) drawChocolate(ch, 0);
    }
    for (const pu of bikePickups) drawPickup(pu);

    for (const ob of bikeObstacles) drawBikeCar(ob);
    for (const f of bikeFish) drawBikeFishSprite(f);
    if (boss) drawBoss(boss);

    // Weather on top of road
    drawWeather();

    for (const pt of particles) {
        bctx.globalAlpha = pt.life / pt.maxLife;
        drawRect(pt.x, pt.y, pt.size, pt.size, pt.color);
    }
    bctx.globalAlpha = 1;

    if (bike.alive) {
        drawBiker(bike.x, bike.y);
    } else if (bike.deathTimer < DEATH_BLINK_FRAMES) {
        if (bike.deathTimer % 4 < 2) drawBiker(bike.x, bike.y);
    }

    // Floating texts
    drawFloatingTexts();

    // Level flash overlay
    if (levelFlash > 0) {
        bctx.globalAlpha = levelFlash / 30;
        bctx.fillStyle = '#ffffff';
        bctx.fillRect(0, 0, W, H);
        bctx.globalAlpha = 1;
    }

    // HUD background strip
    bctx.globalAlpha = 0.5;
    drawRect(0, 0, W, 20, '#000000');
    bctx.globalAlpha = 1;

    drawPixelText('LVL ' + level, 4, 4, '#ffffff');
    drawPixelText('DIST ' + score, W / 2, 4, '#ffffff', 'center');
    drawPixelText('BEST ' + bikeHighScore, W - 4, 4, '#ffffff', 'right');

    // Level progress bar
    const barW = 40;
    drawRect(4, 14, barW, 4, '#222');
    drawRect(4, 14, barW, 1, '#444');
    const needed = levelDistance(level);
    const lvlFill = clamp((levelScroll / SCORE_DIVISOR) / needed, 0, 1);
    const lvlColor = lvlFill < 0.5 ? '#44bbff' : lvlFill < 0.8 ? '#44ff44' : '#ffcc00';
    drawRect(4, 14, Math.floor(lvlFill * barW), 4, lvlColor);

    // Theme name on level start
    if (levelScroll / SCORE_DIVISOR < 30) {
        const t = currentTheme();
        bctx.globalAlpha = clamp(1 - (levelScroll / SCORE_DIVISOR) / 30, 0, 1);
        drawPixelText(t.name, W / 2, 36, '#ffffff', 'center');
        bctx.globalAlpha = 1;
    }

    // Near-miss combo
    if (nearMissCombo >= 2 && nearMissTimer > 0) {
        drawPixelText('X' + nearMissCombo, W - 4, 44, '#44ffff', 'right');
    }

    // Mission tracker
    if (mission && !levelComplete) {
        if (mission.done) {
            drawPixelText('✓ ' + mission.text, 4, 23, '#44ff88');
        } else {
            drawPixelText(mission.text + ' (' + mission.progress + '/' + mission.n + ')', 4, 23, '#cccccc');
        }
    }

    // Boss HP (right edge, below BEST)
    if (boss) {
        drawPixelText('BOSS', W - 4, 23, '#ff4444', 'right');
        for (let i = 0; i < BOSS_HP; i++) {
            drawRect(W - 31 + i * 9, 30, 7, 3, i < boss.hp ? '#ff4444' : '#552222');
        }
    }

    // Active effect indicators
    let fxY = 32;
    if (magnetTimer > 0) {
        drawPixelText('MAGNET ' + Math.ceil(magnetTimer / 60), 4, fxY, '#ff6688');
        fxY += 8;
    }
    if (bikeShield) {
        drawPixelText('SHIELD', 4, fxY, '#44aaff');
    }

    // Calm window hint
    if (inCalmWindow()) {
        bctx.globalAlpha = 0.6 + Math.sin(gameTime * 0.1) * 0.3;
        drawPixelText('~ BREATHER ~', W / 2, H - 12, '#88dd88', 'center');
        bctx.globalAlpha = 1;
    }

    // Level complete banner
    if (levelComplete) {
        const bannerY = H / 2 - 16;
        bctx.globalAlpha = 0.8;
        drawRect(0, bannerY, W, 32, '#000000');
        bctx.globalAlpha = 1;
        drawPixelText('LEVEL ' + (level - 1) + ' COMPLETE!', W / 2, bannerY + 8, '#ffcc00', 'center');
        drawPixelText('LEVEL ' + level + ': ' + currentTheme().name, W / 2, bannerY + 20, '#aaaaaa', 'center');
    }

    bctx.restore();

    // Pause button (mobile) and paused overlay — drawn without screen shake
    drawPauseButton();
    if (state === 'paused') {
        bctx.globalAlpha = 0.7;
        drawRect(0, 0, W, H, '#000000');
        bctx.globalAlpha = 1;
        drawPixelText('PAUSED', W / 2, H / 2 - 10, '#ffffff', 'center', 2);
        drawPixelText(isMobile ? 'TAP BUTTON TO RESUME' : 'PRESS P TO RESUME', W / 2, H / 2 + 8, '#888888', 'center');
    }

    drawDpad();
    blitToScreen();
}

function drawPauseButton() {
    if (!isMobile || (state !== 'playing' && state !== 'paused')) return;
    bctx.globalAlpha = 0.4;
    drawRect(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h, '#222222');
    drawRect(PAUSE_BTN.x + 1, PAUSE_BTN.y + 1, PAUSE_BTN.w - 2, PAUSE_BTN.h - 2, '#333333');
    if (state === 'paused') {
        // Play triangle
        drawRect(PAUSE_BTN.x + 6, PAUSE_BTN.y + 4, 2, 8, '#ffffff');
        drawRect(PAUSE_BTN.x + 8, PAUSE_BTN.y + 5, 2, 6, '#ffffff');
        drawRect(PAUSE_BTN.x + 10, PAUSE_BTN.y + 6, 1, 4, '#ffffff');
    } else {
        // Pause bars
        drawRect(PAUSE_BTN.x + 5, PAUSE_BTN.y + 4, 2, 8, '#ffffff');
        drawRect(PAUSE_BTN.x + 9, PAUSE_BTN.y + 4, 2, 8, '#ffffff');
    }
    bctx.globalAlpha = 1;
}

// ── Pickup sprites ──
function drawPickup(pu) {
    if (pu.collected) return;
    const bob = Math.sin(pu.animTimer * 0.08) * 2;
    const x = Math.round(pu.x);
    const y = Math.round(pu.y + bob);

    if (pu.type === 'shield') {
        drawRect(x + 2, y, 6, 2, '#2277cc');
        drawRect(x + 1, y + 2, 8, 4, '#2277cc');
        drawRect(x + 2, y + 6, 6, 2, '#2277cc');
        drawRect(x + 3, y + 8, 4, 1, '#2277cc');
        drawRect(x + 2, y + 1, 6, 5, '#44aaff');
        drawRect(x + 4, y + 2, 2, 4, '#88ccff');
        drawPixel(x + 3, y + 1, '#aaddff');
    } else if (pu.type === 'bell') {
        drawPixel(x + 4, y, '#886611');
        drawPixel(x + 5, y, '#886611');
        drawRect(x + 3, y + 1, 4, 2, '#ffcc33');
        drawRect(x + 2, y + 3, 6, 3, '#ffcc33');
        drawRect(x + 1, y + 6, 8, 1, '#ddaa22');
        drawPixel(x + 4, y + 8, '#886611');
        drawPixel(x + 3, y + 2, '#ffee88');
    } else if (pu.type === 'magnet') {
        drawRect(x + 1, y, 3, 6, '#dd3355');
        drawRect(x + 6, y, 3, 6, '#dd3355');
        drawRect(x + 1, y + 5, 8, 3, '#dd3355');
        drawRect(x + 2, y + 1, 1, 4, '#ff6688');
        drawRect(x + 7, y + 1, 1, 4, '#ff6688');
        drawRect(x + 1, y, 3, 2, '#eeeeee');
        drawRect(x + 6, y, 3, 2, '#eeeeee');
    }
}

// ── Boss sprite: big menacing truck ──
function drawBoss(bs) {
    const x = Math.round(bs.x);
    const y = Math.round(bs.y);
    const flash = bs.hitFlash > 0 && bs.hitFlash % 2 === 0;
    const body = flash ? '#ffffff' : '#882222';
    const dark = flash ? '#dddddd' : '#661111';

    // Trailer
    drawRect(x, y + 8, 16, 20, body);
    drawRect(x + 2, y + 10, 12, 14, dark);
    // Cab
    drawRect(x + 1, y, 14, 8, body);
    drawRect(x + 3, y + 1, 10, 4, '#ffaa44');
    drawPixel(x + 4, y + 2, '#ffdd88');
    // Angry eyes on windshield
    drawPixel(x + 5, y + 3, '#000');
    drawPixel(x + 10, y + 3, '#000');
    // Wheels
    drawRect(x - 2, y + 2, 2, 5, '#111');
    drawRect(x + 16, y + 2, 2, 5, '#111');
    drawRect(x - 2, y + 12, 2, 6, '#111');
    drawRect(x + 16, y + 12, 2, 6, '#111');
    drawRect(x - 2, y + 21, 2, 6, '#111');
    drawRect(x + 16, y + 21, 2, 6, '#111');
    // Hazard stripes on rear
    for (let i = 0; i < 4; i++) {
        drawRect(x + 1 + i * 4, y + 26, 2, 2, i % 2 === 0 ? '#ffcc00' : '#111111');
    }
    // Menacing exhaust glow
    drawPixel(x + 2, y - 1, '#ff6600');
    drawPixel(x + 13, y - 1, '#ff6600');
}
