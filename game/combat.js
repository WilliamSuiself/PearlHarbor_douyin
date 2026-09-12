/**
 * 战斗系统：自动瞄准 + 伤害计算
 * Pearl Harbor 射击游戏
 */

const { ARProjector } = require('./coordinate')

// targetType: 'plane' | 'ship' | 'projectile'
class AimResult {
  constructor({ position, angularDist, targetType, entityIndex }) {
    this.position = position
    this.angularDist = angularDist
    this.targetType = targetType
    this.entityIndex = entityIndex
    // 向后兼容
    this.isAir = (targetType === 'plane' || targetType === 'projectile')
  }
}

class AutoAim {
  /**
   * 优先拦截来袭弹药 > 飞机 > 舰船
   */
  static findTarget(cameraYaw, cameraPitch, planes, ships, projectiles) {
    let best = null
    let bestAngle = Infinity

    // 来袭弹药优先级最高（距离近的）
    if (projectiles) {
      for (let i = 0; i < projectiles.length; i++) {
        const pr = projectiles[i]
        if (pr.isDead) continue
        const angle = ARProjector.angularDistFromCenter(pr.position, cameraYaw, cameraPitch)
        // 弹药瞄准范围更宽，且距离近时优先
        const threshold = pr.position.distance < 20 ? AutoAim.AIM_THRESHOLD * 1.5 : AutoAim.AIM_THRESHOLD
        if (angle < threshold) {
          const priority = angle * (pr.position.distance / 30)
          if (!best || priority < bestAngle) {
            bestAngle = priority
            best = new AimResult({ position: pr.position, angularDist: angle, targetType: 'projectile', entityIndex: i })
          }
        }
      }
    }

    // 如果没有弹药目标，瞄准飞机
    if (!best) {
      for (let i = 0; i < planes.length; i++) {
        const p = planes[i]
        if (p.isDead) continue
        const angle = ARProjector.angularDistFromCenter(p.position, cameraYaw, cameraPitch)
        if (angle < bestAngle && angle < AutoAim.AIM_THRESHOLD) {
          bestAngle = angle
          best = new AimResult({ position: p.position, angularDist: angle, targetType: 'plane', entityIndex: i })
        }
      }
    }

    // 最后瞄准舰船
    if (!best) {
      for (let i = 0; i < ships.length; i++) {
        const s = ships[i]
        if (s.isDead) continue
        const angle = ARProjector.angularDistFromCenter(s.position, cameraYaw, cameraPitch)
        if (angle < bestAngle && angle < AutoAim.AIM_THRESHOLD) {
          bestAngle = angle
          best = new AimResult({ position: s.position, angularDist: angle, targetType: 'ship', entityIndex: i })
        }
      }
    }

    return best
  }
}

class CombatSystem {
  static applyHit(target, damage, planes, ships, projectiles) {
    const result = { planeKills: 0, shipKills: 0, projectileKills: 0, scoreGained: 0 }
    if (!target) return result

    if (target.targetType === 'projectile' && projectiles && target.entityIndex < projectiles.length) {
      const pr = projectiles[target.entityIndex]
      if (!pr.isDead) {
        pr.takeDamage(damage)
        if (pr.isDead) {
          result.projectileKills++
          result.scoreGained += 50
        }
      }
    } else if (target.targetType === 'plane' && target.entityIndex < planes.length) {
      const p = planes[target.entityIndex]
      if (!p.isDead) {
        p.takeDamage(damage)
        if (p.isDead) {
          result.planeKills++
          result.scoreGained += p.scoreValue
        }
      }
    } else if (target.targetType === 'ship' && target.entityIndex < ships.length) {
      const s = ships[target.entityIndex]
      if (!s.isDead) {
        s.takeDamage(damage)
        if (s.isDead) {
          result.shipKills++
          result.scoreGained += s.scoreValue
        }
      }
    }

    return result
  }

  /**
   * 飞机用导弹攻击（生成来袭弹药），近距离开枪
   * 舰船用鱼雷攻击，近距离开炮
   * 返回 { directDamage, newProjectiles[] }
   */
  static processEnemyAttacks(planes, ships, waveNumber, spawner) {
    let directDamage = 0
    const newProjectiles = []
    const bombDamage = spawner && spawner.bombDamageFor
      ? spawner.bombDamageFor(waveNumber)
      : Math.max(10, Math.min(25, 8 + waveNumber * 2))
    const planeGunDamage = spawner && spawner.planeGunDamageFor
      ? spawner.planeGunDamageFor(waveNumber)
      : Math.max(5, Math.min(15, 5 + waveNumber))
    const shipGunDamage = spawner && spawner.shipGunDamageFor
      ? spawner.shipGunDamageFor(waveNumber)
      : Math.max(3, Math.min(10, 3 + waveNumber))
    const missileCount = spawner && spawner.missileCountFor
      ? spawner.missileCountFor(waveNumber)
      : Math.max(0, waveNumber - 3)

    for (const p of planes) {
      if (p.isDead) continue
      // 飞越头顶时投弹：造成一次较高伤害
      if (p.flyoverState && p.flyoverTimer < 0.1) {
        directDamage += bombDamage
        continue
      }
      if (p.flyoverState) continue  // 飞越中不再攻击
      if (p.tryAttack()) {
        if (p.position.distance < 15) {
          // 近距离机枪射击
          directDamage += planeGunDamage
        } else {
          // 远距离发射导弹：数量走平滑曲线，后期继续增长但不会突变
          var ProjectileType = require('./entities').ProjectileType
          for (let mi = 0; mi < missileCount; mi++) {
            newProjectiles.push(spawner.spawnProjectile(p.position, ProjectileType.MISSILE))
          }
        }
      }
    }

    for (const s of ships) {
      if (s.isDead) continue
      if (s.tryAttack()) {
        if (s.position.distance < 10) {
          // 近距离舰炮射击
          directDamage += shipGunDamage
        } else {
          // 远距离发射鱼雷
          var ProjectileType = require('./entities').ProjectileType
          newProjectiles.push(spawner.spawnProjectile(s.position, ProjectileType.TORPEDO))
        }
      }
    }

    return { directDamage, newProjectiles }
  }
}

AutoAim.AIM_THRESHOLD = 3.5

module.exports = { AimResult, AutoAim, CombatSystem }
