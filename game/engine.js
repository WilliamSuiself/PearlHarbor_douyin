/**
 * 游戏引擎 — Pearl Harbor 射击游戏
 * 管理游戏状态、实体、战斗、波次系统
 */

const { ARPosition, ARProjector } = require('./coordinate')
const { Plane, Ship, Projectile, ProjectileType, PowerUp, PowerUpType } = require('./entities')
const { AutoAim, CombatSystem } = require('./combat')
const { EnemySpawner } = require('./spawner')
const { DeviceOrientationTracker } = require('./orientation')
const { SoundManager } = require('./sound')
const { InventoryGrid, GridItemType, getMultiplier } = require('./inventory')

const GameState = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused', GAME_OVER: 'gameOver' }

class GameEngine {
  constructor(options = {}) {
    this.state = GameState.IDLE
    this._testMode = !!options.testMode
    this._startCoins = options.startCoins || 0

    this.planes = []
    this.ships = []
    this.projectiles = []
    this.powerUps = []
    this.pickupMessages = []   // 拾取提示队列 [{text, color, timer}]

    this.spawner = new EnemySpawner()
    this.spawner.testMode = this._testMode
    this.orientationTracker = new DeviceOrientationTracker()
    this.sound = options.soundManager || new SoundManager()
    this._ownsSound = !options.soundManager
    this.inventory = new InventoryGrid()

    this.score = 0
    this.playerHealth = 100
    this.maxPlayerHealth = 100
    this.kills = 0
    this.coins = 0
    this.shopReady = false   // 波次间商店标志

    this._fireTimer = 0
    this._baseFireRate = 5.0
    this._baseBulletDamage = 10

    this.damageBoostTimer = 0
    this.rapidFireTimer = 0
    this.damageBoostKills = 0
    this.rapidFireKills = 0

    this.muzzleFlashTimer = 0
    this.isFiring = false

    // 鱼雷自动射击计时器
    this._torpedoAutoTimer = 0
    // 武器冷却状态 {uid: {phase: 'firing'|'reloading', timer, fireTime, reloadTime}}
    this.weaponStates = {}

    this.comboCount = 0
    this._comboTimer = 0
    this._comboWindow = 2.0

    this.currentTarget = null
    this.shakeIntensity = 0

    this._gameLoop = null
    this._previousWave = 1
    this._lastTime = 0
    this._shopDelayTimer = 0
  }

  get fireRate() {
    let rate = this._baseFireRate
    if (this.rapidFireTimer > 0 || this.rapidFireKills > 0) rate *= 2.0
    // 背包装备加成（考虑冷却状态）
    const inv = this.inventory.getEffectsWithStates(this.weaponStates)
    rate += inv.fireRateBonus
    // 辅助成员加成：射速 +crewBonus%
    if (inv.crewBonus > 0) rate *= (1 + inv.crewBonus)
    return rate
  }

  get bulletDamage() {
    let dmg = this._baseBulletDamage
    if (this.damageBoostTimer > 0 || this.damageBoostKills > 0) dmg *= 2
    // 背包装备加成（考虑冷却状态）
    const inv = this.inventory.getEffectsWithStates(this.weaponStates)
    dmg += inv.damageBonus
    return Math.floor(dmg)
  }

  get visualGunLevel() {
    return this.inventory.getVisualGunLevel()
  }

  get visualBarrelCount() {
    // 弹道数 = 背包炮管总数
    const invGuns = this.inventory.getGunCount()
    return Math.max(1, invGuns)
  }

  get fireInterval() {
    return 1.0 / this.fireRate
  }

  get cameraYaw() { return this.orientationTracker.yaw }
  get cameraPitch() { return this.orientationTracker.pitch }

  set testMode(val) {
    this._testMode = !!val
    this.spawner.testMode = this._testMode
  }
  get testMode() { return this._testMode }

  initSound() {
    this.sound.init()
  }

