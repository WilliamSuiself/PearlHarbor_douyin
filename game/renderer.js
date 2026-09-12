/**
 * Canvas 2D 渲染器 — Pearl Harbor 射击游戏
 * 绘制：天空海面背景、日军飞机/舰船/鱼雷、重机枪枪管+射击焰、准星、弹道、HUD、雷达
 */

const { ARPosition, ARProjector } = require('./coordinate')
const { PlaneType, ShipType, ProjectileType } = require('./entities')

class GameRenderer {
  constructor() {
    this._particleRng = this._createSeededRng(42)
    this._bgImage = null
    // 飞机贴图：战斗机 15帧, 轰炸机 19帧
    this._fighterFrames = []
    this._bomberFrames = []
    this._zeroSingleImg = null
    // 舰船贴图
    this._warshipImg = null
    this._torpedoBoatImg = null
    this._landingCraftImg = null
    // 弹药贴图
    this._missileImg = null
    this._torpedoImg = null
    // 枪管贴图（3级）
    this._gunImages = []  // gun_0.png, gun_1.png, gun_2.png
    this._muzzleFlashImg = null
    // 装备贴图
    this._equipGunImg = null    // crew/machine gun 贴图
    this._equipTorpedoImg = null // torpedo tube 贴图
    this._gridIconImages = {}
    this._imagesLoaded = false
  }

  /**
   * 初始化：加载所有贴图
   */
  loadImages(canvas) {
    if (this._imagesLoaded) return
    this._imagesLoaded = true

    // 背景
    this._bgImage = this._loadImage(canvas, 'images/bg.jpg')

    // 战斗机 15 帧（改用真正带透明通道的 PNG，而不是靠 multiply 混合白底 JPG——
    // 小游戏 canvas 对 globalCompositeOperation/clip 的支持不完整，会导致背景去不掉）
    for (let i = 1; i <= 15; i++) {
      const id = i < 10 ? '0' + i : '' + i
      this._fighterFrames.push(this._loadImage(canvas, 'images/fighter/frames/' + id + '.png'))
    }
    // 轰炸机 19 帧
    for (let i = 1; i <= 19; i++) {
      const id = i < 10 ? '0' + i : '' + i
      this._bomberFrames.push(this._loadImage(canvas, 'images/bomber/frames/' + id + '.png'))
    }

    // 舰船（改用真正带透明通道的 PNG，小游戏 canvas 的 multiply 去底不可靠）
    this._warshipImg = this._loadImage(canvas, 'images/warship.png')
    this._landingCraftImg = this._loadImage(canvas, 'images/landing_craft.png')
    this._torpedoBoatImg = this._landingCraftImg  // 复用登陆艇图片

    // 弹药贴图（改用真正带透明通道的 PNG）
    this._missileImg = null
    this._torpedoImg = this._loadImage(canvas, 'images/torpedo_new.png')

    // 枪管（5个档位，随枪管总数增长切换：1/2/3/4/5+管）
    this._gunImages.push(this._loadImage(canvas, 'images/gun_0.png'))
    this._gunImages.push(this._loadImage(canvas, 'images/gun_1.png'))
    this._gunImages.push(this._loadImage(canvas, 'images/gun_2.png'))
    this._gunImages.push(this._loadImage(canvas, 'images/gun_3.png'))
    this._gunImages.push(this._loadImage(canvas, 'images/gun_4.png'))
    // 枪口火焰使用程序化绘制（贴图无真实透明通道，效果不佳）
    this._muzzleFlashImg = null
    // 装备贴图
    this._equipGunImg = this._loadImage(canvas, 'images/equip_gun.png')
    this._equipTorpedoImg = this._loadImage(canvas, 'images/equip_torpedo.png')
    this._gridIconImages = {
      barrel: this._loadImage(canvas, 'images/枪管.png'),
      crew: this._loadImage(canvas, 'images/组员.png'),
      torpedo_tube: this._loadImage(canvas, 'images/鱼雷.png'),
      shield: this._loadImage(canvas, 'images/护盾.png'),
      emp: this._loadImage(canvas, 'images/电磁波.png'),
      ammo_fire: this._loadImage(canvas, 'images/火弹.png'),
      ammo_ice: this._loadImage(canvas, 'images/冰弹.png'),
      ammo_electric: this._loadImage(canvas, 'images/闪电弹.png'),
      ammo_armor_pierce: this._loadImage(canvas, 'images/穿甲弹.png'),
    }
  }

