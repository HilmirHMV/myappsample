/**
 * Tests for the 3D mode game logic (bike3d.js) — pure logic only,
 * WebGL rendering is not exercised in jsdom.
 */
const { setupGameEnvironment } = require('./setup');

beforeAll(() => {
  setupGameEnvironment();
});

beforeEach(() => {
  state = 'playing';
  start3DMode();
});

describe('lane math', () => {
  test('g3LaneX maps lanes to world x positions', () => {
    expect(g3LaneX(0)).toBe(-3);
    expect(g3LaneX(1)).toBe(-1);
    expect(g3LaneX(2)).toBe(1);
    expect(g3LaneX(3)).toBe(3);
  });

  test('g3LaneX clamps out-of-range lanes', () => {
    expect(g3LaneX(-1)).toBe(-3);
    expect(g3LaneX(99)).toBe(3);
  });

  test('g3MoveLeft/g3MoveRight stay within lanes', () => {
    g3Player.lane = 0;
    g3MoveLeft();
    expect(g3Player.lane).toBe(0);
    g3Player.lane = 3;
    g3MoveRight();
    expect(g3Player.lane).toBe(3);
    g3Player.lane = 1;
    g3MoveRight();
    expect(g3Player.lane).toBe(2);
  });
});

describe('jump physics', () => {
  test('jump only works from the ground', () => {
    g3Player.onGround = true;
    g3Jump();
    expect(g3Player.vy).toBeCloseTo(G3_JUMP_VY);
    expect(g3Player.onGround).toBe(false);
    const vyMid = g3Player.vy;
    g3Jump(); // mid-air — no double jump
    expect(g3Player.vy).toBe(vyMid);
  });

  test('gravity brings the player back to the ground', () => {
    g3Jump();
    for (let i = 0; i < 300 && !g3Player.onGround; i++) update3D();
    expect(g3Player.onGround).toBe(true);
    expect(g3Player.y).toBe(0);
  });
});

describe('speed & score', () => {
  test('speed ramps with distance', () => {
    expect(g3SpeedFor(0, 0)).toBeCloseTo(G3_BASE_SPEED);
    expect(g3SpeedFor(4000, 0)).toBeCloseTo(G3_BASE_SPEED + 1);
  });

  test('boost adds flat bonus', () => {
    expect(g3SpeedFor(0, 100)).toBeCloseTo(G3_BASE_SPEED + G3_BOOST_BONUS);
  });

  test('score is floored distance', () => {
    g3Dist = 123.9;
    expect(g3Score()).toBe(123);
  });
});

