// game.js — Pearl Harbor Defense (抖音小游戏版)
// 入口文件，初始化 Canvas 并启动游戏

console.log('[pearlharbor] 抖音小游戏启动...')

var GameEngine, GameState, GameRenderer, SoundManager
try {
  var engineMod = require('./game/engine')
  GameEngine = engineMod.GameEngine
  GameState = engineMod.GameState
  console.log('[pearlharbor] engine 加载成功')
} catch (e) { console.error('[pearlharbor] engine 加载失败:', e) }

try {
  var rendererMod = require('./game/renderer')
  GameRenderer = rendererMod.GameRenderer
  console.log('[pearlharbor] renderer 加载成功')
} catch (e) { console.error('[pearlharbor] renderer 加载失败:', e) }

try {
  var soundMod = require('./game/sound')
  SoundManager = soundMod.SoundManager
  console.log('[pearlharbor] sound 加载成功')
} catch (e) { console.error('[pearlharbor] sound 加载失败:', e) }

// ========== 平台 API ==========
var _api = tt

// ========== 侧边栏复访能力 ==========
var sidebarSupported = false
var lastShowOptions = null

function _onAppShow(options) {
  lastShowOptions = options || {}
  // 通过首页侧边栏返回时，scene=021036，launch_from=homepage，location=sidebar_card
  var o = lastShowOptions
  if (o && (o.scene === '021036' || (o.launch_from === 'homepage' && o.location === 'sidebar_card'))) {
    console.log('[pearlharbor] 从侧边栏返回', o)
  }
}

try {
  _api.onShow(_onAppShow)
  console.log('[pearlharbor] onShow 监听已注册')
} catch (e) {
  console.warn('[pearlharbor] onShow 监听失败:', e)
}

try {
  _api.checkScene && _api.checkScene({
    scene: 'sidebar',
    success: function(res) {
      sidebarSupported = !!(res && res.isExist)
      console.log('[pearlharbor] checkScene sidebar:', sidebarSupported)
    },
    fail: function(err) {
      console.warn('[pearlharbor] checkScene 失败:', err)
    }
  })
} catch (e) {
  console.warn('[pearlharbor] checkScene 调用失败:', e)
}

function doOpenSidebar() {
  console.log('[pearlharbor] 调用 tt.navigateToScene({ scene: "sidebar" })')
  try {
    _api.navigateToScene && _api.navigateToScene({
      scene: 'sidebar',
      success: function(res) { console.log('[pearlharbor] navigateToScene success', res) },
      fail: function(err) { console.warn('[pearlharbor] navigateToScene fail', err) },
      complete: function() { console.log('[pearlharbor] navigateToScene complete') }
    })
  } catch (e) {
    console.warn('[pearlharbor] navigateToScene 调用异常:', e)
  }
}

// ========== 初始化 Canvas ==========
var sysInfo = _api.getSystemInfoSync()
var dpr = sysInfo.pixelRatio || 2
var W = sysInfo.windowWidth || sysInfo.screenWidth || 800
var H = sysInfo.windowHeight || sysInfo.screenHeight || 600
console.log('[pearlharbor] 屏幕:', W, 'x', H, 'dpr:', dpr)

var canvas = tt.createCanvas()
canvas.width = W * dpr
canvas.height = H * dpr
var ctx = canvas.getContext('2d')
ctx.scale(dpr, dpr)

// requestAnimationFrame
var _raf = (canvas.requestAnimationFrame)
  ? canvas.requestAnimationFrame.bind(canvas)
  : (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : function (fn) { setTimeout(fn, 16) })

// ========== 全局对象 ==========
var soundManager = new SoundManager()
soundManager.init()
var bgmStarted = false

var gameRenderer = new GameRenderer()
gameRenderer.loadImages(canvas)
console.log('[pearlharbor] 渲染器和音效初始化完成')

// 首页背景图
var titleImg = null
try {
  titleImg = tt.createImage()
  titleImg._loaded = false
  titleImg.onload = function() { titleImg._loaded = true }
  titleImg.onerror = function(e) { console.warn('[pearlharbor] title image load failed:', e) }
  titleImg.src = 'images/title.jpg'
} catch (e) {}

// 军火库图标：购买目录用 buy_ 前缀图，网格内部署用普通图
var buyIconImgs = {}
var deployIconImgs = {}
function loadIcon(targetMap, key, src) {
  try {
    var img = tt.createImage()
    img._loaded = false
    img.onload = function() { img._loaded = true }
    img.onerror = function() {}
    img.src = src
    targetMap[key] = img
  } catch (e) {}
}
function drawItemImage(c, img, x, y, w, h, padding) {
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
  c.drawImage(img, dx, dy, dw, dh)
  return true
}

loadIcon(buyIconImgs, 'barrel', 'images/buy_炮管.png')
loadIcon(buyIconImgs, 'crew', 'images/buy_组员.png')
loadIcon(buyIconImgs, 'torpedo_tube', 'images/buy_鱼雷.png')
loadIcon(buyIconImgs, 'shield', 'images/buy_护盾.png')
loadIcon(buyIconImgs, 'emp', 'images/buy_电磁波.png')
loadIcon(buyIconImgs, 'ammo_fire', 'images/buy_火弹.png')
loadIcon(buyIconImgs, 'ammo_ice', 'images/buy_冰弹.png')
loadIcon(buyIconImgs, 'ammo_electric', 'images/buy_闪电.png')
loadIcon(buyIconImgs, 'ammo_armor_pierce', 'images/buy_穿甲弹.png')

loadIcon(deployIconImgs, 'barrel', 'images/枪管.png')
loadIcon(deployIconImgs, 'crew', 'images/组员.png')
loadIcon(deployIconImgs, 'torpedo_tube', 'images/鱼雷.png')
loadIcon(deployIconImgs, 'shield', 'images/护盾.png')
loadIcon(deployIconImgs, 'emp', 'images/电磁波.png')
loadIcon(deployIconImgs, 'ammo_fire', 'images/火弹.png')
loadIcon(deployIconImgs, 'ammo_ice', 'images/冰弹.png')
loadIcon(deployIconImgs, 'ammo_electric', 'images/闪电弹.png')
loadIcon(deployIconImgs, 'ammo_armor_pierce', 'images/穿甲弹.png')

var engine = null
var highScore = 0
try { highScore = _api.getStorageSync('highScore') || 0 } catch (e) {}

// ========== 场景管理 ==========
var scene = 'start'
var uiButtons = []
var gameOverSaved = false
var lastTouchX = 0, lastTouchY = 0
var touchOnButton = false

