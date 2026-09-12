/**
 * 游戏实体：日军飞机、军舰、鱼雷艇、登陆艇、来袭弹药、能量道具
 * Pearl Harbor 射击游戏
 */

const { ARPosition } = require('./coordinate')

// ========== 日军飞机（空中敌人）==========
const PlaneType = { ZERO: 'zero', BOMBER: 'bomber' }

class Plane {
  constructor({ position, health, maxHealth, type, approachSpeed = 3.0, attackInterval = 3.0 }) {
    this.position = position
    this.health = health
    this.maxHealth = maxHealth
    this.type = type || PlaneType.ZERO
    this.approachSpeed = approachSpeed
    this.attackInterval = attackInterval

    this._attackTimer = 0
    this.isDead = false
    this.deathAnimProgress = 0
    this._spawnDistance = position.distance  // 记录出生距离，用于帧动画映射

    this._baseAzimuth = position.azimuth
    // 轰炸机从天空出现，战斗机也在空中（防止玩家抬头时显示在水下）
    this._minElevation = type === PlaneType.BOMBER ? 20.0 : 10.0
    this._baseElevation = Math.max(this._minElevation, position.elevation)
    // 编队飞行：微小漂移而非乱飘
    this._driftSpeed = 0.3 + Math.random() * 0.4
    this._driftPhase = Math.random() * Math.PI * 2
    this._driftAmplitude = 1.0 + Math.random() * 1.5
    this._flyTimer = 0

    this.hitFlashTimer = 0
    this.formationIndex = 0  // 由 spawner 设置
    this.flyoverState = false   // 飞越头顶状态
    this.flyoverTimer = 0       // 飞越计时
    // 元素状态
    this.burnTimer = 0        // 燃烧剩余时间
    this.burnDps = 0          // 燃烧每秒伤害
    this.iceTimer = 0         // 冰冻减速剩余时间
    this.iceSlow = 0          // 减速比例 (0~1)
    this.chainHit = false     // 闪电链标记（当帧）
  }

  get healthPercent() {
    return this.health / this.maxHealth
  }

  get scoreValue() {
    return this.type === PlaneType.BOMBER ? 200 : 150
  }

  update(dt) {
    if (this.isDead) {
      this.deathAnimProgress += dt * 2.0
      this.position = this.position.copyWith({
        elevation: this.position.elevation - dt * 15.0
      })
      return
    }

    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt
    this.chainHit = false

    // 燃烧 DOT
    if (this.burnTimer > 0) {
      this.burnTimer -= dt
      this.health -= this.burnDps * dt
      if (this.health <= 0) { this.health = 0; this.isDead = true; return }
    }
    // 冰冻减速
    if (this.iceTimer > 0) this.iceTimer -= dt

    // animFrame 不再由计时器驱动，改为由渲染器根据距离计算

    // 飞越头顶阶段：快速拉升飞过并消失
    if (this.flyoverState) {
      this.flyoverTimer += dt
      const newEl = this.position.elevation + dt * 60.0  // 快速拉升
      const newD = this.position.distance - this.approachSpeed * dt * 2.0
      this.position = this.position.copyWith({
        elevation: newEl,
        distance: Math.max(0.5, newD)
      })
      // 飞出视野后标记死亡（不奖励分数）
      if (this.flyoverTimer > 1.2) {
        this.isDead = true
        this.deathAnimProgress = 2.0  // 立即可清理
      }
      return
    }

    var speedMult = (this.iceTimer > 0) ? (1.0 - this.iceSlow) : 1.0
    let newDist = this.position.distance - this.approachSpeed * speedMult * dt
    // 接近到 5.0 时进入飞越阶段
    if (newDist < 5.0) {
      this.flyoverState = true
      this.flyoverTimer = 0
      return
    }

    this._flyTimer += dt
    // 编队微漂：轻微的左右摇摆，模拟飞机保持队形时的小幅修正
    const driftAz = this._driftAmplitude *
      Math.sin(this._flyTimer * this._driftSpeed + this._driftPhase)
    const driftEl = this._driftAmplitude * 0.2 *
      Math.cos(this._flyTimer * this._driftSpeed * 0.7 + this._driftPhase)

    this.position = new ARPosition(
      ARPosition.wrapAngle(this._baseAzimuth + driftAz),
      Math.max(this._minElevation, Math.min(40, this._baseElevation + driftEl)),
      newDist
    )

    // 缓慢向中心收敛，但不低于最低仰角
    this._baseAzimuth *= 0.999
    if (this._baseElevation > this._minElevation) {
      this._baseElevation = Math.max(this._minElevation, this._baseElevation * 0.999)
    }
    this._attackTimer += dt
  }

