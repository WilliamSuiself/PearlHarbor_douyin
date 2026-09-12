/**
 * 敌人生成器：波次系统
 * Pearl Harbor 射击游戏
 */

const { ARPosition } = require('./coordinate')
const { Plane, PlaneType, Ship, ShipType, Projectile, ProjectileType } = require('./entities')

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x))
}

function smoothstep(a, b, w) {
  const t = clamp((w - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

class EnemySpawner {
  constructor() {
    this.testMode = false
    this.reset()
  }

  reset() {
    this._timeSinceLastAirSpawn = 0
    this._timeSinceLastSeaSpawn = 0
    this._waveNumber = 1
    this._totalKills = 0
    this._waveKills = 0
    this._killsPerWave = this.testMode ? 1 : 10
    // 数量约为原来的 1/3
    this.airSpawnInterval = 6.0
    this.seaSpawnInterval = 12.0
    this.maxAirEnemies = 4
    this.maxSeaEnemies = 1
    // 编队状态
    this._formationQueue = []
    this._formationReleaseTimer = 0
    // Boss 波次状态
    this.bossPhase = false       // 是否处于 boss 阶段
    this.bossSpawned = false     // boss 是否已生成
    this.bossPending = false     // 等待进入 boss 阶段
    this.waveCleared = false     // 波次是否刚清除
    this._waveClearTimer = 0
    this._applyWaveParams()
  }

  get waveNumber() { return this._waveNumber }

  _effectiveWave() {
    return this.testMode ? Math.min(this._waveNumber, 5) : this._waveNumber
  }

  difficultyCurve(w) {
    const ww = Math.max(1, w)
    return 1 + 0.18 * Math.log(ww) + 0.045 * Math.pow(Math.max(0, ww - 1), 1.35)
  }

  seaUnlock(w) {
    return smoothstep(4, 7, w)
  }

  bossShipUnlock(w) {
    return smoothstep(5, 8, w)
  }

  killsPerWaveFor(w) {
    return Math.round(8 + 2.2 * Math.sqrt(w) + 1.2 * Math.log(1 + w))
  }

  airSpawnIntervalFor(w) {
    return Math.max(2.6, 6.0 - 0.9 * Math.log(1 + w) - 0.28 * Math.sqrt(w))
  }

  seaSpawnIntervalFor(w) {
    return Math.max(6.5, 14.0 - 1.4 * Math.log(1 + w) - 0.45 * w * this.seaUnlock(w))
  }

  maxAirEnemiesFor(w) {
    return 3 + Math.floor(0.9 * Math.sqrt(w) + 0.35 * Math.log(1 + w))
  }

  maxSeaEnemiesFor(w) {
    if (this.seaUnlock(w) <= 0) return 0
    return Math.max(1, Math.round(this.seaUnlock(w) * (1 + 0.5 * Math.sqrt(w))))
  }

  formationSizeFor(w) {
    return Math.min(6, 4 + Math.floor(0.22 * Math.pow(Math.max(0, w - 1), 0.85)))
  }

  formationReleaseIntervalFor(w) {
    return Math.max(0.35, 0.85 - 0.10 * Math.log(1 + w))
  }

  bomberChanceFor(w) {
    return clamp(0.22 + 0.06 * Math.log(1 + w) + 0.04 * smoothstep(4, 10, w), 0.22, 0.55)
  }

  planeHpFor(type, w) {
    const d = this.difficultyCurve(w)
    if (type === PlaneType.BOMBER) return Math.round(28 * Math.pow(d, 1.03))
    return Math.round(18 * d)
  }

  shipHpFor(type, w) {
    const d = this.difficultyCurve(w)
    if (type === ShipType.WARSHIP) return Math.round(85 * Math.pow(d, 1.08))
    if (type === ShipType.TORPEDO_BOAT) return Math.round(48 * d)
    return Math.round(35 * d)
  }

  bossPlaneHpFor(w) {
    return Math.round(70 * Math.pow(this.difficultyCurve(w), 1.10))
  }

  bossShipHpFor(w) {
    const base = 90 + 70 * this.bossShipUnlock(w)
    return Math.round(base * Math.pow(this.difficultyCurve(w), 1.12))
  }

  planeSpeedFor(w) {
    return 1.6 + 0.15 * Math.sqrt(w)
  }

  bossPlaneSpeedFor(w) {
    return 1.1 + 0.12 * Math.sqrt(w)
  }

  planeAttackIntervalFor(w) {
    return Math.max(1.5, 3.0 - 0.35 * Math.log(1 + w) - 0.12 * Math.sqrt(w))
  }

  bossPlaneAttackIntervalFor(w) {
    return Math.max(1.3, this.planeAttackIntervalFor(w) * 0.88)
  }

  shipAttackIntervalFor(type, w) {
    const mult = Math.max(0.65, 1.0 - 0.08 * Math.log(1 + w))
    if (type === ShipType.WARSHIP) return 4.5 * mult
    if (type === ShipType.TORPEDO_BOAT) return 3.5 * mult
    return 6.0 * mult
  }

  missileCountFor(w) {
    return clamp(Math.round(0.75 * Math.log(Math.max(1, w))), 0, 3)
  }

  planeGunDamageFor(w) {
    return Math.round(4 + 1.3 * Math.log(1 + w))
  }

  bombDamageFor(w) {
    return Math.round(8 + 2.0 * Math.log(1 + w))
  }

  shipGunDamageFor(w) {
    return Math.round(3 + 1.0 * Math.log(1 + w))
  }

  projectileDamageFor(type, w) {
    if (type === ProjectileType.TORPEDO) return Math.round(16 + 1.1 * Math.log(1 + w))
    return Math.round(10 + 0.7 * Math.log(1 + w))
  }

  _applyWaveParams() {
    const w = this._effectiveWave()
    this._killsPerWave = this.testMode ? 1 : this.killsPerWaveFor(w)
    this.airSpawnInterval = this.testMode ? 2.0 : this.airSpawnIntervalFor(w)
    this.seaSpawnInterval = this.testMode ? 3.5 : this.seaSpawnIntervalFor(w)
    this.maxAirEnemies = this.testMode ? 1 : this.maxAirEnemiesFor(w)
    this.maxSeaEnemies = this.testMode ? 1 : this.maxSeaEnemiesFor(w)
  }

  addKill() {
    this._totalKills++
    this._waveKills++
    // Test mode: skip boss, directly advance wave
    if (this.testMode && !this.bossPhase && this._waveKills >= this._killsPerWave) {
      this.advanceWave()
      return
    }
    // Normal: enter boss phase when kills reached
    if (!this.bossPhase && this._waveKills >= this._killsPerWave) {
      this.bossPending = true
    }
  }

  /** 进入 boss 阶段 */
  startBossPhase() {
    this.bossPending = false
    this.bossPhase = true
    this.bossSpawned = false
  }

  /** 生成 boss 编队：一组强力敌人 */
  spawnBossGroup() {
    if (this.bossSpawned) return []
    this.bossSpawned = true

    const w = this._waveNumber
    const enemies = []

    const bossPlaneCount = Math.min(7, 4 + Math.ceil(Math.sqrt(w)))
    const leaderAz = (Math.random() - 0.5) * 80
    const leaderEl = 28 + Math.random() * 10  // 从天上出现
    const leaderDist = 50 + Math.random() * 15
    const bossHp = this.bossPlaneHpFor(w)
    const speed = this.bossPlaneSpeedFor(w)

    for (let i = 0; i < bossPlaneCount; i++) {
      const side = (i % 2 === 0) ? 1 : -1
      const rank = Math.ceil(i / 2)
      const p = new Plane({
        position: new ARPosition(
          leaderAz + side * rank * 7,
          leaderEl - rank * 1.5,
          leaderDist + rank * 3
        ),
        health: bossHp,
        maxHealth: bossHp,
        type: PlaneType.BOMBER,
        approachSpeed: speed,
        attackInterval: this.bossPlaneAttackIntervalFor(w)
      })
      p.formationIndex = i
      enemies.push(p)
    }

    if (this.bossShipUnlock(w) > 0) {
      const shipHp = this.bossShipHpFor(w)
      const ship = new Ship({
        position: new ARPosition(
          (Math.random() - 0.5) * 100, -8.0,
          50 + Math.random() * 15
        ),
        health: shipHp,
        maxHealth: shipHp,
        type: ShipType.WARSHIP,
        attackInterval: this.shipAttackIntervalFor(ShipType.WARSHIP, w) * 0.9
      })
      enemies.push(ship)
    }

    return enemies
  }

  /** Boss 全灭，进入下一波 */
  advanceWave() {
    this.bossPhase = false
    this.bossSpawned = false
    this._waveKills = 0
    this._waveNumber++
    this._applyWaveParams()
    this.waveCleared = true
    this._waveClearTimer = this.testMode ? 0.5 : 3.0
  }

  updateWaveClear(dt) {
    if (this.waveCleared) {
      this._waveClearTimer -= dt
      if (this._waveClearTimer <= 0) {
        this.waveCleared = false
      }
    }
  }

  /**
   * 生成编队飞机：一次生成 2-4 架，V 字形排列
   */
  trySpawnPlane(dt, currentCount) {
    // 先检查编队队列
    if (this._formationQueue.length > 0) {
      this._formationReleaseTimer += dt
      if (this._formationReleaseTimer >= this.formationReleaseIntervalFor(this._effectiveWave())) {
        this._formationReleaseTimer = 0
        if (currentCount < this.maxAirEnemies) {
          return this._formationQueue.shift()
        }
      }
      return null
    }

    this._timeSinceLastAirSpawn += dt
    if (this._timeSinceLastAirSpawn < this.airSpawnInterval) return null
    if (currentCount >= this.maxAirEnemies) return null

    this._timeSinceLastAirSpawn = 0

    const ew = this._effectiveWave()
    const formationSize = this.testMode ? 1 : this.formationSizeFor(ew)
    const leaderAz = (Math.random() - 0.5) * 140.0
    const leaderDist = 45.0 + Math.random() * 25.0

    const type = Math.random() < this.bomberChanceFor(ew)
      ? PlaneType.BOMBER : PlaneType.ZERO

    // 飞机从天空出现（高仰角，防止抬头时看到在水下）
    const leaderEl = type === PlaneType.BOMBER
      ? 25.0 + Math.random() * 12.0   // 轰炸机：25-37度
      : 15.0 + Math.random() * 15.0   // 战斗机：15-30度

    const baseHp = this.planeHpFor(type, ew)
    const speed = this.planeSpeedFor(ew) + Math.random() * 0.6
    const atkInterval = this.planeAttackIntervalFor(ew)

    // V 字形编队
    var planes = []
    for (let i = 0; i < formationSize; i++) {
      const side = (i % 2 === 0) ? 1 : -1
      const rank = Math.ceil(i / 2)
      const azOffset = side * rank * 6.0     // 左右间隔 6 度
      const distOffset = rank * 4.0          // 后方间隔 4 距离
      const elOffset = -rank * 1.5           // 略低

      const p = new Plane({
        position: new ARPosition(
          leaderAz + azOffset,
          leaderEl + elOffset,
          leaderDist + distOffset
        ),
        health: baseHp,
        maxHealth: baseHp,
        type: type,
        approachSpeed: speed,
        attackInterval: atkInterval
      })
      p.formationIndex = i
      planes.push(p)
    }

    // 第一架直接返回，其余放入队列
    for (let i = 1; i < planes.length; i++) {
      this._formationQueue.push(planes[i])
    }
    this._formationReleaseTimer = 0
    return planes[0]
  }

  trySpawnShip(dt, currentCount) {
    this._timeSinceLastSeaSpawn += dt
    if (this._timeSinceLastSeaSpawn < this.seaSpawnInterval) return null
    if (currentCount >= this.maxSeaEnemies) return null
    if (this.seaUnlock(this._effectiveWave()) <= 0) return null

    this._timeSinceLastSeaSpawn = 0

    const azimuth = (Math.random() - 0.5) * 140.0
    const distance = 45.0 + Math.random() * 25.0
    const ew = this._effectiveWave()

    let type
    const r = Math.random()
    const warshipChance = 0.28 * smoothstep(7, 14, ew)
    if (r < warshipChance) {
      type = ShipType.WARSHIP
    } else if (r < warshipChance + 0.48) {
      type = ShipType.TORPEDO_BOAT
    } else {
      type = ShipType.LANDING_CRAFT
    }

    return new Ship({
      position: new ARPosition(azimuth, -8.0, distance),
      health: this.shipHpFor(type, ew),
      maxHealth: this.shipHpFor(type, ew),
      type,
      attackInterval: this.shipAttackIntervalFor(type, ew)
    })
  }

  /**
   * 生成来袭弹药（由飞机或舰船发射）
   */
  spawnProjectile(sourcePosition, type) {
    const w = this._effectiveWave()
    const az = sourcePosition.azimuth + (Math.random() - 0.5) * 4
    const el = type === ProjectileType.TORPEDO ? -6.0 : sourcePosition.elevation * 0.5
    const dist = sourcePosition.distance * 0.9

    const speed = type === ProjectileType.TORPEDO ? 12.0 : 18.0
    const dmg = this.projectileDamageFor(type, w)

    return new Projectile({
      position: new ARPosition(az, el, dist),
      type: type,
      speed: speed,
      damage: dmg
    })
  }
}

module.exports = { EnemySpawner }