function hitTest(px, py) {
  for (var i = 0; i < uiButtons.length; i++) {
    var btn = uiButtons[i]
    if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
      return btn
    }
  }
  return null
}

// ========== 场景操作 ==========
function doStartGame() {
  if (!bgmStarted) {
    bgmStarted = true
    soundManager.playBGMIntro()
  }
  if (engine) engine.dispose()
  engine = new GameEngine({ soundManager: soundManager })
  engine.initSound()
  engine.startGame()
  scene = 'playing'
  uiButtons = []
  gameOverSaved = false
}

function doPause() {
  if (engine) engine.pauseGame()
  scene = 'paused'
}

function doResume() {
  if (engine) engine.resumeGame()
  scene = 'playing'
  uiButtons = []
}

function doRestart() {
  doStartGame()
}

function doBackToStart() {
  if (engine) { engine.dispose(); engine = null }
  try { soundManager.playBGMIntro() } catch (e) {}
  scene = 'start'
  uiButtons = []
  gameOverSaved = false
}

// ========== 军火库（背包装备）系统 ==========
var invMod = require('./game/inventory') || {}
var GRID_COLS = invMod.GRID_COLS || 5
var GRID_ROWS = invMod.GRID_ROWS || 5
var GRID_ITEM_LIST = invMod.GRID_ITEM_LIST || []
var GRID_ITEM_DEFS = invMod.GRID_ITEM_DEFS || {}
var CELL_UNLOCK_COST = invMod.CELL_UNLOCK_COST || 30
var GridItemType = invMod.GridItemType || {}
var getUpgradeTier = invMod.getUpgradeTier
var getMultiplier = invMod.getMultiplier

// 商店状态
var shopOfferings = []        // 当前 3 个可购买选项
var shopMessage = ''          // 提示消息
var shopMessageTimer = 0
// 拖拽放置状态
var dragDef = null            // 正在拖拽放置的物品定义
var dragX = 0, dragY = 0      // 当前拖拽坐标
var isDragging = false
var dragGridInfo = null       // {gridX, gridY, CELL, sellZoneY} 缓存布局
// 移动装备拖拽状态
var moveDragItem = null       // 正在移动的已放置物品
var moveDragOrigin = null     // {col, row} 原始位置

function generateShopOfferings() {
  // 池子先排除炮管，随后固定把炮管放在第一个槽位
  var barrelDef = GRID_ITEM_DEFS[GridItemType.BARREL]
  var pool = GRID_ITEM_LIST.filter(function(d) { return d !== barrelDef })
  shopOfferings = [barrelDef]
  for (var n = 0; n < 2 && pool.length > 0; n++) {
    var idx = Math.floor(Math.random() * pool.length)
    shopOfferings.push(pool[idx])
    pool.splice(idx, 1)
  }
}

function doShopRefresh() {
  if (!engine) return
  if (engine.coins < 10) {
    shopMessage = '刷新需要10金币！'
    shopMessageTimer = 1.5
    return
  }
  engine.coins -= 10
  generateShopOfferings()
  shopMessage = '商店已刷新！'
  shopMessageTimer = 1.5
}

function doShopBuyItem(def) {
  if (!engine) return
  if (isDragging) {
    shopMessage = moveDragItem
      ? '请先完成当前装备的移动。'
      : '请先将当前装备放置到网格上。'
    shopMessageTimer = 2.0
    return
  }
  if (engine.coins < def.cost) {
    shopMessage = '金币不足！'
    shopMessageTimer = 1.5
    return
  }
  var existing = engine.inventory.findItemByType(def.id)
  if (existing && existing.count >= 64) {
    // 已满级：允许再买一个作为新的部署位
    var slot = engine.inventory.findFirstSlot(def)
    if (!slot) {
      shopMessage = '没有可用格位！请先解锁、移动或出售装备。'
      shopMessageTimer = 2.2
      return
    }
    engine.coins -= def.cost
    soundManager.playCoin()
    isDragging = true
    dragDef = def
    shopMessage = def.name + ' 已满级！放置新的一个吧！'
    shopMessageTimer = 3.0
    return
  }
  if (existing) {
    // 升级已有装备
    if (existing.count >= 64) {
      shopMessage = def.name + ' 已达最高等级！'
      shopMessageTimer = 1.5
      return
    }
    engine.inventory.upgradeItem(existing.uid)
    engine.coins -= def.cost
    soundManager.playCoin()
    var tier = getUpgradeTier(existing.count)
    shopMessage = def.name + ' 升级成功！' + tier.label
    shopMessageTimer = 2.0
    for (var si = 0; si < shopOfferings.length; si++) {
      if (shopOfferings[si] && shopOfferings[si].id === def.id) {
        shopOfferings[si] = null
        break
      }
    }
  } else {
    // 新装备：拖拽放置
    var slot2 = engine.inventory.findFirstSlot(def)
    if (!slot2) {
      shopMessage = '没有可用格位！请先解锁、移动或出售装备。'
      shopMessageTimer = 2.2
      return
    }
    engine.coins -= def.cost
    soundManager.playCoin()
    isDragging = true
    dragDef = def
    shopMessage = '拖动到网格上放置！'
    shopMessageTimer = 3.0
  }
}

function finishDragPlace(px, py) {
  if (moveDragItem) {
    finishMoveDrag(px, py)
    return
  }
  if (!isDragging || !dragDef || !engine || !dragGridInfo) {
    cancelDrag()
    return
  }
  var gi = dragGridInfo
  // 计算拖拽松手位置对应的网格单元格
  var itemHalfH = dragDef.h * gi.CELL / 2
  var adjustedPy = py - itemHalfH + gi.CELL / 2
  var col = Math.floor((px - gi.gridX) / gi.CELL)
  var row = Math.floor((adjustedPy - gi.gridY) / gi.CELL)
  if (col < 0) col = 0
  if (row < 0) row = 0
  if (col >= GRID_COLS) col = GRID_COLS - 1
  if (row >= GRID_ROWS) row = GRID_ROWS - 1
  var bestSlot = engine.inventory.findBestSlotAt(dragDef, col, row)
  if (bestSlot) {
    engine.inventory.place(dragDef, bestSlot.col, bestSlot.row)
    shopMessage = dragDef.name + ' 已放置！'
    shopMessageTimer = 1.5
    for (var si = 0; si < shopOfferings.length; si++) {
      if (shopOfferings[si] && shopOfferings[si].id === dragDef.id) {
        shopOfferings[si] = null
        break
      }
    }
    isDragging = false
    dragDef = null
  } else {
    shopMessage = '位置无效，请重试！'
    shopMessageTimer = 1.5
    // 不取消拖拽，让用户继续尝试
  }
}