  tryAttack() {
    if (this.isDead) return false
    if (this._attackTimer >= this.attackInterval) {
      this._attackTimer = 0
      return true
    }
    return false
  }

  takeDamage(damage) {
    this.health -= damage
    this.hitFlashTimer = 0.15
    if (this.health <= 0) {
      this.health = 0
      this.isDead = true
    }
  }
}

// ========== 军舰 / 登陆艇（海面敌人）==========
const ShipType = { WARSHIP: 'warship', TORPEDO_BOAT: 'torpedoBoat', LANDING_CRAFT: 'landingCraft' }

class Ship {
  constructor({ position, health, maxHealth, type, attackInterval = 0 }) {
    this.position = position
    this.health = health
    this.maxHealth = maxHealth
    this.type = type
    this._attackIntervalOverride = attackInterval

    this.isDead = false
    this.deathAnimProgress = 0
    this.animFrame = 0
    this._animTimer = 0
    this._attackTimer = 0
    this._dodgeTimer = 0
    this._dodgePhase = Math.random() * Math.PI * 2
    this._baseAzimuth = position.azimuth
    // 元素状态
    this.burnTimer = 0
    this.burnDps = 0
    this.iceTimer = 0
    this.iceSlow = 0
    this.chainHit = false
    this.hitFlashTimer = 0
  }

  get healthPercent() { return this.health / this.maxHealth }

  get approachSpeed() {
    if (this.type === ShipType.LANDING_CRAFT) return 3.5
    if (this.type === ShipType.TORPEDO_BOAT) return 3.0
    return 1.5
  }

  get baseSize() {
    if (this.type === ShipType.WARSHIP) return 80.0
    if (this.type === ShipType.TORPEDO_BOAT) return 50.0
    return 45.0
  }

  get scoreValue() {
    if (this.type === ShipType.WARSHIP) return 300
    if (this.type === ShipType.TORPEDO_BOAT) return 150
    return 100
  }

  get attackInterval() {
    if (this._attackIntervalOverride > 0) return this._attackIntervalOverride
    if (this.type === ShipType.WARSHIP) return 4.0
    if (this.type === ShipType.TORPEDO_BOAT) return 3.0
    return 6.0
  }

  get dodgeAmplitude() {
    if (this.type === ShipType.WARSHIP) return 1.5
    return 3.5
  }

  update(dt) {
    if (this.isDead) {
      this.deathAnimProgress += dt * 1.5
      return
    }

    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt
    this.chainHit = false

    // 燃烧 DOT
    if (this.burnTimer > 0) {
      this.burnTimer -= dt
      this.health -= this.burnDps * dt
      if (this.health <= 0) { this.health = 0; this.isDead = true; return }
    }
    // 冰冻减速
    if (this.iceTimer > 0) this.iceTimer -= dt

    this._animTimer += dt
    if (this._animTimer > 0.2) {
      this._animTimer = 0
      this.animFrame = (this.animFrame + 1) % 4
    }

    var speedMult = (this.iceTimer > 0) ? (1.0 - this.iceSlow) : 1.0
    let newDist = this.position.distance - this.approachSpeed * speedMult * dt
    if (newDist < 5.0) newDist = 5.0

    this._dodgeTimer += dt
    // 舰船直线驶来，仅有极微小的航向漂移（模拟海浪）
    const driftAz = 0.3 * Math.sin(this._dodgeTimer * 0.15 + this._dodgePhase)
    // 海面高度微小起伏
    const seaEl = -8.0 + 0.4 * Math.sin(this._dodgeTimer * 0.8)

    this.position = new ARPosition(
      ARPosition.wrapAngle(this._baseAzimuth + driftAz),
      seaEl,
      newDist
    )

    // 缓慢向玩家正前方收敛
    this._baseAzimuth *= 0.9995
    this._attackTimer += dt
  }