  startGame() {
    if (this.state === GameState.PLAYING) return
    this.state = GameState.PLAYING
    this.score = 0
    this.playerHealth = this.maxPlayerHealth
    this.kills = 0
    this.coins = this._startCoins
    this.shopReady = false
    this.comboCount = 0
    this._comboTimer = 0
    this.shakeIntensity = 0
    this.damageBoostTimer = 0
    this.rapidFireTimer = 0
    this.damageBoostKills = 0
    this.rapidFireKills = 0
    this._torpedoAutoTimer = 0
    this.inventory.reset()
    // Boss 波次提示
    this.dangerTimer = 0
    this.waveClearTimer = 0
    this._bossEnemies = []
    this._shopDelayTimer = 0
    this.planes = []
    this.ships = []
    this.projectiles = []
    this.powerUps = []
    this.pickupMessages = []
    this.spawner.reset()
    this._fireTimer = 0
    this.muzzleFlashTimer = 0
    this.isFiring = false
    this._previousWave = 1
    this.currentTarget = null

    this.orientationTracker.reset()
    this.orientationTracker.start()
    this.sound.lowerBGM()

    this._lastTime = Date.now()
    this._startLoop()
  }

  _startLoop() {
    // 游戏逻辑由 game.js 的 requestAnimationFrame 循环统一驱动，
    // 避免 30fps setInterval 与 60fps 渲染不同步造成卡顿
    if (this._gameLoop) { clearInterval(this._gameLoop); this._gameLoop = null }
  }

  pauseGame() {
    if (this.state !== GameState.PLAYING) return
    this.state = GameState.PAUSED
    if (this._gameLoop) { clearInterval(this._gameLoop); this._gameLoop = null }
    this.orientationTracker.stop()
    this.sound.raiseBGM()
  }

  resumeGame() {
    if (this.state !== GameState.PAUSED) return
    this.state = GameState.PLAYING
    this.orientationTracker.start()
    this.sound.lowerBGM()
    this._lastTime = Date.now()
    this._startLoop()
  }

  endGame() {
    this.state = GameState.GAME_OVER
    if (this._gameLoop) { clearInterval(this._gameLoop); this._gameLoop = null }
    this.orientationTracker.stop()
    this.sound.playGameOver()
    this.sound.raiseBGM()
  }

  _update(dt) {
    if (this.state !== GameState.PLAYING) return
    // 商店期间暂停游戏逻辑（仅保留商店延迟计时）
    if (this.shopReady) return

    this._updateWeaponStates(dt)
    this._updateEMP(dt)
    this._updateBossWave(dt)
    this._spawnEnemies(dt)
    this._updateEntities(dt)
    this._updateAimAndFire(dt)
    this._checkEnemyAttacks(dt)
    this._checkProjectileHits(dt)
    this._updatePowerUps(dt)
    this._updateBuffTimers(dt)
    this._updatePickupMessages(dt)
    this._updateCombo(dt)
    this._updateShake(dt)
    this._updateTorpedoAuto(dt)
    this._cleanup()

    // Detect waveCleared BEFORE updateWaveClear resets it
    if (this.spawner.waveCleared && this._shopDelayTimer === 0) {
      this._shopDelayTimer = this._testMode ? 0.5 : 2.5
      this.waveClearTimer = 3.0
      this._previousWave = this.spawner.waveNumber
      this.sound.playWave()
      this.inventory.replenishShield()
    }

    this.spawner.updateWaveClear(dt)

    // 提示计时器更新
    if (this.dangerTimer > 0) this.dangerTimer -= dt
    if (this.waveClearTimer > 0) this.waveClearTimer -= dt
    // 商店延迟
    if (this._shopDelayTimer > 0) {
      this._shopDelayTimer -= dt
      if (this._shopDelayTimer <= 0) {
        this.shopReady = true
      }
    }

    if (this.playerHealth <= 0) {
      this.endGame()
    }
  }