function cancelDrag() {
  if (moveDragItem) {
    cancelMoveDrag()
    return
  }
  if (isDragging && dragDef && engine) {
    engine.coins += dragDef.cost
    shopMessage = '已取消，金币已退还。'
    shopMessageTimer = 1.5
  }
  isDragging = false
  dragDef = null
}

function doShopUnlockCell(col, row) {
  if (!engine) return
  if (engine.inventory.isAllUnlocked()) {
    shopMessage = '所有格位已解锁！'
    shopMessageTimer = 1.5
    return
  }
  if (engine.coins < CELL_UNLOCK_COST) {
    shopMessage = '需要 ' + CELL_UNLOCK_COST + ' 金币！'
    shopMessageTimer = 1.5
    return
  }
  engine.coins -= CELL_UNLOCK_COST
  engine.inventory.unlockCell(col, row)
  soundManager.playCoin()
  shopMessage = '格位已解锁！'
  shopMessageTimer = 1.5
}

function startMoveItem(col, row, px, py) {
  if (!engine || isDragging) return
  var item = engine.inventory.getItemAt(col, row)
  if (!item) return
  moveDragItem = { def: item.def, uid: item.uid, count: item.count }
  moveDragOrigin = { col: item.col, row: item.row }
  engine.inventory.removeByUid(item.uid)
  isDragging = true
  dragDef = item.def
  dragX = px
  dragY = py
  shopMessage = '拖动以移动装备，拖到出售区可出售。'
  shopMessageTimer = 2.0
}

function finishMoveDrag(px, py) {
  if (!moveDragItem || !engine || !dragGridInfo) { cancelMoveDrag(); return }
  var gi = dragGridInfo
  var sellZoneY = gi.sellZoneY || 9999
  if (py >= sellZoneY) {
    var refund = Math.floor(moveDragItem.def.cost * 0.5)
    engine.coins += refund
    soundManager.playCoin()
    shopMessage = '已出售 ' + moveDragItem.def.name + ' +' + refund + ' 金币'
    shopMessageTimer = 2.0
    isDragging = false
    dragDef = null
    moveDragItem = null
    moveDragOrigin = null
    return
  }
  var itemHalfH = moveDragItem.def.h * gi.CELL / 2
  var adjustedPy = py - itemHalfH + gi.CELL / 2
  var col = Math.floor((px - gi.gridX) / gi.CELL)
  var row = Math.floor((adjustedPy - gi.gridY) / gi.CELL)
  if (col < 0) col = 0
  if (row < 0) row = 0
  if (col >= GRID_COLS) col = GRID_COLS - 1
  if (row >= GRID_ROWS) row = GRID_ROWS - 1
  var bestSlot = engine.inventory.findBestSlotAt(moveDragItem.def, col, row)
  if (bestSlot) {
    var placed = engine.inventory.place(moveDragItem.def, bestSlot.col, bestSlot.row)
    if (placed) {
      placed.count = moveDragItem.count
      placed.uid = moveDragItem.uid
      shopMessage = moveDragItem.def.name + ' 已移动！'
      shopMessageTimer = 1.0
    }
  } else {
    var placedBack = engine.inventory.place(moveDragItem.def, moveDragOrigin.col, moveDragOrigin.row)
    if (placedBack) {
      placedBack.count = moveDragItem.count
      placedBack.uid = moveDragItem.uid
    }
    shopMessage = '已放回原位置'
    shopMessageTimer = 1.0
  }
  isDragging = false
  dragDef = null
  moveDragItem = null
  moveDragOrigin = null
}

function cancelMoveDrag() {
  if (moveDragItem && engine) {
    var placed = engine.inventory.place(moveDragItem.def, moveDragOrigin.col, moveDragOrigin.row)
    if (placed) {
      placed.count = moveDragItem.count
      placed.uid = moveDragItem.uid
    }
  }
  isDragging = false
  dragDef = null
  moveDragItem = null
  moveDragOrigin = null
}

function doContinueFromShop() {
  if (!engine) return
  engine.shopReady = false
  scene = 'playing'
  uiButtons = []
}

// ========== UI 绘制工具 ==========
function roundRect(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.lineTo(x + w - r, y)
  c.arcTo(x + w, y, x + w, y + r, r)
  c.lineTo(x + w, y + h - r)
  c.arcTo(x + w, y + h, x + w - r, y + h, r)
  c.lineTo(x + r, y + h)
  c.arcTo(x, y + h, x, y + h - r, r)
  c.lineTo(x, y + r)
  c.arcTo(x, y, x + r, y, r)
  c.closePath()
}

function drawBtn(c, x, y, w, h, text, color, bgColor) {
  roundRect(c, x, y, w, h, 6)
  c.fillStyle = bgColor
  c.fill()
  c.strokeStyle = color
  c.lineWidth = 1.5
  c.stroke()
  c.fillStyle = color
  c.font = 'bold 15px -apple-system, PingFang SC, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(text, x + w / 2, y + h / 2)
}