describe('collision', () => {
  test('car hit requires same lane and close z', () => {
    const p = { lane: 1, x: -1, y: 0 };
    expect(g3HitCar(p, { lane: 1, z: 0.5 })).toBe(true);
    expect(g3HitCar(p, { lane: 2, z: 0.5 })).toBe(false);
    expect(g3HitCar(p, { lane: 1, z: 10 })).toBe(false);
  });

  test('an airborne player above car height clears the car', () => {
    const airborne = { lane: 1, x: -1, y: G3_CAR_TOP + 0.1 };
    expect(g3HitCar(airborne, { lane: 1, z: 0.5 })).toBe(false);
    expect(g3ClearedCar(airborne, { lane: 1, z: 0.5 })).toBe(true);
  });

  test('jump peak is high enough to clear a car with time to spare', () => {
    // Simulate the jump arc and count frames spent above the car top
    let y = 0, vy = G3_JUMP_VY, frames = 0;
    while (y >= 0) {
      y += vy;
      vy -= G3_GRAVITY;
      if (y >= G3_CAR_TOP) frames++;
    }
    expect(frames).toBeGreaterThan(15);
  });

  test('clearing a car awards a distance bonus', () => {
    g3Player.y = G3_CAR_TOP + 0.5;
    g3Player.onGround = false;
    g3Player.vy = 0.1;
    g3Cars = [{ lane: g3Player.lane, z: 0, fwd: 0.1, color: [1, 0, 0] }];
    const before = g3Dist;
    update3D();
    expect(state).toBe('playing');
    expect(g3Dist).toBeGreaterThan(before + G3_CLEAR_BONUS - 1);
    expect(g3Cars[0].cleared).toBe(true);
  });

  test('clearing a car fires a shockwave and speed boost', () => {
    g3Player.y = G3_CAR_TOP + 0.5;
    g3Player.onGround = false;
    g3Player.vy = 0.1;
    g3Cars = [{ lane: g3Player.lane, z: 0, fwd: 0.1, color: [1, 0, 0] }];
    update3D();
    expect(g3Waves.length).toBe(1);
    expect(g3Waves[0].lane).toBe(g3Player.lane);
    expect(g3ClearBoost).toBeGreaterThan(0);
  });

  test('shockwave destroys cars ahead in its lane', () => {
    g3Waves = [{ lane: 2, z: -1, age: 0 }];
    g3ClearBoost = 0;
    g3Player.lane = 0; // out of the way
    g3Player.x = -3;
    g3Cars = [
      { lane: 2, z: -30, fwd: 0.1, color: [1, 0, 0] },
      { lane: 1, z: -30, fwd: 0.1, color: [0, 0, 1] }, // other lane — safe
    ];
    for (let i = 0; i < 120 && g3Cars.length > 1; i++) update3D();
    expect(g3Cars.length).toBe(1);
    expect(g3Cars[0].lane).toBe(1);
  });

  test('clear boost adds speed and expires', () => {
    g3ClearBoost = 2;
    update3D();
    expect(g3Speed).toBeCloseTo(g3SpeedFor(g3Dist, g3Invuln) + G3_CLEAR_BOOST_SPD, 1);
    update3D();
    update3D();
    expect(g3ClearBoost).toBe(0);
  });

  test('fish can be jumped over', () => {
    const fish = { x: -1, z: 0, y: 0.2 };
    expect(g3HitFish({ lane: 1, x: -1, y: 0 }, fish)).toBe(true);
    expect(g3HitFish({ lane: 1, x: -1, y: 2.5 }, fish)).toBe(false);
  });

  test('chocolate grants invulnerability via update', () => {
    g3Chocos = [{ lane: g3Player.lane, z: 0, spin: 0 }];
    g3Invuln = 0;
    update3D();
    expect(g3Invuln).toBeGreaterThan(0);
  });

  test('car collision kills without invulnerability', () => {
    g3Cars = [{ lane: g3Player.lane, z: 0, fwd: 0.1, color: [1, 0, 0] }];
    g3Invuln = 0;
    update3D();
    expect(state).toBe('dead');
  });

  test('invulnerable player destroys cars instead of dying', () => {
    g3Cars = [{ lane: g3Player.lane, z: 0, fwd: 0.1, color: [1, 0, 0] }];
    g3Invuln = 100;
    update3D();
    expect(state).toBe('playing');
    expect(g3Cars.length).toBe(0);
  });
});

describe('spawners', () => {
  test('spawned cars start far away in a valid lane', () => {
    g3Cars = [];
    g3SpawnCar();
    expect(g3Cars.length).toBe(1);
    expect(g3Cars[0].z).toBe(G3_SPAWN_Z);
    expect(g3Cars[0].lane).toBeGreaterThanOrEqual(0);
    expect(g3Cars[0].lane).toBeLessThanOrEqual(3);
  });

  test('fish spawn from either side moving inward', () => {
    for (let i = 0; i < 10; i++) {
      g3Fish = [];
      g3SpawnFish();
      const f = g3Fish[0];
      if (f.x < 0) expect(f.vx).toBeGreaterThan(0);
      else expect(f.vx).toBeLessThan(0);
    }
  });
});

describe('mode selection', () => {
  test('init3D fails gracefully without WebGL (jsdom)', () => {
    expect(init3D()).toBe(false);
  });

  test('startGame falls back to 2D when WebGL is unavailable', () => {
    gameMode = '3d';
    state = 'title';
    startGame();
    expect(gameMode).toBe('2d');
    expect(state).toBe('playing');
  });

  test('backToMenu returns to title and hides overlay', () => {
    state = 'dead';
    backToMenu();
    expect(state).toBe('title');
    expect(overlay.classList.contains('hidden')).toBe(true);
  });
});