  tryAttack() {
    if (this.isDead) return false
    if (this._attackTimer >= this.attackInterval) {
      this._attackTimer = 0
      return true
    }
    return false
  }

  takeDamage(damage) {
    this.health -= damage
    if (this.health <= 0) {
      this.health = 0
      this.isDead = true
    }
  }
}

// ========== 来袭弹药（导弹 / 鱼雷）==========
const ProjectileType = { MISSILE: 'missile', TORPEDO: 'torpedo' }

class Projectile {
  constructor({ position, type, speed = 20.0, damage = 15 }) {
    this.position = position
    this.type = type
    this.speed = speed
    this.damage = damage
    this.isDead = false
    this.health = 1
    this.maxHealth = 1
    this._animTimer = 0
    this.animFrame = 0
    this.deathAnimProgress = 0
    this.hitFlashTimer = 0
  }

  get healthPercent() { return this.health / this.maxHealth }

  update(dt) {
    if (this.isDead) {
      this.deathAnimProgress += dt * 4.0
      return
    }

    this._animTimer += dt
    if (this._animTimer > 0.1) {
      this._animTimer = 0
      this.animFrame = (this.animFrame + 1) % 4
    }

    let newDist = this.position.distance - this.speed * dt
    this.position = this.position.copyWith({ distance: newDist })
  }

  get reachedPlayer() {
    return !this.isDead && this.position.distance <= 2.0
  }

  takeDamage(damage) {
    this.health -= damage
    this.hitFlashTimer = 0.1
    if (this.health <= 0) {
      this.health = 0
      this.isDead = true
    }
  }
}

// ========== 能量道具 ==========
const PowerUpType = {
  HEALTH: 'health',
  DAMAGE_BOOST: 'damageBoost',
  RAPID_FIRE: 'rapidFire',
  COIN_DROP: 'coinDrop'
}

const POWER_UP_INFO = {
  [PowerUpType.HEALTH]:       { label: '+生命', color: '#00FF66' },
  [PowerUpType.DAMAGE_BOOST]: { label: '伤害x2', color: '#FF6600' },
  [PowerUpType.RAPID_FIRE]:   { label: '速射', color: '#FFCC00' },
  [PowerUpType.COIN_DROP]:    { label: '金币', color: '#FFD700' },
}

class PowerUp {
  constructor({ position, type, lifetime = 8.0 }) {
    this.position = position
    this.type = type
    this.lifetime = lifetime
    this._baseElevation = position.elevation
    this._bobTimer = 0
  }

  get expired() { return this.lifetime <= 0 }
  get label() { return POWER_UP_INFO[this.type].label }
  get color() { return POWER_UP_INFO[this.type].color }

  update(dt) {
    this.lifetime -= dt
    this._bobTimer += dt
    const bob = Math.sin(this._bobTimer * 2.0) * 1.5
    this.position = new ARPosition(
      this.position.azimuth,
      this._baseElevation + bob,
      this.position.distance
    )
  }
}

module.exports = {
  Plane, PlaneType,
  Ship, ShipType,
  Projectile, ProjectileType,
  PowerUp, PowerUpType, POWER_UP_INFO
}