// ========== 开始界面 ==========
function drawStartScreen(c, w, h) {
  if (titleImg && titleImg._loaded) {
    var imgW = titleImg.width || 1024
    var imgH = titleImg.height || 512
    var scale = Math.max(w / imgW, h / imgH)
    var dw = imgW * scale
    var dh = imgH * scale
    c.drawImage(titleImg, (w - dw) / 2, (h - dh) / 2, dw, dh)
  } else {
    var horizonY = h * 0.55
    var skyGrad = c.createLinearGradient(0, 0, 0, horizonY)
    skyGrad.addColorStop(0, '#0a1a3c')
    skyGrad.addColorStop(0.4, '#1a3a6a')
    skyGrad.addColorStop(1.0, '#3a6a9a')
    c.fillStyle = skyGrad
    c.fillRect(0, 0, w, horizonY)
    var seaGrad = c.createLinearGradient(0, horizonY, 0, h)
    seaGrad.addColorStop(0, '#1a3a5a')
    seaGrad.addColorStop(1.0, '#0a1020')
    c.fillStyle = seaGrad
    c.fillRect(0, horizonY, w, h - horizonY)
  }

  var oGrad = c.createLinearGradient(0, 0, 0, h)
  oGrad.addColorStop(0, 'rgba(0,0,0,0.5)')
  oGrad.addColorStop(0.35, 'rgba(0,0,0,0.15)')
  oGrad.addColorStop(0.65, 'rgba(0,0,0,0.15)')
  oGrad.addColorStop(1, 'rgba(0,0,0,0.7)')
  c.fillStyle = oGrad
  c.fillRect(0, 0, w, h)

  var cx = w / 2, cy = h / 2

  // 左侧健康游戏忠告
  c.save()
  c.fillStyle = 'rgba(255,255,255,0.45)'
  c.font = '9px -apple-system, PingFang SC, sans-serif'
  c.textAlign = 'left'
  c.textBaseline = 'top'
  var advisoryX = 34
  var advisoryY = cy - 50
  var lineH = 22
  c.fillStyle = 'rgba(255,220,100,0.7)'
  c.font = 'bold 20px -apple-system, PingFang SC, sans-serif'
  c.fillText('健康游戏忠告', advisoryX, advisoryY)
  c.fillStyle = 'rgba(255,255,255,0.45)'
  c.font = '18px -apple-system, PingFang SC, sans-serif'
  c.fillText('抵制不良游戏，拒绝盗版游戏。', advisoryX, advisoryY + lineH)
  c.fillText('注意自我保护，谨防受骗上当。', advisoryX, advisoryY + lineH * 2)
  c.fillText('适度游戏益脑，沉迷游戏伤身。', advisoryX, advisoryY + lineH * 3)
  c.fillText('合理安排时间，享受健康生活。', advisoryX, advisoryY + lineH * 4)
  c.restore()

  // 右侧面板和按钮
  var rightCx = w * 0.62

  var panelW = Math.min(300, w * 0.52)
  var panelH = 178
  var panelX = rightCx - panelW / 2
  var panelY = cy - 104
  roundRect(c, panelX, panelY, panelW, panelH, 12)
  c.fillStyle = 'rgba(5,12,24,0.42)'
  c.fill()
  c.strokeStyle = 'rgba(255,220,120,0.35)'
  c.lineWidth = 1.2
  c.stroke()

  c.save()
  c.fillStyle = '#FF4400'
  c.font = 'bold 36px -apple-system, PingFang SC, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.shadowColor = 'rgba(0,0,0,0.8)'
  c.shadowBlur = 12
  c.fillText('珍珠港', rightCx, cy - 58)
  c.restore()

  c.save()
  c.fillStyle = '#FFCC00'
  c.font = 'bold 18px -apple-system, PingFang SC, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.shadowColor = 'rgba(0,0,0,0.6)'
  c.shadowBlur = 8
  c.fillText('保  卫  战', rightCx, cy - 28)
  c.restore()

  if (highScore > 0) {
    c.fillStyle = 'rgba(255,255,255,0.5)'
    c.font = '12px -apple-system, PingFang SC, sans-serif'
    c.textAlign = 'center'
    c.fillText('最高分: ' + highScore, rightCx, cy - 4)
  }

  var btnW = 200, btnH = 44
  var btnX = rightCx - btnW / 2, btnY = cy + 16
  drawBtn(c, btnX, btnY, btnW, btnH, '进入战斗', '#FFB347', 'rgba(255,120,20,0.22)')

  // 侧边栏复访入口（平台必接能力）
  var sbW = 100, sbH = 32
  var sbX = w - sbW - 12, sbY = 12
  drawBtn(c, sbX, sbY, sbW, sbH, '去侧边栏', '#00FFCC', 'rgba(0,255,200,0.15)')

  uiButtons = [
    { x: sbX, y: sbY, w: sbW, h: sbH, action: doOpenSidebar },
    { x: btnX, y: btnY, w: btnW, h: btnH, action: doStartGame }
  ]

  c.fillStyle = 'rgba(200,220,255,0.5)'
  c.font = '10px -apple-system, PingFang SC, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('倾斜手机瞄准 | 自动开火 | 拾取道具', rightCx, cy + 86)
}

// ========== 暂停覆盖层 ==========
function drawPauseOverlay(c, w, h) {
  c.fillStyle = 'rgba(0,0,0,0.7)'
  c.fillRect(0, 0, w, h)
  var cx = w / 2, cy = h / 2
  c.fillStyle = '#00FFFF'
  c.font = 'bold 28px -apple-system, PingFang SC, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('暂停', cx, cy - 50)
  var btnW = 180, btnH = 40, btnX = cx - btnW / 2
  var resumeY = cy - 10
  drawBtn(c, btnX, resumeY, btnW, btnH, '继续战斗', '#00FFFF', 'rgba(0,255,255,0.1)')
  var quitY = cy + 42
  drawBtn(c, btnX, quitY, btnW, btnH, '退出', '#FF4444', 'rgba(255,68,68,0.1)')
  uiButtons = [
    { x: btnX, y: resumeY, w: btnW, h: btnH, action: doResume },
    { x: btnX, y: quitY, w: btnW, h: btnH, action: doBackToStart }
  ]
}

// ========== 游戏结束覆盖层 ==========
function drawGameOverOverlay(c, w, h) {
  c.fillStyle = 'rgba(0,0,0,0.85)'
  c.fillRect(0, 0, w, h)
  var cx = w / 2, cy = h / 2
  var score = engine ? engine.score : 0
  var kills = engine ? engine.kills : 0
  var wave = engine ? engine.spawner.waveNumber : 1

  if (!gameOverSaved) {
    gameOverSaved = true
    if (score > highScore) {
      highScore = score
      try { _api.setStorageSync('highScore', highScore) } catch (e) {}
    }
  }

  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = '#FF6600'
  c.font = 'bold 24px -apple-system, PingFang SC, sans-serif'
  c.fillText('战败', cx, cy - 70)
  c.fillStyle = '#FFFFFF'
  c.font = 'bold 48px -apple-system, PingFang SC, sans-serif'
  c.fillText(String(score), cx, cy - 28)
  c.fillStyle = 'rgba(255,255,255,0.5)'
  c.font = '12px -apple-system, PingFang SC, sans-serif'
  c.fillText('得分', cx, cy + 2)
  c.fillStyle = '#FFFFFF'
  c.font = '14px -apple-system, PingFang SC, sans-serif'
  c.fillText('击杀 ' + kills + '     波次 ' + wave, cx, cy + 30)

  var btnW = 180, btnH = 40, btnX = cx - btnW / 2
  var restartY = cy + 56
  drawBtn(c, btnX, restartY, btnW, btnH, '重新挑战', '#00FFFF', 'rgba(0,255,255,0.1)')
  var backY = cy + 106
  drawBtn(c, btnX, backY, btnW, btnH, '返回', '#888888', 'rgba(136,136,136,0.1)')
  uiButtons = [
    { x: btnX, y: restartY, w: btnW, h: btnH, action: doRestart },
    { x: btnX, y: backY, w: btnW, h: btnH, action: doBackToStart }
  ]
}

