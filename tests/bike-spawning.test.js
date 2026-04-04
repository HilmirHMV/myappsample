/**
 * Tests for obstacle/collectible spawning systems (bike.js)
 */
const { setupGameEnvironment } = require('./setup');

beforeAll(() => {
  setupGameEnvironment();
});

beforeEach(() => {
  state = 'playing';
  particles = [];
  screenShake = 0;
  invulnTimer = 0;
  score = 0;
  startBikeMode();
});

// ── Car spawning ──

describe('spawnCarObstacle', () => {
  test('adds a car to bikeObstacles', () => {
    spawnCarObstacle();
    expect(bikeObstacles.length).toBe(1);
  });

  test('car has required properties', () => {
    spawnCarObstacle();
    const car = bikeObstacles[0];
    expect(car).toHaveProperty('x');
    expect(car).toHaveProperty('y');
    expect(car).toHaveProperty('w', 12);
    expect(car).toHaveProperty('h', 20);
    expect(car).toHaveProperty('vy');
    expect(car).toHaveProperty('color');
    expect(car).toHaveProperty('type', 'car');
    expect(car).toHaveProperty('lane');
  });

  test('car spawns in a valid lane (0-3)', () => {
    for (let i = 0; i < 20; i++) {
      bikeObstacles = [];
      spawnCarObstacle();
      if (bikeObstacles.length > 0) {
        expect(bikeObstacles[0].lane).toBeGreaterThanOrEqual(0);
        expect(bikeObstacles[0].lane).toBeLessThanOrEqual(3);
      }
    }
  });

  test('car spawns off-screen (top or bottom)', () => {
    spawnCarObstacle();
    const car = bikeObstacles[0];
    // Cars spawn at y = -24 (top) or y = H + 20 (bottom)
    const spawnedTop = car.y === -24;
    const spawnedBottom = car.y === H + 20;
    expect(spawnedTop || spawnedBottom).toBe(true);
  });

  test('avoids spawning in occupied lanes near edges', () => {
    // Fill all lanes with cars near the spawn zone
    for (let lane = 0; lane < 4; lane++) {
      bikeObstacles.push({
        x: bikeLanes[lane] - 6, y: 10, w: 12, h: 20,
        vy: 1, color: '#f00', type: 'car', lane, laneChangeTimer: 0
      });
    }
    const countBefore = bikeObstacles.length;
    spawnCarObstacle();
    // Should not add a car since all lanes are occupied
    expect(bikeObstacles.length).toBe(countBefore);
  });

  test('multiple cars can exist simultaneously', () => {
    spawnCarObstacle();
    spawnCarObstacle();
    // May have 1-2 cars depending on lane availability
    expect(bikeObstacles.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Fish spawning ──

describe('spawnBikeFish', () => {
  test('adds a fish to bikeFish', () => {
    spawnBikeFish();
    expect(bikeFish.length).toBe(1);
  });

  test('fish has required properties', () => {
    spawnBikeFish();
    const fish = bikeFish[0];
    expect(fish).toHaveProperty('x');
    expect(fish).toHaveProperty('y');
    expect(fish).toHaveProperty('w', 10);
    expect(fish).toHaveProperty('h', 6);
    expect(fish).toHaveProperty('vx');
    expect(fish).toHaveProperty('pattern');
    expect(fish).toHaveProperty('originY');
    expect(fish).toHaveProperty('timer', 0);
  });

  test('fish spawns from left or right edge', () => {
    for (let i = 0; i < 20; i++) {
      bikeFish = [];
      spawnBikeFish();
      const fish = bikeFish[0];
      const fromLeft = fish.x === -12;
      const fromRight = fish.x === W + 12;
      expect(fromLeft || fromRight).toBe(true);
    }
  });

  test('fish from left moves right (positive vx)', () => {
    // Spawn many fish and check those from left
    for (let i = 0; i < 50; i++) {
      bikeFish = [];
      spawnBikeFish();
      const fish = bikeFish[0];
      if (fish.x === -12) {
        expect(fish.vx).toBeGreaterThan(0);
      }
    }
  });

  test('fish from right moves left (negative vx)', () => {
    for (let i = 0; i < 50; i++) {
      bikeFish = [];
      spawnBikeFish();
      const fish = bikeFish[0];
      if (fish.x === W + 12) {
        expect(fish.vx).toBeLessThan(0);
      }
    }
  });

  test('fish spawns within playable y range', () => {
    for (let i = 0; i < 20; i++) {
      bikeFish = [];
      spawnBikeFish();
      const fish = bikeFish[0];
      expect(fish.y).toBeGreaterThanOrEqual(20);
      expect(fish.y).toBeLessThanOrEqual(H - 40);
    }
  });

  test('fish pattern is one of the valid patterns', () => {
    const validPatterns = ['straight', 'wave', 'dive'];
    for (let i = 0; i < 30; i++) {
      bikeFish = [];
      spawnBikeFish();
      expect(validPatterns).toContain(bikeFish[0].pattern);
    }
  });
});

// ── Chocolate spawning ──

describe('spawnBikeChocolate', () => {
  test('adds a chocolate to bikeChocolates', () => {
    spawnBikeChocolate();
    expect(bikeChocolates.length).toBe(1);
  });

  test('chocolate has required properties', () => {
    spawnBikeChocolate();
    const choco = bikeChocolates[0];
    expect(choco).toHaveProperty('x');
    expect(choco).toHaveProperty('y', -12);
    expect(choco).toHaveProperty('w', 10);
    expect(choco).toHaveProperty('h', 8);
    expect(choco).toHaveProperty('vy');
    expect(choco).toHaveProperty('collected', false);
    expect(choco).toHaveProperty('animTimer', 0);
  });

  test('chocolate spawns above the screen', () => {
    spawnBikeChocolate();
    expect(bikeChocolates[0].y).toBe(-12);
  });

  test('chocolate x position aligns with a lane', () => {
    for (let i = 0; i < 20; i++) {
      bikeChocolates = [];
      spawnBikeChocolate();
      const choco = bikeChocolates[0];
      // x = bikeLanes[lane] - 5
      const matchesLane = bikeLanes.some(lx => choco.x === lx - 5);
      expect(matchesLane).toBe(true);
    }
  });

  test('chocolate moves downward', () => {
    spawnBikeChocolate();
    expect(bikeChocolates[0].vy).toBeGreaterThan(0);
  });
});

// ── startBikeMode initialization ──

describe('startBikeMode', () => {
  test('initializes bike in lane 1', () => {
    startBikeMode();
    expect(bike.lane).toBe(1);
  });

  test('bike starts alive', () => {
    startBikeMode();
    expect(bike.alive).toBe(true);
  });

  test('clears all obstacles', () => {
    bikeObstacles = [{ x: 0 }];
    bikeFish = [{ x: 0 }];
    bikeChocolates = [{ x: 0 }];
    startBikeMode();
    expect(bikeObstacles.length).toBe(0);
    expect(bikeFish.length).toBe(0);
    expect(bikeChocolates.length).toBe(0);
  });

  test('resets level to 1', () => {
    level = 5;
    startBikeMode();
    expect(level).toBe(1);
  });

  test('resets scroll distance', () => {
    bikeScroll = 1000;
    startBikeMode();
    expect(bikeScroll).toBe(0);
  });

  test('creates 4 lanes', () => {
    startBikeMode();
    expect(bikeLanes.length).toBe(4);
  });

  test('lanes are within road boundaries', () => {
    startBikeMode();
    bikeLanes.forEach(lx => {
      expect(lx).toBeGreaterThan(ROAD_LEFT);
      expect(lx).toBeLessThan(ROAD_RIGHT);
    });
  });

  test('lanes are evenly spaced', () => {
    startBikeMode();
    const spacing = bikeLanes[1] - bikeLanes[0];
    for (let i = 1; i < bikeLanes.length - 1; i++) {
      expect(bikeLanes[i + 1] - bikeLanes[i]).toBeCloseTo(spacing);
    }
  });
});