  _updateWeaponStates(dt) {
    var items = this.inventory.placedItems
    // 辅助成员减少冷却时间
    var crewBonus = this.inventory.getEffects().crewBonus || 0
    var cooldownMult = Math.max(0.1, 1.0 - crewBonus)
    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      if (!item.def.fireTime || item.def.fireTime <= 0) continue
      var ws = this.weaponStates[item.uid]
      if (!ws) {
        ws = { phase: 'firing', timer: 0, fireTime: item.def.fireTime, reloadTime: item.def.reloadTime * cooldownMult }
        this.weaponStates[item.uid] = ws
      }
      // 动态更新冷却时间（辅助成员变化时）
      ws.reloadTime = item.def.reloadTime * cooldownMult
      ws.timer += dt
      if (ws.phase === 'firing' && ws.timer >= ws.fireTime) {
        ws.phase = 'reloading'
        ws.timer = 0
      } else if (ws.phase === 'reloading' && ws.timer >= ws.reloadTime) {
        ws.phase = 'firing'
        ws.timer = 0
      }
    }
  }

  _updateBossWave(dt) {
    // 检测是否进入 boss 阶段
    if (this.spawner.bossPending) {
      this.spawner.startBossPhase()
      this.dangerTimer = 3.0  // 显示 DANGER 3 秒
      this.sound.playWave()
    }

    // boss 阶段：生成 boss 编队
    if (this.spawner.bossPhase && !this.spawner.bossSpawned && this.dangerTimer <= 1.5) {
      const bossGroup = this.spawner.spawnBossGroup()
      this._bossEnemies = []
      for (const e of bossGroup) {
        if (e.type !== undefined && e.approachSpeed !== undefined) {
          // 飞机
          this.planes.push(e)
        } else {
          // 舰船
          this.ships.push(e)
        }
        this._bossEnemies.push(e)
      }
    }

    // 检测 boss 是否全灭
    if (this.spawner.bossPhase && this.spawner.bossSpawned && this._bossEnemies.length > 0) {
      const allDead = this._bossEnemies.every(e => e.isDead)
      if (allDead) {
        this.spawner.advanceWave()
        this.waveClearTimer = 3.0
        this._bossEnemies = []
        this._previousWave = this.spawner.waveNumber
        this.sound.playWave()
        // 波次结束，进入商店
        this._shopDelayTimer = 2.5  // 显示 WAVE CLEAR 后再进商店
        // 波次间恢复护盾
        this.inventory.replenishShield()
      }
    }
  }

  _spawnEnemies(dt) {
    // Boss 阶段不生成普通敌人
    if (this.spawner.bossPhase) return

    // 编队生成：可能连续返回多架
    var aliveCount = this.planes.filter(p => !p.isDead).length
    var plane = this.spawner.trySpawnPlane(dt, aliveCount)
    while (plane) {
      this.planes.push(plane)
      aliveCount++
      plane = this.spawner.trySpawnPlane(0, aliveCount)
    }

    const ship = this.spawner.trySpawnShip(
      dt, this.ships.filter(s => !s.isDead).length
    )
    if (ship) this.ships.push(ship)
  }

  _updateEntities(dt) {
    for (const p of this.planes) p.update(dt)
    for (const s of this.ships) s.update(dt)
    for (const pr of this.projectiles) pr.update(dt)
  }

  _updateAimAndFire(dt) {
    this.currentTarget = AutoAim.findTarget(
      this.cameraYaw, this.cameraPitch,
      this.planes, this.ships, this.projectiles
    )

    if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer -= dt

    this._fireTimer += dt
    if (this.currentTarget && this._fireTimer >= this.fireInterval) {
      this._fireTimer = 0
      this.isFiring = true
      this.muzzleFlashTimer = 0.1
      // 根据装备等级播放不同音效
      if (this.visualGunLevel > 0) {
        this.sound.playHeavyGun()
      } else {
        this.sound.playShoot()
      }

      var shotDamage = this.bulletDamage
      var elements = this.inventory.getActiveElements()
      if (elements.armor_pierce > 0) {
        shotDamage = Math.floor(shotDamage * (1 + elements.armor_pierce * 0.5))
      }

      const result = CombatSystem.applyHit(
        this.currentTarget, shotDamage,
        this.planes, this.ships, this.projectiles
      )

      // 元素弹药效果
      this._applyElementalEffects(this.currentTarget, shotDamage)

      if (result.scoreGained > 0) this.sound.playImpact()

      const totalKills = result.planeKills + result.shipKills + result.projectileKills
      if (totalKills > 0) {
        this.sound.playPlaneCrash()
        if (result.shipKills > 0) {
          this.sound.playScreech()
        }
        this.comboCount += totalKills
        this._comboTimer = this._comboWindow
        const comboMult = this.comboCount >= 5 ? 3 : this.comboCount >= 3 ? 2 : 1
        this.score += result.scoreGained * comboMult
        if (result.planeKills > 0 || result.shipKills > 0) {
          this._trySpawnPowerUp(this.currentTarget.position)
        }
      } else {
        this.score += result.scoreGained
      }
      this.kills += (result.planeKills + result.shipKills)
      // 金币奖励
      this.coins += result.planeKills * 8 + result.shipKills * 20 + result.projectileKills * 3
      // 击杀次数制 buff 消耗
      const entityKills = result.planeKills + result.shipKills
      if (entityKills > 0) {
        if (this.damageBoostKills > 0) this.damageBoostKills = Math.max(0, this.damageBoostKills - entityKills)
        if (this.rapidFireKills > 0) this.rapidFireKills = Math.max(0, this.rapidFireKills - entityKills)
      }
      for (let i = 0; i < entityKills; i++) this.spawner.addKill()
    } else {
      this.isFiring = false
    }
  }

  _checkEnemyAttacks(dt) {
    const attackResult = CombatSystem.processEnemyAttacks(
      this.planes, this.ships, this.spawner.waveNumber, this.spawner
    )
    // 直接伤害（近距离射击）— 护盾先吸收
    if (attackResult.directDamage > 0) {
      const actualDmg = this.inventory.absorbDamage(attackResult.directDamage)
      this.playerHealth = Math.max(0, Math.min(this.maxPlayerHealth, this.playerHealth - actualDmg))
      this.shakeIntensity = 12.0
      this.sound.playDamage()
    }
    // 新生成的弹药
    for (const pr of attackResult.newProjectiles) {
      this.projectiles.push(pr)
    }
  }

  _checkProjectileHits(dt) {
    for (const pr of this.projectiles) {
      if (pr.reachedPlayer) {
        const actualDmg = this.inventory.absorbDamage(pr.damage)
        this.playerHealth = Math.max(0, this.playerHealth - actualDmg)
        this.shakeIntensity = 15.0
        this.sound.playDamage()
        pr.isDead = true
      }
    }
  }

  _trySpawnPowerUp(pos) {
    if (Math.random() > 0.45) return  // 45% 掉落率
    // 掉落：金币 40%, 血量 25%, 伤害加成 20%, 快速射击 15%
    let type
    const roll = Math.random()
    if (roll < 0.40) {
      type = PowerUpType.COIN_DROP
    } else if (roll < 0.65) {
      type = PowerUpType.HEALTH
    } else if (roll < 0.85) {
      type = PowerUpType.DAMAGE_BOOST
    } else {
      type = PowerUpType.RAPID_FIRE
    }
    this.powerUps.push(new PowerUp({ position: pos, type }))
  }

  _updatePowerUps(dt) {
    for (const pu of this.powerUps) pu.update(dt)

    const toCollect = []
    for (const pu of this.powerUps) {
      if (pu.expired) continue
      const dist = ARProjector.angularDistFromCenter(
        pu.position, this.cameraYaw, this.cameraPitch
      )
      if (dist < 8.0) toCollect.push(pu)
    }
    for (const pu of toCollect) {
      this._applyPowerUp(pu)
      const idx = this.powerUps.indexOf(pu)
      if (idx >= 0) this.powerUps.splice(idx, 1)
    }
  }

  _applyPowerUp(pu) {
    switch (pu.type) {
      case PowerUpType.HEALTH:
        this.playerHealth = Math.min(this.maxPlayerHealth, this.playerHealth + 25)
        this._showPickup('生命 +25', '#00FF88')
        this.sound.playWave()
        break
      case PowerUpType.DAMAGE_BOOST:
        this.damageBoostTimer = 10.0
        this._showPickup('伤害x2 持续10秒', '#FF6600')
        this.sound.playWave()
        break
      case PowerUpType.RAPID_FIRE:
        this.rapidFireTimer = 10.0
        this._showPickup('急速射击 持续10秒', '#FFCC00')
        this.sound.playWave()
        break
      case PowerUpType.COIN_DROP:
        var coinAmount = 15 + Math.floor(Math.random() * 20) + this.spawner.waveNumber * 3
        this.coins += coinAmount
        this._showPickup('金币 +' + coinAmount, '#FFD700')
        this.sound.playCoin()
        break
    }
  }

  _showPickup(text, color) {
    this.pickupMessages.push({ text, color, timer: 2.0 })
    // 最多保留 4 条
    if (this.pickupMessages.length > 4) this.pickupMessages.shift()
  }

  _updatePickupMessages(dt) {
    for (let i = this.pickupMessages.length - 1; i >= 0; i--) {
      this.pickupMessages[i].timer -= dt
      if (this.pickupMessages[i].timer <= 0) this.pickupMessages.splice(i, 1)
    }
  }

  _updateBuffTimers(dt) {
    if (this.damageBoostTimer > 0) this.damageBoostTimer -= dt
    if (this.rapidFireTimer > 0) this.rapidFireTimer -= dt
  }

  _updateCombo(dt) {
    if (this._comboTimer > 0) {
      this._comboTimer -= dt
      if (this._comboTimer <= 0) this.comboCount = 0
    }
  }

  _updateShake(dt) {
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= 0.85
      if (this.shakeIntensity < 0.5) this.shakeIntensity = 0
    }
  }

  _updateTorpedoAuto(dt) {
    const effects = this.inventory.getEffects()
    if (effects.torpedoCount <= 0 || effects.torpedoInterval <= 0) return
    this._torpedoAutoTimer += dt
    if (this._torpedoAutoTimer >= effects.torpedoInterval) {
      this._torpedoAutoTimer = 0
      // 找最近的活船
      let nearest = null
      let bestDist = Infinity
      for (const s of this.ships) {
        if (s.isDead) continue
        if (s.position.distance < bestDist) {
          bestDist = s.position.distance
          nearest = s
        }
      }
      if (nearest) {
        // 向船发射鱼雷（直接造成伤害）
        const dmg = 80 * effects.torpedoCount
        nearest.takeDamage(dmg)
        this.sound.playHeavyGun()
        this._showPickup('鱼雷命中！-' + dmg, '#00FF88')
        if (nearest.isDead) {
          this.score += nearest.scoreValue
          this.kills++
          this.coins += 20
          this.spawner.addKill()
          this.sound.playPlaneCrash()
        }
      }
    }
  }

  _updateEMP(dt) {
    var items = this.inventory.placedItems
    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      if (item.def.id !== GridItemType.EMP) continue
      var ws = this.weaponStates[item.uid]
      if (!ws) continue
      // Fire once at end of firing phase
      if (ws.phase === 'firing' && ws.timer >= ws.fireTime * 0.9 && !ws._empFired) {
        ws._empFired = true
      } else if (ws.phase === 'reloading') {
        ws._empFired = false
        continue
      } else {
        continue
      }
      if (!ws._empFired) continue
      var mult = getMultiplier(item.count)
      var empRadius = (item.def.empRadius || 2.0) * (1 + (mult - 1) * 0.2)
      var empDmg = (item.def.empDamage || 9999)
      var killed = 0
      // 击毁近距离所有敌人（距离 < empRadius km）
      for (var j = 0; j < this.planes.length; j++) {
        var p = this.planes[j]
        if (p.isDead) continue
        if (p.position.distance <= empRadius) {
          p.takeDamage(empDmg)
          if (p.isDead) { this.score += p.scoreValue; this.kills++; this.coins += 8; killed++; this.spawner.addKill() }
        }
      }
      for (var j = 0; j < this.ships.length; j++) {
        var s = this.ships[j]
        if (s.isDead) continue
        if (s.position.distance <= empRadius) {
          s.takeDamage(empDmg)
          if (s.isDead) { this.score += s.scoreValue; this.kills++; this.coins += 20; killed++; this.spawner.addKill() }
        }
      }
      // 消灭近距离弹射物
      for (var j = 0; j < this.projectiles.length; j++) {
        var pr = this.projectiles[j]
        if (!pr.isDead && pr.position && pr.position.distance <= empRadius) {
          pr.isDead = true; killed++
        }
      }
      if (killed > 0) {
        this.sound.playScreech()
        this._showPickup('电磁脉冲！摧毁 ' + killed + ' 个目标', '#AA00FF')
      }
    }
  }

  _applyElementalEffects(target, damage) {
    if (!target || target.targetType === 'projectile') return
    var elements = this.inventory.getActiveElements()
    var entity = null
    if (target.targetType === 'plane' && target.entityIndex < this.planes.length) {
      entity = this.planes[target.entityIndex]
    } else if (target.targetType === 'ship' && target.entityIndex < this.ships.length) {
      entity = this.ships[target.entityIndex]
    }
    if (!entity || entity.isDead) return

    // 燃烧：持续伤害 5*mult dps，持续 3 秒
    if (elements.fire > 0) {
      entity.burnTimer = 3.0
      entity.burnDps = 5 * elements.fire
    }
    // 冰冻：减速 50%，持续 2 秒
    if (elements.ice > 0) {
      entity.iceTimer = 2.0
      entity.iceSlow = Math.min(0.8, 0.5 + (elements.ice - 1) * 0.1)
    }
    // 闪电链：命中后跳到最近的另一个敌人，造成 40% 伤害
    if (elements.electric > 0) {
      this._chainLightning(target, damage, elements.electric)
    }
  }

  _chainLightning(target, damage, mult) {
    var chainDmg = Math.floor(damage * 0.4 * mult)
    var srcPos = target.position
    var bestDist = Infinity
    var chainTarget = null

    // 在同类型 + 所有类型中找最近的另一个敌人
    var allTargets = []
    for (var i = 0; i < this.planes.length; i++) {
      if (this.planes[i].isDead || i === target.entityIndex && target.targetType === 'plane') continue
      allTargets.push(this.planes[i])
    }
    for (var i = 0; i < this.ships.length; i++) {
      if (this.ships[i].isDead || i === target.entityIndex && target.targetType === 'ship') continue
      allTargets.push(this.ships[i])
    }

    for (var i = 0; i < allTargets.length; i++) {
      var e = allTargets[i]
      var d = Math.abs(e.position.azimuth - srcPos.azimuth) + Math.abs(e.position.elevation - srcPos.elevation)
      if (d < bestDist) { bestDist = d; chainTarget = e }
    }

    if (chainTarget && bestDist < 20) {
      chainTarget.takeDamage(chainDmg)
      chainTarget.chainHit = true
      if (chainTarget.isDead) {
        this.score += chainTarget.scoreValue || 100
        this.kills++
        this.coins += 8
        this.spawner.addKill()
      }
    }
  }

  _cleanup() {
    this.planes = this.planes.filter(p => !(p.isDead && p.deathAnimProgress > 1.0))
    this.ships = this.ships.filter(s => !(s.isDead && s.deathAnimProgress > 1.0))
    this.projectiles = this.projectiles.filter(pr => !(pr.isDead && pr.deathAnimProgress > 1.0))
    this.powerUps = this.powerUps.filter(pu => !pu.expired)
  }

  dispose() {
    if (this._gameLoop) { clearInterval(this._gameLoop); this._gameLoop = null }
    this.orientationTracker.dispose()
    this.sound.raiseBGM()
    if (this._ownsSound) {
      this.sound.dispose()
    }
  }
}

module.exports = { GameEngine, GameState }