// ========== 军火库覆盖层（背包装备网格 + 购买目录） ==========
function drawShopOverlay(c, w, h) {
  c.fillStyle = 'rgba(0,0,10,0.92)'
  c.fillRect(0, 0, w, h)

  var coins = engine ? engine.coins : 0
  uiButtons = []

  // 布局参数：左侧图纸网格 + 按钮，右侧竖排购买面板
  var contentTop = 56
  var contentBottom = h - 12
  var contentH = contentBottom - contentTop

  var leftW = Math.floor(w * 0.46)
  var leftPad = 10
  var statLineH = 14
  var footerBtnH = 34
  var gridAreaW = leftW - leftPad * 2
  var gridAreaH = contentH - statLineH - footerBtnH - 12
  var CELL = Math.floor(Math.min(gridAreaW / GRID_COLS, gridAreaH / GRID_ROWS, 58))
  var gridW = GRID_COLS * CELL
  var gridH = GRID_ROWS * CELL
  var gridX = leftPad + Math.floor((gridAreaW - gridW) / 2)
  var gridY = contentTop + Math.floor((gridAreaH - gridH) / 2)

  var rightX = leftW + 10
  var rightW = w - rightX - 12

  // 保存网格信息供拖拽使用
  var sellZoneY = h - 52
  dragGridInfo = { gridX: gridX, gridY: gridY, CELL: CELL, sellZoneY: sellZoneY }

  // === 标题 ===
  c.save()
  c.textAlign = 'left'
  c.textBaseline = 'middle'
  c.fillStyle = '#FFD700'
  c.font = 'bold 18px -apple-system, PingFang SC, sans-serif'
  c.shadowColor = '#FFD700'
  c.shadowBlur = 12
  c.fillText('军火库', 16, 22)
  c.restore()

  c.fillStyle = '#FFD700'
  c.font = 'bold 14px monospace'
  c.textAlign = 'right'
  c.textBaseline = 'middle'
  c.fillText('金币: ' + coins, w - 16, 22)

  // === 图纸网格 ===
  roundRect(c, gridX - 4, gridY - 4, gridW + 8, gridH + 8, 6)
  c.fillStyle = 'rgba(20,30,60,0.6)'
  c.fill()
  c.strokeStyle = 'rgba(100,150,255,0.3)'
  c.lineWidth = 1
  c.stroke()

  // 获取可解锁格子列表（用于显示+按钮）
  var unlockableCells = engine ? engine.inventory.getUnlockableCells() : []
  var unlockableSet = {}
  for (var ui = 0; ui < unlockableCells.length; ui++) {
    unlockableSet[unlockableCells[ui].row + ',' + unlockableCells[ui].col] = true
  }

  for (var gr = 0; gr < GRID_ROWS; gr++) {
    for (var gc = 0; gc < GRID_COLS; gc++) {
      var cx1 = gridX + gc * CELL
      var cy1 = gridY + gr * CELL
      var isUnlocked = engine ? engine.inventory.isCellUnlocked(gc, gr) : false

      if (!isUnlocked) {
        // 锁定格子
        var isUnlockable = unlockableSet[gr + ',' + gc]
        roundRect(c, cx1 + 1, cy1 + 1, CELL - 2, CELL - 2, 3)
        c.fillStyle = isUnlockable ? 'rgba(40,60,100,0.4)' : 'rgba(15,15,25,0.5)'
        c.fill()
        c.strokeStyle = isUnlockable ? 'rgba(80,120,200,0.5)' : 'rgba(40,40,60,0.3)'
        c.lineWidth = 0.5
        c.setLineDash([3, 3])
        roundRect(c, cx1 + 1, cy1 + 1, CELL - 2, CELL - 2, 3)
        c.stroke()
        c.setLineDash([])

        if (isUnlockable) {
          // 可解锁：显示 + 按钮和价格
          var canAfford = coins >= CELL_UNLOCK_COST
          c.fillStyle = canAfford ? 'rgba(100,200,255,0.8)' : 'rgba(80,80,120,0.5)'
          c.font = 'bold ' + Math.floor(CELL * 0.35) + 'px sans-serif'
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          c.fillText('+', cx1 + CELL / 2, cy1 + CELL / 2 - 4)
          c.fillStyle = canAfford ? 'rgba(100,200,255,0.6)' : 'rgba(80,80,120,0.4)'
          c.font = '7px sans-serif'
          c.fillText(CELL_UNLOCK_COST + '金', cx1 + CELL / 2, cy1 + CELL / 2 + 10)
          ;(function(col, row) {
            uiButtons.push({
              x: cx1, y: cy1, w: CELL, h: CELL,
              action: function() { doShopUnlockCell(col, row) }
            })
          })(gc, gr)
        }
      } else {
        // 已解锁格子
        var cellItem = engine ? engine.inventory.getItemAt(gc, gr) : null

        if (cellItem) {
          if (cellItem.col === gc && cellItem.row === gr) {
            var bw = cellItem.def.w * CELL
            var bh = cellItem.def.h * CELL
            roundRect(c, cx1 + 2, cy1 + 2, bw - 4, bh - 4, 4)
            c.fillStyle = cellItem.def.color + '33'
            c.fill()
            c.strokeStyle = cellItem.def.color
            c.lineWidth = 1.5
            c.stroke()
            // 图标
            var placedImg = deployIconImgs[cellItem.def.id]
            if (placedImg && placedImg._loaded) {
              c.save()
              roundRect(c, cx1 + 3, cy1 + 3, bw - 6, bh - 6, 3)
              c.clip()
              drawItemImage(c, placedImg, cx1 + 3, cy1 + 3, bw - 6, bh - 10, 2)
              c.restore()
            } else {
              c.fillStyle = cellItem.def.color
              c.font = 'bold ' + Math.floor(CELL * 0.35) + 'px monospace'
              c.textAlign = 'center'
              c.textBaseline = 'middle'
              c.fillText(cellItem.def.icon, cx1 + bw / 2, cy1 + bh / 2 - 6)
            }
            // 名称
            c.fillStyle = '#FFFFFF'
            c.font = '7px -apple-system, sans-serif'
            c.fillText(cellItem.def.name, cx1 + bw / 2, cy1 + bh / 2 + CELL * 0.18)
            // 星标角标
            var itemTier = getUpgradeTier(cellItem.count)
            if (itemTier.stars > 0) {
              var starColor = itemTier.starType === 'gold' ? '#FFD700' : '#C0C0C0'
              c.fillStyle = starColor
              c.font = 'bold 9px sans-serif'
              c.textAlign = 'right'
              c.textBaseline = 'top'
              c.fillText(itemTier.label, cx1 + bw - 2, cy1 + 2)
            }
            // 倍数显示
            if (cellItem.count > 1) {
              c.fillStyle = '#88FF88'
              c.font = 'bold 7px monospace'
              c.textAlign = 'left'
              c.textBaseline = 'bottom'
              c.fillText('x' + cellItem.count, cx1 + 3, cy1 + bh - 2)
            }
            // 移动提示（拖拽手柄）
            c.fillStyle = 'rgba(255,255,255,0.25)'
            c.font = '7px sans-serif'
            c.textAlign = 'center'
            c.textBaseline = 'bottom'
            c.fillText('\u2725', cx1 + bw / 2, cy1 + bh - 1)
          }
        } else {
          roundRect(c, cx1 + 2, cy1 + 2, CELL - 4, CELL - 4, 3)
          c.fillStyle = 'rgba(40,50,80,0.3)'
          c.fill()
        }

        // 点击装备：开始拖拽移动
        ;(function(col, row, cellX, cellY) {
          uiButtons.push({
            x: cellX, y: cellY, w: CELL, h: CELL,
            action: function(px, py) {
              var it = engine ? engine.inventory.getItemAt(col, row) : null
              if (it) {
                startMoveItem(col, row, px || cellX + CELL / 2, py || cellY + CELL / 2)
              }
            }
          })
        })(gc, gr, cx1, cy1)
      }
    }
  }

  // 网格下方状态
  if (engine) {
    var effects = engine.inventory.getEffects()
    var statY = gridY + gridH + 4
    c.fillStyle = 'rgba(255,255,255,0.45)'
    c.font = '9px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'top'
    var statText = '射速 +' + effects.fireRateBonus.toFixed(1) +
      '  伤害 +' + effects.damageBonus +
      (effects.crewBonus > 0 ? '  组员 +' + Math.round(effects.crewBonus * 100) + '%' : '') +
      (effects.maxShieldHP > 0 ? '  护盾 ' + engine.inventory.shieldHP + '/' + effects.maxShieldHP : '') +
      (effects.torpedoCount > 0 ? '  鱼雷 x' + effects.torpedoCount : '')
    c.fillText(statText + '  生命: ' + engine.playerHealth + '/' + engine.maxPlayerHealth, leftW / 2, statY)
  }

  // === 商品目录（右侧竖排，3 个物品纵向排列）===
  var cardGap = 6
  var catalogTop = contentTop
  var cardsAreaH = contentH
  var cardW = rightW
  var cardH = Math.floor((cardsAreaH - cardGap * 2) / 3)
  for (var i = 0; i < shopOfferings.length; i++) {
    var def = shopOfferings[i]
    var cardX = rightX
    var cardY2 = catalogTop + i * (cardH + cardGap)
    if (!def) continue
    var canBuy = coins >= def.cost
    var existing = engine ? engine.inventory.findItemByType(def.id) : null
    var isOwned = !!existing
    var isMaxed = isOwned && existing.count >= 64

    // 卡片背景
    roundRect(c, cardX, cardY2, cardW, cardH, 6)
    c.fillStyle = isMaxed ? 'rgba(60,60,60,0.3)' : (canBuy ? 'rgba(255,215,0,0.08)' : 'rgba(30,30,50,0.4)')
    c.fill()
    c.strokeStyle = isMaxed ? 'rgba(80,80,80,0.4)' : (canBuy ? 'rgba(255,215,0,0.4)' : 'rgba(80,80,80,0.3)')
    c.lineWidth = 1
    roundRect(c, cardX, cardY2, cardW, cardH, 6)
    c.stroke()

    // 颜色条
    c.fillStyle = def.color
    c.fillRect(cardX + 3, cardY2 + 3, 3, cardH - 6)

    // 图标
    var iconBoxSize = Math.min(cardH - 10, 40)
    var iconBoxX = cardX + 10
    var iconBoxY = cardY2 + Math.floor((cardH - iconBoxSize) / 2)
    var iconImg = buyIconImgs[def.id]
    roundRect(c, iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 4)
    c.fillStyle = 'rgba(0,0,0,0.3)'
    c.fill()
    c.strokeStyle = def.color
    c.lineWidth = 1
    roundRect(c, iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 4)
    c.stroke()
    if (iconImg && iconImg._loaded) {
      c.save()
      roundRect(c, iconBoxX + 1, iconBoxY + 1, iconBoxSize - 2, iconBoxSize - 2, 3)
      c.clip()
      c.drawImage(iconImg, iconBoxX, iconBoxY, iconBoxSize, iconBoxSize)
      c.restore()
    } else {
      c.fillStyle = def.color
      c.font = 'bold ' + Math.floor(iconBoxSize * 0.4) + 'px monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(def.icon, iconBoxX + iconBoxSize / 2, iconBoxY + iconBoxSize / 2)
    }

    // 文字区域（图标右侧）
    var textX = iconBoxX + iconBoxSize + 8

    // 名称 + 尺寸
    c.fillStyle = canBuy && !isMaxed ? '#FFFFFF' : '#666666'
    c.font = 'bold 10px -apple-system, PingFang SC, sans-serif'
    c.textAlign = 'left'
    c.textBaseline = 'top'
    c.fillText(def.name + ' (' + def.w + '×' + def.h + ')', textX, cardY2 + 6)

    // 描述
    c.fillStyle = canBuy ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)'
    c.font = '8px -apple-system, sans-serif'
    c.fillText(def.desc, textX, cardY2 + 19)

    // 状态
    if (isOwned) {
      var ownTier = getUpgradeTier(existing.count)
      c.fillStyle = isMaxed ? '#FF4444' : (ownTier.starType === 'gold' ? '#FFD700' : '#C0C0C0')
      c.font = 'bold 8px sans-serif'
      c.fillText(isMaxed ? '满级' : '等级' + existing.count + ' ' + ownTier.label, textX, cardY2 + 31)
    }

    // 购买按钮（卡片右下角）
    var btnW3 = Math.min(90, cardX + cardW - textX - 6)
    var btnH3 = 18
    var btnX3 = cardX + cardW - btnW3 - 6
    var btnY3 = cardY2 + cardH - btnH3 - 5

    if (!isMaxed) {
      var btnTxt = def.cost + '金 ' + (isOwned ? '升级' : '购买')

      roundRect(c, btnX3, btnY3, btnW3, btnH3, 3)
      c.fillStyle = canBuy ? 'rgba(255,215,0,0.15)' : 'rgba(40,40,40,0.3)'
      c.fill()
      c.strokeStyle = canBuy ? '#FFD700' : '#444444'
      c.lineWidth = 1
      roundRect(c, btnX3, btnY3, btnW3, btnH3, 3)
      c.stroke()

      c.fillStyle = canBuy ? '#FFD700' : '#553300'
      c.font = 'bold 9px monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(btnTxt, btnX3 + btnW3 / 2, btnY3 + btnH3 / 2)

      ;(function(d) {
        uiButtons.push({
          x: btnX3, y: btnY3, w: btnW3, h: btnH3,
          action: function() { doShopBuyItem(d) }
        })
      })(def)
    } else {
      // 已满级：显示 新增 按钮以购买另一份
      var btnTxt2 = def.cost + '金 新增'
      var canBuyNew = coins >= def.cost

      roundRect(c, btnX3, btnY3, btnW3, btnH3, 3)
      c.fillStyle = canBuyNew ? 'rgba(0,200,255,0.15)' : 'rgba(40,40,40,0.3)'
      c.fill()
      c.strokeStyle = canBuyNew ? '#00CCFF' : '#444444'
      c.lineWidth = 1
      roundRect(c, btnX3, btnY3, btnW3, btnH3, 3)
      c.stroke()

      c.fillStyle = canBuyNew ? '#00CCFF' : '#553300'
      c.font = 'bold 9px monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(btnTxt2, btnX3 + btnW3 / 2, btnY3 + btnH3 / 2)

      ;(function(d) {
        uiButtons.push({
          x: btnX3, y: btnY3, w: btnW3, h: btnH3,
          action: function() { doShopBuyItem(d) }
        })
      })(def)
    }
  }

  // === 左侧底部按钮 ===
  var refreshW2 = 118
  var refreshH2 = 28
  var refreshY2 = contentBottom - refreshH2
  var continueW2 = 140
  var continueH2 = 32
  var continueX2 = gridX
  var btnGap2 = 10
  var refreshX2 = continueX2 + continueW2 + btnGap2
  var canRefresh = coins >= 10

  if (!isDragging) {
    drawBtn(c, continueX2, refreshY2 - 2, continueW2, continueH2, '继续战斗 >', '#00FF88', 'rgba(0,255,136,0.15)')
    uiButtons.push({ x: continueX2, y: refreshY2 - 2, w: continueW2, h: continueH2, action: doContinueFromShop })

    roundRect(c, refreshX2, refreshY2, refreshW2, refreshH2, 4)
    c.fillStyle = canRefresh ? 'rgba(100,200,255,0.12)' : 'rgba(40,40,60,0.3)'
    c.fill()
    c.strokeStyle = canRefresh ? 'rgba(100,200,255,0.6)' : 'rgba(60,60,80,0.4)'
    c.lineWidth = 1
    roundRect(c, refreshX2, refreshY2, refreshW2, refreshH2, 4)
    c.stroke()
    c.fillStyle = canRefresh ? '#88DDFF' : '#555566'
    c.font = 'bold 9px -apple-system, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('\u21BB 刷新 (10金)', refreshX2 + refreshW2 / 2, refreshY2 + refreshH2 / 2)
    uiButtons.push({ x: refreshX2, y: refreshY2, w: refreshW2, h: refreshH2, action: doShopRefresh })
  }

  // === 提示消息 ===
  if (shopMessageTimer > 0) {
    shopMessageTimer -= 0.033
    var msgAlpha = Math.min(1, shopMessageTimer / 0.5)
    c.save()
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = 'bold 12px -apple-system, sans-serif'
    c.fillStyle = 'rgba(255,255,200,' + msgAlpha + ')'
    c.fillText(shopMessage, w / 2, h - 56)
    c.restore()
  }

  // === 拖拽可视化 ===
  if (isDragging && dragDef) {
    // 高亮可放置的格子
    for (var dr = 0; dr < GRID_ROWS; dr++) {
      for (var dc = 0; dc < GRID_COLS; dc++) {
        if (engine.inventory.canPlace(dragDef, dc, dr)) {
          var hx = gridX + dc * CELL
          var hy = gridY + dr * CELL
          var hw = dragDef.w * CELL
          var hh = dragDef.h * CELL
          c.fillStyle = 'rgba(0,255,100,0.15)'
          c.fillRect(hx, hy, hw, hh)
          c.strokeStyle = 'rgba(0,255,100,0.6)'
          c.lineWidth = 1.5
          c.setLineDash([4, 3])
          c.strokeRect(hx, hy, hw, hh)
          c.setLineDash([])
        }
      }
    }
    // 拖拽跟随物品
    var dw = dragDef.w * CELL
    var dh = dragDef.h * CELL
    c.save()
    c.globalAlpha = 0.7
    c.fillStyle = dragDef.color + '66'
    c.fillRect(dragX - dw / 2, dragY - dh / 2, dw, dh)
    c.strokeStyle = dragDef.color
    c.lineWidth = 2
    c.strokeRect(dragX - dw / 2, dragY - dh / 2, dw, dh)
    c.globalAlpha = 1.0
    var dragImg = deployIconImgs[dragDef.id]
    if (dragImg && dragImg._loaded) {
      drawItemImage(c, dragImg, dragX - dw / 2, dragY - dh / 2, dw, dh, 4)
    } else {
      c.fillStyle = dragDef.color
      c.font = 'bold ' + Math.floor(CELL * 0.5) + 'px monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(dragDef.icon, dragX, dragY)
    }
    c.restore()

    if (moveDragItem) {
      // 移动模式：底部显示出售区域
      var szY = sellZoneY
      var szH = h - szY
      var isOverSell = dragY >= szY
      var sellAlpha = isOverSell ? (0.3 + 0.15 * Math.sin(Date.now() * 0.006)) : 0.12
      c.fillStyle = 'rgba(255,50,50,' + sellAlpha.toFixed(2) + ')'
      c.fillRect(0, szY, w, szH)
      c.strokeStyle = isOverSell ? '#FF4444' : 'rgba(255,80,80,0.5)'
      c.lineWidth = isOverSell ? 2 : 1
      c.setLineDash([6, 4])
      c.beginPath()
      c.moveTo(0, szY)
      c.lineTo(w, szY)
      c.stroke()
      c.setLineDash([])
      c.fillStyle = isOverSell ? '#FF6666' : 'rgba(255,100,100,0.7)'
      c.font = 'bold 12px -apple-system, sans-serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      var refund = Math.floor(moveDragItem.def.cost * 0.5)
      c.fillText('出售 (+' + refund + ' 金币)', w / 2, szY + szH / 2)
      // 取消按钮（左侧）
      var cancelW = 70, cancelH = 24
      var cancelX = 12, cancelBtnY = szY - cancelH - 4
      drawBtn(c, cancelX, cancelBtnY, cancelW, cancelH, '取消', '#FF4444', 'rgba(255,68,68,0.15)')
      uiButtons.push({ x: cancelX, y: cancelBtnY, w: cancelW, h: cancelH, action: cancelDrag })
    } else {
      // 新装备拖拽：取消按钮
      var cancelW2 = 100, cancelH2 = 28
      var cancelX2 = w / 2 - cancelW2 / 2
      var cancelBtnY2 = h - 40
      drawBtn(c, cancelX2, cancelBtnY2, cancelW2, cancelH2, '取消', '#FF4444', 'rgba(255,68,68,0.15)')
      uiButtons.push({ x: cancelX2, y: cancelBtnY2, w: cancelW2, h: cancelH2, action: cancelDrag })
    }
  }

  // 底部提示
  c.fillStyle = 'rgba(255,255,255,0.25)'
  c.font = '9px -apple-system, sans-serif'
  c.textAlign = 'right'
  c.textBaseline = 'bottom'
  c.fillText(isDragging ? (moveDragItem ? '拖到出售区或新位置' : '松手放置到绿色区域') : '拖动装备可移动或出售', w - 12, h - 4)
}

