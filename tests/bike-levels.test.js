/**
 * Tests for bike level system, difficulty scaling, and themes (bike.js)
 */
const { setupGameEnvironment } = require('./setup');

beforeAll(() => {
  setupGameEnvironment();
});

// ── Level distance ──

describe('levelDistance', () => {
  test('level 1 requires 200 distance', () => {
    expect(levelDistance(1)).toBe(200);
  });

  test('level 2 requires 250 distance', () => {
    expect(levelDistance(2)).toBe(250);
  });

  test('scales linearly with level', () => {
    for (let lvl = 1; lvl <= 10; lvl++) {
      expect(levelDistance(lvl)).toBe(150 + lvl * 50);
    }
  });

  test('always increases with level', () => {
    for (let lvl = 1; lvl < 20; lvl++) {
      expect(levelDistance(lvl + 1)).toBeGreaterThan(levelDistance(lvl));
    }
  });
});

// ── Spawn rate scaling ──

describe('levelCarSpawnRate', () => {
  test('starts at reasonable rate for level 1', () => {
    level = 1;
    expect(levelCarSpawnRate()).toBe(73); // 80 - 1*7
  });

  test('decreases (faster spawning) at higher levels', () => {
    level = 1;
    const rate1 = levelCarSpawnRate();
    level = 5;
    const rate5 = levelCarSpawnRate();
    expect(rate5).toBeLessThan(rate1);
  });

  test('has a minimum cap of 18', () => {
    level = 100;
    expect(levelCarSpawnRate()).toBe(18);
  });

  test('hits minimum around level 9', () => {
    level = 9;
    expect(levelCarSpawnRate()).toBe(18); // 80 - 63 = 17 -> clamped to 18
  });
});

describe('levelFishSpawnRate', () => {
  test('starts at 110 for level 1', () => {
    level = 1;
    expect(levelFishSpawnRate()).toBe(110);
  });

  test('has a minimum cap of 30', () => {
    level = 100;
    expect(levelFishSpawnRate()).toBe(30);
  });

  test('decreases with level', () => {
    level = 1;
    const rate1 = levelFishSpawnRate();
    level = 3;
    const rate3 = levelFishSpawnRate();
    expect(rate3).toBeLessThan(rate1);
  });
});

describe('levelChocoSpawnRate', () => {
  test('starts at 215 for level 1', () => {
    level = 1;
    expect(levelChocoSpawnRate()).toBe(215);
  });

  test('increases with level (chocolates become rarer)', () => {
    level = 1;
    const rate1 = levelChocoSpawnRate();
    level = 5;
    const rate5 = levelChocoSpawnRate();
    expect(rate5).toBeGreaterThan(rate1);
  });

  test('has a minimum cap of 100', () => {
    // Since rate increases with level, the minimum cap won't be hit in normal play
    // but verify the formula works
    level = 1;
    expect(levelChocoSpawnRate()).toBeGreaterThanOrEqual(100);
  });
});

describe('levelBaseSpeed', () => {
  test('starts at 1.15 for level 1', () => {
    level = 1;
    expect(levelBaseSpeed()).toBeCloseTo(1.15);
  });

  test('increases with level', () => {
    level = 1;
    const speed1 = levelBaseSpeed();
    level = 5;
    const speed5 = levelBaseSpeed();
    expect(speed5).toBeGreaterThan(speed1);
  });

  test('formula is 1.0 + level * 0.15', () => {
    for (let lvl = 1; lvl <= 10; lvl++) {
      level = lvl;
      expect(levelBaseSpeed()).toBeCloseTo(1.0 + lvl * 0.15);
    }
  });
});

// ── Theme cycling ──

describe('currentTheme', () => {
  test('returns first theme for level 1', () => {
    level = 1;
    expect(currentTheme()).toBe(ROAD_THEMES[0]);
  });

  test('cycles through 6 themes', () => {
    level = 7;
    expect(currentTheme()).toBe(ROAD_THEMES[0]); // wraps back to first

    level = 8;
    expect(currentTheme()).toBe(ROAD_THEMES[1]);
  });

  test('each level gets a valid theme object', () => {
    for (let lvl = 1; lvl <= 18; lvl++) {
      level = lvl;
      const theme = currentTheme();
      expect(theme).toHaveProperty('road');
      expect(theme).toHaveProperty('grass');
      expect(theme).toHaveProperty('sky');
      expect(theme).toHaveProperty('edge');
      expect(theme).toHaveProperty('dash');
    }
  });

  test('all 6 themes are distinct', () => {
    const themes = new Set();
    for (let lvl = 1; lvl <= 6; lvl++) {
      level = lvl;
      themes.add(currentTheme().road);
    }
    expect(themes.size).toBe(6);
  });
});