  _loadImage(canvas, src) {
    let img
    // Mini-game env: use tt.createImage (Krypton engine no longer exposes canvas.createImage)
    if (typeof tt !== 'undefined' && tt.createImage) {
      img = tt.createImage()
    } else if (typeof wx !== 'undefined' && wx.createImage) {
      img = wx.createImage()
    } else if (canvas && canvas.createImage) {
      img = canvas.createImage()
    } else {
      img = new Image()
    }
    img._loaded = false
    img.onload = () => { img._loaded = true }
    img.onerror = (e) => { console.warn('Image load failed:', src, e) }
    // Web: 使用相对路径; 小程序: 使用绝对路径
    if (typeof window !== 'undefined' && window.document) {
      img.src = src.replace(/^\//, '')
    } else {
      img.src = src.charAt(0) === '/' ? src : '/' + src
    }
    return img
  }

  _drawFitImage(ctx, img, x, y, w, h, padding) {
    if (!img || !img._loaded) return false
    var pad = padding || 0
    var boxW = Math.max(1, w - pad * 2)
    var boxH = Math.max(1, h - pad * 2)
    var iw = img.width || boxW
    var ih = img.height || boxH
    var scale = Math.min(boxW / iw, boxH / ih)
    var dw = iw * scale
    var dh = ih * scale
    var dx = x + (w - dw) / 2
    var dy = y + (h - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
    return true
  }

  /**
   * 主渲染方法
   */
  render(ctx, w, h, engine) {
    ctx.clearRect(0, 0, w, h)
    this._drawBackground(ctx, w, h, engine.cameraYaw, engine.cameraPitch)
    this._drawOceanWaves(ctx, w, h, engine.cameraYaw, engine.cameraPitch)
    this._drawShips(ctx, w, h, engine)
    this._drawPlanes(ctx, w, h, engine)
    this._drawProjectiles(ctx, w, h, engine)
    this._drawPowerUps(ctx, w, h, engine)
    this._drawBulletTrail(ctx, w, h, engine)
    this._drawCrosshair(ctx, w, h, engine.currentTarget)
    this._drawGunBarrel(ctx, w, h, engine)
    this._drawEquipment(ctx, w, h, engine)
    this._drawIngameGrid(ctx, w, h, engine)
    this._drawMuzzleFlash(ctx, w, h, engine)
    this._drawOffscreenIndicators(ctx, w, h, engine)
    this._drawComboIndicator(ctx, w, h, engine.comboCount)
    this._drawPickupMessages(ctx, w, h, engine)
    this._drawBuffIndicators(ctx, w, h, engine)
    this._drawHUD(ctx, w, h, engine)
    this._drawRadar(ctx, w, h, engine)
    this._drawWaveAlerts(ctx, w, h, engine)
  }

  // ===== 天空+海面背景 =====
  _drawBackground(ctx, w, h, yaw, pitch) {
    if (this._bgImage && this._bgImage._loaded) {
      const bgW = w * 3.0
      const bgH = h * 2.5
      const normYaw = Math.max(-1, Math.min(1, yaw / 90.0))
      const normPitch = Math.max(-1, Math.min(1, pitch / 40.0))
      const offsetX = -normYaw * (bgW - w) / 2
      const offsetY = normPitch * (bgH - h) / 2
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.clip()
      ctx.drawImage(this._bgImage,
        -(bgW - w) / 2 + offsetX,
        -(bgH - h) / 2 + offsetY,
        bgW, bgH)
      ctx.restore()
    } else {
      // 回退：天空渐变
      const horizonY = h * 0.55 + (pitch / 40.0) * h * 0.2
      // 天空
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY)
      skyGrad.addColorStop(0, '#1a3a5c')
      skyGrad.addColorStop(0.3, '#2a5a8a')
      skyGrad.addColorStop(0.6, '#4a8ab5')
      skyGrad.addColorStop(1.0, '#7ab5d6')
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, w, horizonY)

      // 薄云层
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      for (let i = 0; i < 6; i++) {
        const cy = horizonY * 0.15 + i * horizonY * 0.12
        const cx = (w * 0.5 + i * 137 - yaw * 2) % (w + 200) - 100
        ctx.beginPath()
        ctx.ellipse(cx, cy, 80 + i * 20, 12 + i * 3, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // 海面
      const seaGrad = ctx.createLinearGradient(0, horizonY, 0, h)
      seaGrad.addColorStop(0, '#2a5a7a')
      seaGrad.addColorStop(0.3, '#1a3a5a')
      seaGrad.addColorStop(1.0, '#0a1a2a')
      ctx.fillStyle = seaGrad
      ctx.fillRect(0, horizonY, w, h - horizonY)

      // 地平线亮线
      ctx.strokeStyle = 'rgba(180,220,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, horizonY)
      ctx.lineTo(w, horizonY)
      ctx.stroke()
    }
  }

  // ===== 海面波浪效果 =====
  _drawOceanWaves(ctx, w, h, yaw, pitch) {
    const horizonY = h * 0.55 + (pitch / 40.0) * h * 0.2
    const time = Date.now() / 1000
    ctx.strokeStyle = 'rgba(150,200,255,0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i < 8; i++) {
      const waveY = horizonY + 10 + i * ((h - horizonY) / 8)
      ctx.beginPath()
      for (let x = 0; x < w; x += 4) {
        const y = waveY + Math.sin((x + yaw * 3) * 0.02 + time * 1.5 + i) * (2 + i * 0.5)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  // ===== 日军飞机 =====
  _drawPlanes(ctx, w, h, engine) {
    for (const p of engine.planes) {
      const pos = ARProjector.toScreen(p.position, engine.cameraYaw, engine.cameraPitch, w, h)
      if (!pos) continue

      const scale = ARProjector.scaleForDistance(p.position.distance, 50)

      if (p.isDead) {
        const opacity = Math.max(0, Math.min(1, 1.0 - p.deathAnimProgress))
        ctx.save()
        ctx.globalAlpha = opacity
        ctx.translate(pos.x, pos.y)
        ctx.rotate(p.deathAnimProgress * 2.0)
        // 坠落时加烟雾
        this._drawSmokeTrail(ctx, 0, 0, scale, p.deathAnimProgress)
        this._drawPlaneShape(ctx, 0, 0, scale, p)
        ctx.restore()
      } else {
        const drawOpacity = p.hitFlashTimer > 0 ? 0.5 : 1.0
        ctx.save()
        ctx.globalAlpha = drawOpacity
        this._drawPlaneShape(ctx, pos.x, pos.y, scale, p)
        ctx.restore()
        if (p.hitFlashTimer > 0) this._drawHitFlash(ctx, pos.x, pos.y, scale)
        this._drawElementalStatus(ctx, pos.x, pos.y, scale, p)
        this._drawEntityHealthBar(ctx, pos.x, pos.y, scale, p.healthPercent)
        this._drawDistanceLabel(ctx, pos.x, pos.y, scale, p.position.distance)
      }
    }
  }

  _drawPlaneShape(ctx, x, y, scale, plane) {
    const frames = plane.type === PlaneType.BOMBER ? this._bomberFrames : this._fighterFrames
    const totalFrames = frames.length
    // 帧索引按距离映射：远处=第0帧，近处=最后一帧，线性插值
    const spawnDist = plane._spawnDistance || 70
    const minDist = 3.0
    const progress = Math.max(0, Math.min(1, (spawnDist - plane.position.distance) / (spawnDist - minDist)))
    const frameIdx = totalFrames > 0 ? Math.min(totalFrames - 1, Math.floor(progress * totalFrames)) : 0
    let img = frames[frameIdx]
    if (img && img._loaded) {
      const drawW = scale * 1.8
      const drawH = scale * 1.0
      // 帧图已经是带透明通道的 PNG（不再依赖 multiply 混合白底 JPG 去背景——
      // 小游戏 canvas 对 globalCompositeOperation 的支持不完整/有 bug，会导致背景去不掉）
      ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH)
    } else {
      // 回退：几何飞机
      const isBomber = plane.type === PlaneType.BOMBER
      const bodyColor = isBomber ? '#5a5a5a' : '#6a8a4a'
      const wingSpan = scale * (isBomber ? 1.0 : 0.8)
      // 机身
      ctx.fillStyle = bodyColor
      ctx.beginPath()
      ctx.ellipse(x, y, scale * 0.35, scale * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
      // 机翼
      ctx.beginPath()
      ctx.moveTo(x - wingSpan, y + scale * 0.05)
      ctx.lineTo(x - scale * 0.1, y - scale * 0.02)
      ctx.lineTo(x + scale * 0.1, y - scale * 0.02)
      ctx.lineTo(x + wingSpan, y + scale * 0.05)
      ctx.lineTo(x + scale * 0.1, y + scale * 0.08)
      ctx.lineTo(x - scale * 0.1, y + scale * 0.08)
      ctx.closePath()
      ctx.fill()
      // 尾翼
      ctx.beginPath()
      ctx.moveTo(x - scale * 0.3, y)
      ctx.lineTo(x - scale * 0.35, y - scale * 0.15)
      ctx.lineTo(x - scale * 0.25, y)
      ctx.closePath()
      ctx.fill()
      // 日之丸 (红色圆形)
      ctx.fillStyle = '#CC0000'
      ctx.beginPath()
      ctx.arc(x + scale * 0.35, y + scale * 0.03, scale * 0.06, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x - scale * 0.35, y + scale * 0.03, scale * 0.06, 0, Math.PI * 2)
      ctx.fill()
      // 螺旋桨
      const propAngle = plane.animFrame * 0.8
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x + scale * 0.35 + Math.cos(propAngle) * scale * 0.1, y + Math.sin(propAngle) * scale * 0.1)
      ctx.lineTo(x + scale * 0.35 - Math.cos(propAngle) * scale * 0.1, y - Math.sin(propAngle) * scale * 0.1)
      ctx.stroke()
    }
  }

  _drawSmokeTrail(ctx, x, y, scale, progress) {
    ctx.save()
    for (let i = 0; i < 5; i++) {
      const t = i / 5
      const sx = x - scale * 0.5 * t
      const sy = y + scale * 0.3 * t
      const r = scale * 0.08 * (1 + t)
      ctx.globalAlpha = 0.4 * (1 - t) * (1 - progress)
      ctx.fillStyle = '#333'
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
      // 火焰
      ctx.fillStyle = '#FF6600'
      ctx.beginPath()
      ctx.arc(sx + r * 0.3, sy, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // ===== 舰船 =====
  _drawShips(ctx, w, h, engine) {
    for (const s of engine.ships) {
      const pos = ARProjector.toScreen(s.position, engine.cameraYaw, engine.cameraPitch, w, h)
      if (!pos) continue

      const scale = ARProjector.scaleForDistance(s.position.distance, s.baseSize)

      if (s.isDead) {
        const opacity = Math.max(0, Math.min(1, 1.0 - s.deathAnimProgress))
        ctx.save()
        ctx.globalAlpha = opacity
        ctx.translate(pos.x, pos.y)
        ctx.rotate(s.deathAnimProgress * 0.5)
        this._drawShipShape(ctx, 0, 0, scale, s)
        ctx.restore()
      } else {
        this._drawShipShape(ctx, pos.x, pos.y, scale, s)
        this._drawElementalStatus(ctx, pos.x, pos.y, scale, s)
        this._drawEntityHealthBar(ctx, pos.x, pos.y, scale, s.healthPercent)
        this._drawDistanceLabel(ctx, pos.x, pos.y, scale, s.position.distance)
      }
    }
  }

  _drawShipShape(ctx, x, y, scale, ship) {
    let img = null
    let isTransparentImg = false
    if (ship.type === ShipType.WARSHIP) { img = this._warshipImg; isTransparentImg = true }
    else if (ship.type === ShipType.TORPEDO_BOAT) img = this._torpedoBoatImg
    else img = this._landingCraftImg

    if (img && img._loaded) {
      const drawW = scale * 1.6
      const drawH = scale * 0.9
      // 全部使用带透明通道的 PNG 直接绘制
      ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH)
    } else {
      // 回退几何舰船
      const isWarship = ship.type === ShipType.WARSHIP
      const isTorpedo = ship.type === ShipType.TORPEDO_BOAT
      const color = isWarship ? '#4a4a5a' : isTorpedo ? '#3a5a4a' : '#5a4a3a'
      const bw = scale * (isWarship ? 0.8 : 0.5)
      const bh = scale * (isWarship ? 0.25 : 0.15)

      // 船体
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(x - bw, y)
      ctx.lineTo(x - bw * 0.8, y + bh)
      ctx.lineTo(x + bw * 0.8, y + bh)
      ctx.lineTo(x + bw, y)
      ctx.lineTo(x + bw * 0.7, y - bh * 0.3)
      ctx.lineTo(x - bw * 0.7, y - bh * 0.3)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1
      ctx.stroke()

      if (isWarship) {
        // 炮塔
        ctx.fillStyle = '#3a3a4a'
        ctx.beginPath()
        ctx.arc(x - bw * 0.3, y - bh * 0.4, scale * 0.08, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x + bw * 0.3, y - bh * 0.4, scale * 0.08, 0, Math.PI * 2)
        ctx.fill()
        // 舰桥
        ctx.fillStyle = '#5a5a6a'
        this._roundRect(ctx, x - scale * 0.06, y - bh * 0.8, scale * 0.12, bh * 0.5, 2)
        ctx.fill()
      }
      // 日本旗帜标记
      ctx.fillStyle = '#CC0000'
      ctx.beginPath()
      ctx.arc(x, y - bh * 0.1, scale * 0.04, 0, Math.PI * 2)
      ctx.fill()
      // 尾流
      ctx.strokeStyle = 'rgba(200,230,255,0.15)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - bw, y + bh * 0.5)
      ctx.quadraticCurveTo(x - bw * 1.5, y + bh, x - bw * 2, y + bh * 0.3)
      ctx.stroke()
    }
  }

  // ===== 来袭弹药 =====
  _drawProjectiles(ctx, w, h, engine) {
    for (const pr of engine.projectiles) {
      if (pr.isDead) continue
      const pos = ARProjector.toScreen(pr.position, engine.cameraYaw, engine.cameraPitch, w, h)
      if (!pos) continue

      const scale = ARProjector.scaleForDistance(pr.position.distance, 20)
      const isMissile = pr.type === ProjectileType.MISSILE

      const img = isMissile ? this._missileImg : this._torpedoImg
      if (img && img._loaded) {
        const dw = scale * 0.8
        const dh = scale * 0.3
        ctx.drawImage(img, pos.x - dw / 2, pos.y - dh / 2, dw, dh)
      } else {
        // 回退几何弹药
        ctx.save()
        if (isMissile) {
          // 导弹：橙红色带尾焰
          ctx.fillStyle = '#AA3333'
          ctx.beginPath()
          ctx.ellipse(pos.x, pos.y, scale * 0.2, scale * 0.06, 0, 0, Math.PI * 2)
          ctx.fill()
          // 尾焰
          ctx.fillStyle = '#FF6600'
          ctx.globalAlpha = 0.7 + Math.sin(Date.now() * 0.02) * 0.3
          ctx.beginPath()
          ctx.moveTo(pos.x - scale * 0.2, pos.y)
          ctx.lineTo(pos.x - scale * 0.35, pos.y - scale * 0.04)
          ctx.lineTo(pos.x - scale * 0.35, pos.y + scale * 0.04)
          ctx.closePath()
          ctx.fill()
        } else {
          // 鱼雷：深灰色带水花
          ctx.fillStyle = '#4a4a5a'
          ctx.beginPath()
          ctx.ellipse(pos.x, pos.y, scale * 0.18, scale * 0.05, 0, 0, Math.PI * 2)
          ctx.fill()
          // 水花
          ctx.fillStyle = 'rgba(200,230,255,0.4)'
          ctx.beginPath()
          ctx.arc(pos.x + scale * 0.2, pos.y, scale * 0.04, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      // 警告光晕（越近越亮）
      const urgency = Math.max(0, 1 - pr.position.distance / 30)
      if (urgency > 0.2) {
        ctx.save()
        ctx.globalAlpha = urgency * 0.4
        ctx.fillStyle = '#FF0000'
        ctx.shadowColor = '#FF0000'
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, scale * 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }
  }

  // ===== 能量道具 =====
  _drawPowerUps(ctx, w, h, engine) {
    for (const pu of engine.powerUps) {
      if (pu.expired) continue
      const pos = ARProjector.toScreen(pu.position, engine.cameraYaw, engine.cameraPitch, w, h)
      if (!pos) continue

      const scale = ARProjector.scaleForDistance(pu.position.distance, 30)
      const pulse = 0.7 + 0.3 * Math.sin(pu.lifetime * 6)

      ctx.save()
      ctx.globalAlpha = 0.3 * pulse
      ctx.fillStyle = pu.color
      ctx.shadowColor = pu.color
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, scale * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      const d = scale * 0.3
      ctx.save()
      ctx.globalAlpha = 0.9 * pulse
      ctx.fillStyle = pu.color
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y - d)
      ctx.lineTo(pos.x + d * 0.6, pos.y)
      ctx.lineTo(pos.x, pos.y + d)
      ctx.lineTo(pos.x - d * 0.6, pos.y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      const fontSize = Math.max(8, Math.min(14, scale * 0.2))
      ctx.fillStyle = pu.color
      ctx.font = `bold ${fontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(pu.label, pos.x, pos.y + d + fontSize + 2)
    }
  }

  // ===== 弹道轨迹（元素彩色光点） =====
  _drawBulletTrail(ctx, w, h, engine) {
    if (engine.muzzleFlashTimer <= 0 || !engine.currentTarget) return
    const tPos = ARProjector.toScreen(engine.currentTarget.position, engine.cameraYaw, engine.cameraPitch, w, h)
    if (!tPos) return

    // 元素颜色
    var elements = engine.inventory ? engine.inventory.getActiveElements() : { fire: 0, ice: 0, electric: 0 }
    var bulletColor = '#FFD030', glowColor = '#FFAA00', sparkColor = '#FFE060'
    if (elements.fire > 0 && elements.ice === 0 && elements.electric === 0) {
      bulletColor = '#FF4400'; glowColor = '#FF2200'; sparkColor = '#FF6600'
    } else if (elements.ice > 0 && elements.fire === 0 && elements.electric === 0) {
      bulletColor = '#00DDFF'; glowColor = '#0088FF'; sparkColor = '#88EEFF'
    } else if (elements.electric > 0 && elements.fire === 0 && elements.ice === 0) {
      bulletColor = '#FFFF00'; glowColor = '#CCFF00'; sparkColor = '#FFFFFF'
    } else if (elements.fire > 0 || elements.ice > 0 || elements.electric > 0) {
      bulletColor = '#FF88FF'; glowColor = '#CC44FF'; sparkColor = '#FFAAFF'
    }

    const cx = w / 2, cy = h * 0.82
    const t = 1.0 - engine.muzzleFlashTimer * 10  // 0→1 飞行进度

    // 多管弹道（基于武器配置）
    const barrels = engine.visualBarrelCount || 1
    const spread = 8
    for (let b = 0; b < barrels; b++) {
      const offset = (b - (barrels - 1) / 2) * spread
      const startX = cx + offset
      const endX = tPos.x + (Math.random() - 0.5) * 2
      const endY = tPos.y + (Math.random() - 0.5) * 2

      // 沿弹道绘制多个光点（尾迹）
      for (let i = 0; i < 4; i++) {
        const p = Math.min(1, Math.max(0, t - i * 0.08))
        const bx = startX + (endX - startX) * p
        const by = cy + (endY - cy) * p
        const alpha = (1.0 - i * 0.25) * (1.0 - t * 0.3)
        const radius = i === 0 ? 3.5 : 2.0 - i * 0.3

        ctx.save()
        ctx.globalAlpha = Math.max(0.1, alpha)
        ctx.fillStyle = bulletColor
        ctx.shadowColor = glowColor
        ctx.shadowBlur = i === 0 ? 6 : 3
        ctx.beginPath()
        ctx.arc(bx, by, Math.max(1, radius), 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    // 命中火花
    if (t > 0.7) {
      const sparkAlpha = Math.min(1, (t - 0.7) * 3.3)
      ctx.save()
      ctx.globalAlpha = sparkAlpha * 0.9
      ctx.fillStyle = sparkColor
      ctx.shadowColor = glowColor
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(tPos.x, tPos.y, 4 + 6 * sparkAlpha, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // ===== 元素状态效果（敌人身上） =====
  _drawElementalStatus(ctx, x, y, scale, entity) {
    var r = Math.max(8, scale * 0.3)
    // 燃烧：橙红色脉冲光晕
    if (entity.burnTimer > 0) {
      var pulse = 0.5 + 0.3 * Math.sin(Date.now() * 0.012)
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.fillStyle = '#FF4400'
      ctx.shadowColor = '#FF2200'
      ctx.shadowBlur = r
      ctx.beginPath()
      ctx.arc(x, y, r * 1.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // 小火苗粒子
      ctx.save()
      ctx.globalAlpha = 0.8
      ctx.fillStyle = '#FFAA00'
      var t = Date.now() * 0.005
      for (var i = 0; i < 3; i++) {
        var fx = x + Math.sin(t + i * 2.1) * r * 0.6
        var fy = y - r * 0.5 - Math.abs(Math.cos(t + i * 1.3)) * r * 0.8
        ctx.beginPath()
        ctx.arc(fx, fy, 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    // 冰冻：蓝色半透明覆盖 + 冰晶符号
    if (entity.iceTimer > 0) {
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.fillStyle = '#00CCFF'
      ctx.shadowColor = '#0088FF'
      ctx.shadowBlur = 6
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.save()
      ctx.globalAlpha = 0.7
      ctx.fillStyle = '#88EEFF'
      ctx.font = Math.max(8, Math.floor(r * 0.8)) + 'px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u2744', x, y - r * 0.8)
      ctx.restore()
    }
    // 闪电链命中：电弧闪烁
    if (entity.chainHit) {
      ctx.save()
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = '#FFFF00'
      ctx.shadowColor = '#FFFF00'
      ctx.shadowBlur = 8
      ctx.lineWidth = 2
      ctx.beginPath()
      var lx = x - r, ly = y
      ctx.moveTo(lx, ly)
      for (var seg = 0; seg < 4; seg++) {
        lx += r * 0.5
        ly += (Math.random() - 0.5) * r
        ctx.lineTo(lx, ly)
      }
      ctx.stroke()
      ctx.restore()
    }
  }

  // ===== 准星 =====
  _drawCrosshair(ctx, w, h, currentTarget) {
    const cx = w / 2, cy = h / 2
    const hasTarget = !!currentTarget
    const color = hasTarget ? '#FF0044' : '#00FFFF'
    const r = 24

    ctx.save()
    ctx.strokeStyle = hasTarget ? 'rgba(255,0,68,0.37)' : 'rgba(0,255,255,0.19)'
    ctx.lineWidth = 4
    ctx.shadowColor = color
    ctx.shadowBlur = 4
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    ctx.strokeStyle = color
    ctx.lineWidth = hasTarget ? 2 : 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    const gap = 6, ext = 12
    ctx.beginPath()
    ctx.moveTo(cx - r - ext, cy); ctx.lineTo(cx - r + gap, cy)
    ctx.moveTo(cx + r - gap, cy); ctx.lineTo(cx + r + ext, cy)
    ctx.moveTo(cx, cy - r - ext); ctx.lineTo(cx, cy - r + gap)
    ctx.moveTo(cx, cy + r - gap); ctx.lineTo(cx, cy + r + ext)
    ctx.stroke()

    ctx.fillStyle = hasTarget ? '#FF0044' : 'rgba(0,255,255,0.67)'
    ctx.beginPath()
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // ===== 重机枪枪管 =====
  _drawGunBarrel(ctx, w, h, engine) {
    const cx = w / 2
    const gunLevel = engine.visualGunLevel || 0
    const gunImg = this._gunImages[gunLevel]

    if (gunImg && gunImg._loaded) {
      // 贴图枪管：宽度约屏幕 40%, 底部对齐（PNG 透明通道）
      const drawW = w * 0.4
      const drawH = drawW * 0.6
      const srcPad = 1
      ctx.drawImage(
        gunImg,
        srcPad, srcPad,
        Math.max(1, gunImg.width - srcPad * 2),
        Math.max(1, gunImg.height - srcPad * 2),
        cx - drawW / 2, h - drawH,
        drawW, drawH
      )
    } else {
      // 回退：几何枪管
      const barrelCount = 1 + gunLevel
      const barrelSpacing = 12
      const barrelLength = h * 0.22
      const barrelWidth = gunLevel >= 2 ? 5 : gunLevel >= 1 ? 6 : 7
      const baseY = h - 10

      // 枪架底座
      ctx.fillStyle = '#2a2a2a'
      this._roundRect(ctx, cx - 30, baseY - 20, 60, 30, 4)
      ctx.fill()
      ctx.strokeStyle = '#4a4a4a'
      ctx.lineWidth = 1
      this._roundRect(ctx, cx - 30, baseY - 20, 60, 30, 4)
      ctx.stroke()

      // 金属质感把手
      ctx.fillStyle = '#3a3a3a'
      ctx.fillRect(cx - 20, baseY - 25, 8, 12)
      ctx.fillRect(cx + 12, baseY - 25, 8, 12)

      // 枪管们
      for (let i = 0; i < barrelCount; i++) {
        const offset = (i - (barrelCount - 1) / 2) * barrelSpacing
        const bx = cx + offset

        // 枪管金属渐变
        const barrelGrad = ctx.createLinearGradient(bx - barrelWidth, 0, bx + barrelWidth, 0)
        barrelGrad.addColorStop(0, '#2a2a2a')
        barrelGrad.addColorStop(0.3, '#5a5a5a')
        barrelGrad.addColorStop(0.5, '#7a7a7a')
        barrelGrad.addColorStop(0.7, '#5a5a5a')
        barrelGrad.addColorStop(1, '#2a2a2a')

        ctx.fillStyle = barrelGrad
        ctx.fillRect(bx - barrelWidth / 2, baseY - barrelLength, barrelWidth, barrelLength - 15)

        // 枪口制退器
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(bx - barrelWidth / 2 - 2, baseY - barrelLength - 5, barrelWidth + 4, 8)

        // 散热孔
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 1
        for (let j = 0; j < 4; j++) {
          const hy = baseY - barrelLength + 15 + j * 18
          ctx.beginPath()
          ctx.moveTo(bx - barrelWidth / 2 + 1, hy)
          ctx.lineTo(bx + barrelWidth / 2 - 1, hy)
          ctx.stroke()
        }
      }

      // 弹链/弹鼓指示
      if (gunLevel >= 1) {
        ctx.fillStyle = '#4a3a2a'
        ctx.beginPath()
        ctx.arc(cx + 25, baseY - 15, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#6a5a4a'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }

  // ===== 装备视觉效果（枪管旁渲染已购买装备贴图）=====
  _drawEquipment(ctx, w, h, engine) {
    if (!engine || !engine.inventory) return
    const items = engine.inventory.placedItems
    if (items.length === 0) return

    const cx = w / 2
    const baseY = h - 10
    const gunLevel = engine.visualGunLevel || 0
    const gunImg = this._gunImages[gunLevel]
    const useImgGun = gunImg && gunImg._loaded
    const gunBaseY = useImgGun ? h - (w * 0.4 * 0.6) * 0.35 : baseY - 20
    const t = Date.now() * 0.001

    // 统计各装备数量（使用升级后的 count）
    // 注：机枪/双管/三管的数量已通过 visualGunLevel 直接体现在炮身贴图（gun_0..gun_4）上，
    // 因此不再额外叠加漂浮小图标，避免与炮身贴图重复表达。
    var counts = engine.inventory.getItemCounts()
    var torpVisual = Math.min(6, counts.torpedo_tube || 0)
    var shieldTotal = counts.shield || 0

    // --- 护盾光罩 ---
    if (shieldTotal > 0 && engine.inventory.shieldHP > 0) {
      var shieldAlpha = 0.15 + 0.08 * Math.sin(t * 2.0)
      var shieldPct = engine.inventory.shieldHP / Math.max(1, engine.inventory.maxShieldHP)
      var shieldRadius = 70 + Math.min(shieldTotal, 8) * 10
      ctx.save()
      ctx.globalAlpha = shieldAlpha * shieldPct
      var shieldGrad = ctx.createRadialGradient(cx, gunBaseY, 10, cx, gunBaseY, shieldRadius)
      shieldGrad.addColorStop(0, 'rgba(100,130,255,0.0)')
      shieldGrad.addColorStop(0.5, 'rgba(100,130,255,0.3)')
      shieldGrad.addColorStop(0.8, 'rgba(130,170,255,0.5)')
      shieldGrad.addColorStop(1, 'rgba(100,130,255,0.0)')
      ctx.fillStyle = shieldGrad
      ctx.beginPath()
      ctx.ellipse(cx, gunBaseY, shieldRadius, shieldRadius * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(130,180,255,' + (0.3 + 0.2 * Math.sin(t * 3)) + ')'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(cx, gunBaseY, shieldRadius - 2, shieldRadius * 0.6 - 2, 0, -Math.PI * 0.8, -Math.PI * 0.2)
      ctx.stroke()
      ctx.restore()
    }

    // --- 鱼雷贴图（equip_torpedo.png）：多管并排 ---
    if (torpVisual > 0 && this._equipTorpedoImg && this._equipTorpedoImg._loaded) {
      var tBaseSize = Math.min(w * 0.11, 48)
      var tSpriteSize = torpVisual <= 1 ? tBaseSize : tBaseSize * Math.max(0.35, 0.8 / Math.sqrt(torpVisual))
      var tH = tSpriteSize * 2.0

      var effects = engine.inventory.getEffects()
      var remaining = effects.torpedoInterval > 0 ? effects.torpedoInterval - engine._torpedoAutoTimer : 0
      var tReady = remaining <= 1.5

      for (var ti = 0; ti < torpVisual; ti++) {
        var tSide = ti % 2 === 0 ? -1 : 1
        var tX = cx + tSide * (w * 0.20 + Math.floor(ti / 2) * tSpriteSize * 0.65)
        var tY = gunBaseY - tH * 0.45
        var tAlpha = tReady ? 1.0 : 0.6 + 0.2 * Math.sin(t * 3)

        ctx.save()
        // equip_torpedo.png 已转为带透明通道的 PNG，不再需要 multiply 混合
        ctx.globalAlpha = tAlpha
        ctx.drawImage(this._equipTorpedoImg, tX - tSpriteSize / 2, tY, tSpriteSize, tH)
        ctx.restore()

        ctx.fillStyle = tReady ? '#00FF66' : '#663300'
        ctx.beginPath()
        ctx.arc(tX, gunBaseY + 8, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // ===== 游戏中图纸面板（枪管下方）=====
  _drawIngameGrid(ctx, w, h, engine) {
    if (!engine || !engine.inventory) return
    var items = engine.inventory.placedItems
    if (items.length === 0) return

    var invMod = require('./inventory')
    var GRID_COLS = invMod.GRID_COLS
    var GRID_ROWS = invMod.GRID_ROWS
    var getUpgradeTier = invMod.getUpgradeTier

    // 图纸面板：沿用购买页的风格，但尺寸收紧
    var CELL = Math.floor(Math.min(18, w / (GRID_COLS * 3.0 + 4)))
    var gridW = GRID_COLS * CELL
    var gridH = GRID_ROWS * CELL
    var gridX = Math.floor((w - gridW) / 2)
    var panelPad = 8
    var titleH = 14
    var panelW = gridW + panelPad * 2
    var panelH = gridH + panelPad * 2 + titleH
    var panelX = Math.floor((w - panelW) / 2)
    var panelY = h - panelH - 4
    var gridY = panelY + panelPad + titleH

    ctx.save()
    ctx.fillStyle = 'rgba(10,20,45,0.68)'
    this._roundRect(ctx, panelX, panelY, panelW, panelH, 6)
    ctx.fill()
    ctx.strokeStyle = 'rgba(100,150,255,0.35)'
    ctx.lineWidth = 1
    this._roundRect(ctx, panelX, panelY, panelW, panelH, 6)
    ctx.stroke()
    ctx.fillStyle = 'rgba(180,220,255,0.55)'
    ctx.font = 'bold 8px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('装备图纸', panelX + panelW / 2, panelY + 8)

    for (var gr = 0; gr < GRID_ROWS; gr++) {
      for (var gc = 0; gc < GRID_COLS; gc++) {
        var cx1 = gridX + gc * CELL
        var cy1 = gridY + gr * CELL
        var unlocked = engine.inventory.isCellUnlocked(gc, gr)
        var cellItem = engine.inventory.getItemAt(gc, gr)

        this._roundRect(ctx, cx1 + 1, cy1 + 1, CELL - 2, CELL - 2, 3)
        ctx.fillStyle = unlocked ? 'rgba(40,55,95,0.38)' : 'rgba(12,12,24,0.55)'
        ctx.fill()
        ctx.strokeStyle = unlocked ? 'rgba(120,170,255,0.18)' : 'rgba(50,50,70,0.25)'
        ctx.lineWidth = 0.5
        this._roundRect(ctx, cx1 + 1, cy1 + 1, CELL - 2, CELL - 2, 3)
        ctx.stroke()
        if (!unlocked) continue

        if (cellItem && cellItem.col === gc && cellItem.row === gr) {
          var bw = cellItem.def.w * CELL
          var bh = cellItem.def.h * CELL

          ctx.fillStyle = cellItem.def.color + '2a'
          this._roundRect(ctx, cx1 + 1, cy1 + 1, bw - 2, bh - 2, 4)
          ctx.fill()
          ctx.strokeStyle = cellItem.def.color + 'cc'
          ctx.lineWidth = 1
          this._roundRect(ctx, cx1 + 1, cy1 + 1, bw - 2, bh - 2, 4)
          ctx.stroke()

          var iconImg = this._gridIconImages[cellItem.def.id]
          if (iconImg && iconImg._loaded) {
            ctx.save()
            this._roundRect(ctx, cx1 + 2, cy1 + 2, bw - 4, bh - 4, 3)
            ctx.clip()
            this._drawFitImage(ctx, iconImg, cx1 + 2, cy1 + 2, bw - 4, bh - 7, 2)
            ctx.restore()
          } else {
            ctx.fillStyle = cellItem.def.color
            ctx.font = 'bold ' + Math.floor(CELL * 0.5) + 'px monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(cellItem.def.icon, cx1 + bw / 2, cy1 + bh / 2)
          }

          // 冷却/换弹覆盖
          var ws = engine.weaponStates[cellItem.uid]
          if (ws && ws.phase === 'reloading') {
            var reloadPct = ws.timer / ws.reloadTime
            // 从下到上的灰色遮罩表示装弹进度
            var maskH = Math.floor(bh * (1.0 - reloadPct))
            ctx.fillStyle = 'rgba(0,0,0,0.55)'
            ctx.fillRect(cx1, cy1, bw, maskH)
            // RELOAD 文字
            ctx.fillStyle = '#FF4444'
            ctx.font = 'bold ' + Math.max(6, Math.floor(CELL * 0.35)) + 'px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('装', cx1 + bw / 2, cy1 + bh / 2)
          }

          ctx.fillStyle = '#FFFFFF'
          ctx.font = '6px -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(cellItem.def.name, cx1 + bw / 2, cy1 + bh - 1)

          // 星标（仅升级过的）
          var tier = getUpgradeTier(cellItem.count)
          if (tier.stars > 0) {
            ctx.fillStyle = tier.starType === 'gold' ? '#FFD700' : '#C0C0C0'
            ctx.font = 'bold 7px sans-serif'
            ctx.textAlign = 'right'
            ctx.textBaseline = 'top'
            ctx.fillText(tier.label, cx1 + bw - 1, cy1 + 1)
          }
        }
      }
    }
    ctx.restore()
  }

  // ===== 射击焰（枪口火焰）=====
  _drawMuzzleFlash(ctx, w, h, engine) {
    if (!engine || engine.muzzleFlashTimer <= 0) return
    const timer = engine.muzzleFlashTimer
    const cx = w / 2
    const gunLevel = engine.visualGunLevel || 0
    const barrelCount = engine.visualBarrelCount || 1
    const barrelSpacing = 12
    const barrelLength = h * 0.22
    const baseY = h - 10
    const flashY = baseY - barrelLength - 8
    const intensity = Math.max(0, Math.min(1, timer * 10))

    // 检查是否有贴图枪管
    const gunImg = this._gunImages[gunLevel]
    const useImgGun = gunImg && gunImg._loaded
    const flashBaseY = useImgGun ? h - (w * 0.4 * 0.6) + 5 : flashY

    if (this._muzzleFlashImg && this._muzzleFlashImg._loaded) {
      // lighter 混合模式：加法混合，灰色背景消失，火焰叠加发光
      for (let i = 0; i < barrelCount; i++) {
        const offset = (i - (barrelCount - 1) / 2) * barrelSpacing
        const fw = 60 * intensity
        const fh = 70 * intensity
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = intensity * 0.9
        ctx.drawImage(this._muzzleFlashImg, cx + offset - fw / 2, flashBaseY - fh, fw, fh)
        ctx.restore()
      }
    } else {
      // 回退：程序化射击焰
      for (let i = 0; i < barrelCount; i++) {
        const offset = (i - (barrelCount - 1) / 2) * barrelSpacing
        const fx = cx + offset

        // 外层火焰（橙黄色）
        ctx.save()
        ctx.globalAlpha = 0.7 * intensity
        const outerGrad = ctx.createRadialGradient(fx, flashBaseY, 0, fx, flashBaseY, 50 * intensity)
        outerGrad.addColorStop(0, 'rgba(255,255,200,1)')
        outerGrad.addColorStop(0.3, 'rgba(255,200,50,0.8)')
        outerGrad.addColorStop(0.6, 'rgba(255,100,0,0.4)')
        outerGrad.addColorStop(1, 'rgba(255,50,0,0)')
        ctx.fillStyle = outerGrad
        ctx.beginPath()
        ctx.arc(fx, flashBaseY, 50 * intensity, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // 向上的火舌
        ctx.save()
        ctx.globalAlpha = 0.8 * intensity
        ctx.fillStyle = '#FFCC33'
        ctx.beginPath()
        ctx.moveTo(fx - 12 * intensity, flashBaseY)
        ctx.lineTo(fx, flashBaseY - 60 * intensity)
        ctx.lineTo(fx + 12 * intensity, flashBaseY)
        ctx.closePath()
        ctx.fill()
        ctx.restore()

        // 核心白色闪光
        ctx.save()
        ctx.globalAlpha = intensity
        ctx.fillStyle = '#FFFFFF'
        ctx.shadowColor = '#FFCC33'
        ctx.shadowBlur = 24
        ctx.beginPath()
        ctx.arc(fx, flashBaseY, 10 * intensity, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // 枪管周围的环境光
      ctx.save()
      ctx.globalAlpha = 0.15 * intensity
      const ambGrad = ctx.createRadialGradient(cx, flashBaseY + 30, 0, cx, flashBaseY + 30, 160)
      ambGrad.addColorStop(0, 'rgba(255,200,100,1)')
      ambGrad.addColorStop(1, 'rgba(255,200,100,0)')
      ctx.fillStyle = ambGrad
      ctx.fillRect(cx - 80, flashBaseY - 20, 160, 100)
      ctx.restore()
    }
  }

  // ===== 屏幕外敌人指示器 =====
  _drawOffscreenIndicators(ctx, w, h, engine) {
    const enemies = []
    for (const p of engine.planes) if (!p.isDead) enemies.push({ pos: p.position, type: 'air' })
    for (const s of engine.ships) if (!s.isDead) enemies.push({ pos: s.position, type: 'sea' })
    for (const pr of engine.projectiles) if (!pr.isDead) enemies.push({ pos: pr.position, type: 'proj' })

    for (const e of enemies) {
      const sp = ARProjector.toScreen(e.pos, engine.cameraYaw, engine.cameraPitch, w, h)
      if (sp) continue

      const deltaAz = ARPosition.wrapAngle(e.pos.azimuth - engine.cameraYaw)
      const deltaEl = e.pos.elevation - engine.cameraPitch
      const angle = Math.atan2(deltaEl, deltaAz)
      const margin = 35
      const cx = w / 2, cy = h / 2

      let ix = cx + Math.cos(angle) * (w / 2 - margin)
      let iy = cy - Math.sin(angle) * (h / 2 - margin)
      ix = Math.max(margin, Math.min(w - margin, ix))
      iy = Math.max(margin, Math.min(h - margin, iy))

      const color = e.type === 'proj' ? '#FF4400' : e.type === 'air' ? '#FF0044' : '#FFAA00'
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(ix + Math.cos(angle) * 12, iy - Math.sin(angle) * 12)
      ctx.lineTo(ix + Math.cos(angle + 2.5) * 9, iy - Math.sin(angle + 2.5) * 9)
      ctx.lineTo(ix + Math.cos(angle - 2.5) * 9, iy - Math.sin(angle - 2.5) * 9)
      ctx.closePath()
      ctx.fill()

      // 弹药额外闪烁警告
      if (e.type === 'proj') {
        ctx.save()
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.01)
        ctx.strokeStyle = '#FF4400'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(ix, iy, 8, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  // ===== 连击提示 =====
  _drawComboIndicator(ctx, w, h, comboCount) {
    if (comboCount < 2) return
    const text = comboCount >= 5 ? `连击 x${comboCount} !!!` : comboCount >= 3 ? `连击 x${comboCount} !` : `连击 x${comboCount}`
    const color = comboCount >= 5 ? '#FF0044' : comboCount >= 3 ? '#FFAA00' : '#00FFFF'
    const fontSize = 20 + Math.min(10, comboCount) * 2

    ctx.save()
    ctx.fillStyle = color
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.fillText(text, w / 2, h * 0.15)
    ctx.restore()
  }

  // ===== BUFF 指示器 =====
  _drawBuffIndicators(ctx, w, h, engine) {
    let y = h * 0.25
    const x = 10
    // 当前武器等级显示（来自背包装备）
    const gunNames = ['单管防空', '双管防空', '三管防空', '四管防空', '重型炮台']
    const level = engine.visualGunLevel || 0
    const gunCount = engine.inventory ? engine.inventory.getGunCount() : 0
    const gunLabel = gunNames[Math.min(level, 4)] + (gunCount > 1 ? ' x' + gunCount : '')
    this._drawBuffBadge(ctx, x, y, gunLabel,
      level > 0 ? '#FF8800' : '#88AACC', 99)
    y += 30
    if (engine.damageBoostTimer > 0 || engine.damageBoostKills > 0) {
      const dmgLabel = engine.damageBoostKills > 0
        ? '伤害x2 x' + engine.damageBoostKills
        : '伤害x2'
      this._drawBuffBadge(ctx, x, y, dmgLabel, '#FF6600',
        engine.damageBoostKills > 0 ? engine.damageBoostKills : engine.damageBoostTimer)
      y += 30
    }
    if (engine.rapidFireTimer > 0 || engine.rapidFireKills > 0) {
      const rfLabel = engine.rapidFireKills > 0
        ? '急速射击 x' + engine.rapidFireKills
        : '急速射击'
      this._drawBuffBadge(ctx, x, y, rfLabel, '#FFCC00',
        engine.rapidFireKills > 0 ? engine.rapidFireKills : engine.rapidFireTimer)
      y += 30
    }
  }

  _drawBuffBadge(ctx, x, y, label, color, timer) {
    const bw = 130, bh = 24, br = 4
    // 深色半透明背景
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    this._roundRect(ctx, x, y, bw, bh, br)
    ctx.fill()
    ctx.strokeStyle = this._hexAlpha(color, 0.8)
    ctx.lineWidth = 1.5
    this._roundRect(ctx, x, y, bw, bh, br)
    ctx.stroke()

    if (timer < 90) {
      const frac = Math.max(0, Math.min(1, timer / 10))
      ctx.fillStyle = this._hexAlpha(color, 0.5)
      ctx.fillRect(x + 2, y + bh - 4, (bw - 4) * frac, 3)
    }

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(label, x + bw / 2, y + 16)
  }

  // ===== HUD =====
  _drawHUD(ctx, w, h, engine) {
    this._drawHealthBar(ctx, 12, 12, engine.playerHealth, engine.maxPlayerHealth)
    // 护盾条
    var hudNextY = 34
    if (engine.inventory && engine.inventory.maxShieldHP > 0) {
      this._drawShieldBar(ctx, 12, hudNextY, engine.inventory.shieldHP, engine.inventory.maxShieldHP)
      hudNextY += 18
    }
    // Crew / Torpedo 装备指示器
    if (engine.inventory && engine.inventory.placedItems.length > 0) {
      this._drawEquipIndicators(ctx, 12, hudNextY, engine)
    }
    this._drawScoreDisplay(ctx, w - 12, 12, engine)
    this._drawAmmoTypeHUD(ctx, w / 2, 12, engine)
    if (engine.spawner.waveNumber > 1) {
      this._drawWaveIndicator(ctx, w / 2, h - 16, engine.spawner.waveNumber)
    }
    if (engine.playerHealth < engine.maxPlayerHealth * 0.3) {
      this._drawDamageVignette(ctx, w, h, 1.0 - engine.playerHealth / (engine.maxPlayerHealth * 0.3))
    }
  }

  // ===== 顶部弹种指示条（冰/火/电元素弹药）=====
  _drawAmmoTypeHUD(ctx, cx, y, engine) {
    if (!engine.inventory) return
    var invMod = require('./inventory')
    var GRID_ITEM_DEFS = invMod.GRID_ITEM_DEFS
    var getUpgradeTier = invMod.getUpgradeTier
    var counts = engine.inventory.getItemCounts()
    var active = engine.inventory.getActiveElements()

    var slots = [
      { key: 'ammo_fire', elem: 'fire', color: '#FF6600' },
      { key: 'ammo_ice', elem: 'ice', color: '#00CCFF' },
      { key: 'ammo_electric', elem: 'electric', color: '#FFFF00' }
    ]
    var owned = slots.filter(function(s) { return (counts[s.key] || 0) > 0 })
    if (owned.length === 0) return

    var t = Date.now() * 0.001
    var box = 26, gap = 6
    var totalW = owned.length * box + (owned.length - 1) * gap
    var startX = cx - totalW / 2
    var topY = y

    for (var i = 0; i < owned.length; i++) {
      var s = owned[i]
      var def = GRID_ITEM_DEFS[s.key]
      var isActive = (active[s.elem] || 0) > 0
      var bx = startX + i * (box + gap)
      var by = topY

      ctx.save()
      if (isActive) {
        var pulse = 0.6 + 0.4 * Math.sin(t * 3.5 + i)
        ctx.shadowColor = s.color
        ctx.shadowBlur = 8 * pulse
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        this._roundRect(ctx, bx, by, box, box, 4)
        ctx.fill()
        ctx.strokeStyle = s.color
        ctx.lineWidth = 2
        this._roundRect(ctx, bx, by, box, box, 4)
        ctx.stroke()
        ctx.globalAlpha = 1.0
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        this._roundRect(ctx, bx, by, box, box, 4)
        ctx.fill()
        ctx.strokeStyle = 'rgba(150,150,150,0.4)'
        ctx.lineWidth = 1
        this._roundRect(ctx, bx, by, box, box, 4)
        ctx.stroke()
        ctx.globalAlpha = 0.45
      }
      ctx.font = 'bold 15px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isActive ? s.color : '#888888'
      ctx.fillText(def.icon, bx + box / 2, by + box / 2 + 1)
      ctx.restore()

      // 星级角标（已升级）
      var tier = getUpgradeTier(counts[s.key] || 0)
      if (tier.stars > 0) {
        ctx.fillStyle = tier.starType === 'gold' ? '#FFD700' : '#C0C0C0'
        ctx.font = 'bold 7px sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        ctx.fillText(tier.label, bx + box - 1, by + 1)
      }
    }
  }

  _drawEquipIndicators(ctx, x, y, engine) {
    var items = engine.inventory.placedItems
    var crewCount = 0
    var torpedoCount = 0
    var gunCount = 0
    for (var i = 0; i < items.length; i++) {
      var id = items[i].def.id
      if (id === 'crew') crewCount++
      else if (id === 'torpedo_tube') torpedoCount++
      else if (id === 'barrel') gunCount += items[i].count
    }

    var offsetX = 0
    // Crew 指示器 — 小人图标 + 射击动画
    if (crewCount > 0) {
      var pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.008)
      ctx.fillStyle = 'rgba(0,204,255,' + pulse + ')'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      // 小人符号重复表示数量
      var crewText = ''
      for (var ci = 0; ci < crewCount; ci++) crewText += '\u2694'
      ctx.fillText(crewText + ' 组员 x' + crewCount, x + offsetX, y)
      offsetX += 80 + crewCount * 8
    }
    // Torpedo 指示器 — 倒计时
    if (torpedoCount > 0) {
      var effects = engine.inventory.getEffects()
      var remaining = effects.torpedoInterval - engine._torpedoAutoTimer
      if (remaining < 0) remaining = 0
      ctx.fillStyle = remaining < 2 ? '#00FF88' : 'rgba(0,255,136,0.6)'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('\u26A1 鱼雷 ' + remaining.toFixed(1) + '秒', x + offsetX, y)
    }
  }

  _drawHealthBar(ctx, x, y, current, max) {
    const barW = 160, barH = 20
    const pct = max > 0 ? current / max : 0
    const color = pct > 0.5 ? '#00FF88' : pct > 0.25 ? '#FFAA00' : '#FF0044'

    ctx.fillStyle = 'rgba(0,0,0,0.27)'
    this._roundRect(ctx, x, y, barW, barH, 3)
    ctx.fill()
    ctx.strokeStyle = this._hexAlpha(color, 0.4)
    ctx.lineWidth = 1
    this._roundRect(ctx, x, y, barW, barH, 3)
    ctx.stroke()

    if (pct > 0) {
      const grad = ctx.createLinearGradient(x, y, x + barW * pct, y)
      grad.addColorStop(0, this._hexAlpha(color, 0.9))
      grad.addColorStop(1, this._hexAlpha(color, 0.5))
      ctx.fillStyle = grad
      this._roundRect(ctx, x + 1, y + 1, (barW - 2) * Math.max(0, Math.min(1, pct)), barH - 2, 2)
      ctx.fill()
    }

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`生命 ${current}`, x + barW / 2, y + barH / 2 + 4)
  }

  _drawShieldBar(ctx, x, y, current, max) {
    const barW = 120, barH = 14
    const pct = max > 0 ? current / max : 0
    const color = '#8888FF'
    ctx.fillStyle = 'rgba(0,0,0,0.27)'
    this._roundRect(ctx, x, y, barW, barH, 3)
    ctx.fill()
    ctx.strokeStyle = this._hexAlpha(color, 0.4)
    ctx.lineWidth = 1
    this._roundRect(ctx, x, y, barW, barH, 3)
    ctx.stroke()
    if (pct > 0) {
      ctx.fillStyle = this._hexAlpha(color, 0.7)
      this._roundRect(ctx, x + 1, y + 1, (barW - 2) * Math.max(0, Math.min(1, pct)), barH - 2, 2)
      ctx.fill()
    }
    ctx.fillStyle = '#CCCCFF'
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('护盾 ' + current, x + barW / 2, y + barH / 2 + 3)
  }

  _drawScoreDisplay(ctx, right, y, engine) {
    const boxW = 100, boxH = 64
    const x = right - boxW

    ctx.fillStyle = 'rgba(0,0,0,0.27)'
    this._roundRect(ctx, x, y, boxW, boxH, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,255,255,0.13)'
    ctx.lineWidth = 0.5
    this._roundRect(ctx, x, y, boxW, boxH, 4)
    ctx.stroke()

    ctx.fillStyle = '#00FFFF'
    ctx.font = 'bold 20px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${engine.score}`, right - 8, y + 22)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.67)'
    ctx.fillText(`击杀 ${engine.kills}  波次 ${engine.spawner.waveNumber}`, right - 8, y + 40)

    // 金币显示
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('金币 ' + engine.coins, right - 8, y + 56)
  }

  _drawWaveIndicator(ctx, cx, y, wave) {
    const text = `第 ${wave} 波`
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    this._roundRect(ctx, cx - 40, y - 10, 80, 20, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,255,255,0.19)'
    ctx.lineWidth = 0.5
    this._roundRect(ctx, cx - 40, y - 10, 80, 20, 4)
    ctx.stroke()
    ctx.fillStyle = 'rgba(0,255,255,0.67)'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(text, cx, y + 4)
  }

  _drawDamageVignette(ctx, w, h, intensity) {
    const alpha = Math.max(0, Math.min(0.6, intensity * 0.6))
    const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.15)
    topGrad.addColorStop(0, `rgba(255,0,0,${alpha})`)
    topGrad.addColorStop(1, 'rgba(255,0,0,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, w, h * 0.15)

    const rightGrad = ctx.createLinearGradient(w, 0, w * 0.85, 0)
    rightGrad.addColorStop(0, `rgba(255,0,0,${alpha})`)
    rightGrad.addColorStop(1, 'rgba(255,0,0,0)')
    ctx.fillStyle = rightGrad
    ctx.fillRect(w * 0.85, 0, w * 0.15, h)

    const botGrad = ctx.createLinearGradient(0, h, 0, h * 0.85)
    botGrad.addColorStop(0, `rgba(255,0,0,${alpha})`)
    botGrad.addColorStop(1, 'rgba(255,0,0,0)')
    ctx.fillStyle = botGrad
    ctx.fillRect(w * 0.3, h * 0.85, w * 0.7, h * 0.15)
  }

  // ===== 雷达 =====
  _drawRadar(ctx, w, h, engine) {
    const radarX = 12, radarY = h - 132
    const radarR = 55
    const cx = radarX + radarR + 4
    const cy = radarY + radarR + 4

    ctx.fillStyle = 'rgba(0,10,26,0.27)'
    ctx.beginPath()
    ctx.arc(cx, cy, radarR, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(0,255,255,0.13)'
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.arc(cx, cy, radarR * 0.33, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, radarR * 0.66, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(0,255,255,0.27)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, cy, radarR, 0, Math.PI * 2); ctx.stroke()

    ctx.strokeStyle = 'rgba(0,255,255,0.13)'
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(cx, cy - radarR); ctx.lineTo(cx, cy + radarR); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - radarR, cy); ctx.lineTo(cx + radarR, cy); ctx.stroke()

    ctx.fillStyle = 'rgba(0,255,255,0.13)'
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radarR, -Math.PI / 2 - Math.PI / 5.14, -Math.PI / 2 + Math.PI / 5.14)
    ctx.closePath()
    ctx.fill()

    const RADAR_RANGE = 80
    // 飞机（红色）
    ctx.fillStyle = '#FF0044'
    for (const p of engine.planes) {
      if (p.isDead || p.position.distance > RADAR_RANGE) continue
      const relAz = ARPosition.wrapAngle(p.position.azimuth - engine.cameraYaw)
      const radarAngle = relAz * Math.PI / 180 - Math.PI / 2
      const r = (p.position.distance / RADAR_RANGE) * radarR
      ctx.beginPath()
      ctx.arc(cx + Math.cos(radarAngle) * r, cy + Math.sin(radarAngle) * r, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // 舰船（橙色）
    ctx.fillStyle = '#FFAA00'
    for (const s of engine.ships) {
      if (s.isDead || s.position.distance > RADAR_RANGE) continue
      const relAz = ARPosition.wrapAngle(s.position.azimuth - engine.cameraYaw)
      const radarAngle = relAz * Math.PI / 180 - Math.PI / 2
      const r = (s.position.distance / RADAR_RANGE) * radarR
      ctx.beginPath()
      ctx.arc(cx + Math.cos(radarAngle) * r, cy + Math.sin(radarAngle) * r, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // 来袭弹药（闪烁黄色）
    ctx.fillStyle = '#FFFF00'
    for (const pr of engine.projectiles) {
      if (pr.isDead || pr.position.distance > RADAR_RANGE) continue
      const relAz = ARPosition.wrapAngle(pr.position.azimuth - engine.cameraYaw)
      const radarAngle = relAz * Math.PI / 180 - Math.PI / 2
      const r = (pr.position.distance / RADAR_RANGE) * radarR
      ctx.beginPath()
      ctx.arc(cx + Math.cos(radarAngle) * r, cy + Math.sin(radarAngle) * r, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 玩家
    ctx.fillStyle = '#00FFFF'
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // ===== 辅助方法 =====
  _drawEntityHealthBar(ctx, x, y, scale, percent) {
    const barW = scale * 0.8, barH = 5
    const barY = y - scale * 0.7
    const color = percent > 0.5 ? '#00FF88' : percent > 0.25 ? '#FFAA00' : '#FF0044'

    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(x - barW / 2, barY, barW, barH)
    ctx.fillStyle = color
    ctx.fillRect(x - barW / 2, barY, barW * Math.max(0, percent), barH)
  }

  _drawDistanceLabel(ctx, x, y, scale, distance) {
    const fontSize = Math.max(8, Math.min(14, scale * 0.15))
    ctx.fillStyle = 'rgba(0,255,255,0.73)'
    ctx.font = `${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round(distance)}米`, x, y + scale * 0.5 + fontSize)
  }

  _drawHitFlash(ctx, x, y, scale) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    ctx.arc(x, y, scale * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  _hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  // ===== 拾取道具提示 =====
  _drawPickupMessages(ctx, w, h, engine) {
    const msgs = engine.pickupMessages
    if (!msgs || msgs.length === 0) return

    const cx = w / 2
    const baseY = h * 0.62

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      const alpha = Math.min(1.0, msg.timer / 0.5)
      // 从下往上堆叠，新消息在下面
      const offsetY = (msgs.length - 1 - i) * 28
      const y = baseY - offsetY
      // 轻微上浮动画
      const floatY = y - (2.0 - msg.timer) * 8

      // 背景条
      const textW = ctx.measureText ? 160 : 160
      this._roundRect(ctx, cx - textW / 2 - 8, floatY - 13, textW + 16, 26, 6)
      ctx.fillStyle = 'rgba(0,0,0,' + (alpha * 0.7) + ')'
      ctx.fill()

      // 彩色边框
      ctx.strokeStyle = this._hexAlpha(msg.color, alpha * 0.6)
      ctx.lineWidth = 1.5
      this._roundRect(ctx, cx - textW / 2 - 8, floatY - 13, textW + 16, 26, 6)
      ctx.stroke()

      // 文字
      ctx.font = 'bold 14px -apple-system, PingFang SC, sans-serif'
      ctx.shadowColor = msg.color
      ctx.shadowBlur = 8
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')'
      ctx.fillText(msg.text, cx, floatY)
      ctx.shadowBlur = 0
    }

    ctx.restore()
  }

  // ===== DANGER / WAVE CLEAR 大字提示 =====
  _drawWaveAlerts(ctx, w, h, engine) {
    // DANGER 红字
    if (engine.dangerTimer > 0) {
      const alpha = Math.min(1, engine.dangerTimer / 0.5)
      const pulse = 1.0 + 0.08 * Math.sin(Date.now() * 0.012)
      const fontSize = Math.floor(48 * pulse)

      ctx.save()
      // 红色半透明遮罩
      ctx.fillStyle = 'rgba(80,0,0,' + (alpha * 0.25) + ')'
      ctx.fillRect(0, 0, w, h)

      // 闪烁边框
      ctx.strokeStyle = 'rgba(255,0,0,' + (alpha * (0.5 + 0.3 * Math.sin(Date.now() * 0.01))) + ')'
      ctx.lineWidth = 3
      ctx.strokeRect(4, 4, w - 8, h - 8)

      // DANGER 文字
      ctx.textAlign = 'center'
      ctx.font = 'bold ' + fontSize + 'px monospace'
      ctx.shadowColor = '#FF0000'
      ctx.shadowBlur = 30
      ctx.fillStyle = 'rgba(255,30,30,' + alpha + ')'
      ctx.fillText('⚠ 危险 ⚠', w / 2, h * 0.42)

      // 副标题
      ctx.font = 'bold 16px monospace'
      ctx.shadowBlur = 10
      ctx.fillStyle = 'rgba(255,200,200,' + (alpha * 0.8) + ')'
      ctx.fillText('精锐编队来袭', w / 2, h * 0.55)
      ctx.restore()
    }

    // WAVE CLEAR 黄字
    if (engine.waveClearTimer > 0) {
      const alpha = Math.min(1, engine.waveClearTimer / 0.5)
      const bounce = 1.0 + 0.05 * Math.sin(Date.now() * 0.008)
      const fontSize = Math.floor(44 * bounce)

      ctx.save()
      ctx.textAlign = 'center'
      ctx.font = 'bold ' + fontSize + 'px monospace'
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur = 25
      ctx.fillStyle = 'rgba(255,215,0,' + alpha + ')'
      ctx.fillText('第 ' + (engine.spawner.waveNumber - 1) + ' 波 已清除！', w / 2, h * 0.38)

      ctx.font = 'bold 18px monospace'
      ctx.shadowBlur = 12
      ctx.fillStyle = 'rgba(255,255,200,' + (alpha * 0.85) + ')'
      ctx.fillText('第 ' + engine.spawner.waveNumber + ' 波来袭', w / 2, h * 0.52)
      ctx.restore()
    }
  }

  _createSeededRng(seed) {
    let s = seed
    return function () {
      s = (s * 16807 + 0) % 2147483647
      return (s - 1) / 2147483646
    }
  }
}

module.exports = { GameRenderer }