// ========== 暂停按钮 ==========
var PAUSE_SIZE = 40
var PAUSE_X = W - PAUSE_SIZE - 12
var PAUSE_Y = 12

function drawPauseButton(c) {
  roundRect(c, PAUSE_X, PAUSE_Y, PAUSE_SIZE, PAUSE_SIZE, 8)
  c.fillStyle = 'rgba(0,0,0,0.4)'
  c.fill()
  c.fillStyle = '#FFFFFF'
  c.font = '20px -apple-system, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('||', PAUSE_X + PAUSE_SIZE / 2, PAUSE_Y + PAUSE_SIZE / 2)
}

// ========== 主渲染循环 ==========
var _firstFrame = true
var _lastFrameTime = Date.now()
function mainLoop() {
  if (_firstFrame) {
    _firstFrame = false
    console.log('[pearlharbor] mainLoop 首帧执行')
  }

  const now = Date.now()
  const dt = Math.max(0.0001, Math.min(0.1, (now - _lastFrameTime) / 1000))
  _lastFrameTime = now

  // 游戏逻辑与渲染在同一帧，避免 setInterval 与 requestAnimationFrame 不同步
  if (engine && engine.state === GameState.PLAYING) {
    engine._update(dt)
  }

  ctx.clearRect(0, 0, W, H)

  switch (scene) {
    case 'start':
      drawStartScreen(ctx, W, H)
      break
    case 'playing':
      if (engine) {
        gameRenderer.render(ctx, W, H, engine)
        drawPauseButton(ctx)
        uiButtons = [{ x: PAUSE_X, y: PAUSE_Y, w: PAUSE_SIZE, h: PAUSE_SIZE, action: doPause }]
        if (engine.state === GameState.GAME_OVER) {
          scene = 'gameOver'
        }
        if (engine.shopReady) {
          scene = 'shop'
          generateShopOfferings()
        }
      }
      break
    case 'shop':
      if (engine) gameRenderer.render(ctx, W, H, engine)
      drawShopOverlay(ctx, W, H)
      break
    case 'paused':
      if (engine) gameRenderer.render(ctx, W, H, engine)
      drawPauseOverlay(ctx, W, H)
      break
    case 'gameOver':
      if (engine) gameRenderer.render(ctx, W, H, engine)
      drawGameOverOverlay(ctx, W, H)
      break
  }

  _raf(mainLoop)
}

// 绘制首帧
console.log('[pearlharbor] 绘制首帧...')
try {
  ctx.clearRect(0, 0, W, H)
  drawStartScreen(ctx, W, H)
} catch (e) {
  console.error('[pearlharbor] 首帧绘制失败:', e)
}

// 启动循环
_raf(mainLoop)
console.log('[pearlharbor] 游戏启动完成')

// ========== 触摸事件绑定（抖音小游戏全局事件） ==========
tt.onTouchStart(function (e) {
  if (!e || !e.touches || e.touches.length === 0) return
  var t = e.touches[0]
  var x = t.clientX !== undefined ? t.clientX : (t.x !== undefined ? t.x : 0)
  var y = t.clientY !== undefined ? t.clientY : (t.y !== undefined ? t.y : 0)
  lastTouchX = x
  lastTouchY = y
  // 军火库拖拽模式：更新拖拽位置
  if (scene === 'shop' && isDragging) {
    dragX = x
    dragY = y
    touchOnButton = false
    return
  }
  var btn = hitTest(x, y)
  if (btn) { touchOnButton = true; btn.action(x, y); return }
  touchOnButton = false
})

tt.onTouchMove(function (e) {
  if (!e || !e.touches || e.touches.length === 0) return
  var t = e.touches[0]
  var x = t.clientX !== undefined ? t.clientX : (t.x !== undefined ? t.x : 0)
  var y = t.clientY !== undefined ? t.clientY : (t.y !== undefined ? t.y : 0)
  // 军火库拖拽模式：更新拖拽位置
  if (scene === 'shop' && isDragging) {
    dragX = x
    dragY = y
    return
  }
  if (touchOnButton) return
  if (scene === 'playing' && engine && engine.state === GameState.PLAYING) {
    var dx = x - lastTouchX
    var dy = y - lastTouchY
    lastTouchX = x
    lastTouchY = y
    engine.orientationTracker.applyTouchDelta(dx, dy, 0.5)
  }
})

tt.onTouchEnd(function (e) {
  // 军火库拖拽模式：松手尝试放置
  if (scene === 'shop' && isDragging) {
    finishDragPlace(dragX, dragY)
  }
  touchOnButton = false
})
