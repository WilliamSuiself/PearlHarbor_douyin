/**
 * 背包 / 炮台装备系统 — 5×5 网格（中心3×3初始解锁）
 * Pearl Harbor 射击游戏
 */

const GRID_COLS = 5
const GRID_ROWS = 5
const CELL_UNLOCK_COST = 30  // 解锁一个格子的费用

// 升级等级系统：购买同一物品时自动升级
// count: 累计数量（每次购买翻倍）; stars: 星标数; starType: silver/gold
const UPGRADE_TIERS = [
  { count: 1,  stars: 0, starType: 'none',   label: '' },
  { count: 2,  stars: 1, starType: 'silver', label: '☆' },
  { count: 4,  stars: 2, starType: 'silver', label: '☆☆' },
  { count: 8,  stars: 3, starType: 'silver', label: '☆☆☆' },
  { count: 16, stars: 1, starType: 'gold',   label: '★' },
  { count: 32, stars: 2, starType: 'gold',   label: '★★' },
  { count: 64, stars: 3, starType: 'gold',   label: '★★★' }
]

function getUpgradeTier(count) {
  for (var i = UPGRADE_TIERS.length - 1; i >= 0; i--) {
    if (count >= UPGRADE_TIERS[i].count) return UPGRADE_TIERS[i]
  }
  return UPGRADE_TIERS[0]
}

function getMultiplier(count) {
  return getUpgradeTier(count).count
}

// 装备定义
const GridItemType = {
  BARREL:         'barrel',
  CREW:           'crew',
  TORPEDO_TUBE:   'torpedo_tube',
  SHIELD:         'shield',
  EMP:            'emp',
  AMMO_FIRE:      'ammo_fire',
  AMMO_ICE:       'ammo_ice',
  AMMO_ELECTRIC:  'ammo_electric',
  AMMO_ARMOR_PIERCE: 'ammo_armor_pierce'
}

const GRID_ITEM_DEFS = {
  [GridItemType.BARREL]: {
    id: GridItemType.BARREL,
    name: '炮管',
    desc: '每根炮管使炮塔外观升级一级',
    w: 1, h: 3,
    cost: 50,
    color: '#FF8800',
    icon: '炮',
    fireRateBonus: 3.0,
    damageBonus: 5,
    fireTime: 3.0,
    reloadTime: 1.5,
    linearScaling: true
  },
  [GridItemType.CREW]: {
    id: GridItemType.CREW,
    name: '组员',
    desc: '射速 +1%，冷却时间 -1%',
    w: 1, h: 1,
    cost: 30,
    color: '#00CCFF',
    icon: '员',
    fireRateBonus: 0,
    damageBonus: 0,
    crewBonus: 0.01,
    fireTime: 0,
    reloadTime: 0
  },
  [GridItemType.TORPEDO_TUBE]: {
    id: GridItemType.TORPEDO_TUBE,
    name: '鱼雷发射管',
    desc: '每10秒自动向敌舰发射一次鱼雷',
    w: 1, h: 2,
    cost: 60,
    color: '#00FF88',
    icon: '雷',
    fireRateBonus: 0,
    damageBonus: 0,
    torpedoInterval: 10.0,
    fireTime: 0,
    reloadTime: 10.0
  },
  [GridItemType.SHIELD]: {
    id: GridItemType.SHIELD,
    name: '护盾',
    desc: '可吸收30点伤害',
    w: 2, h: 1,
    cost: 50,
    color: '#8888FF',
    icon: '盾',
    fireRateBonus: 0,
    damageBonus: 0,
    shieldHP: 30,
    fireTime: 0,
    reloadTime: 0
  },
  [GridItemType.EMP]: {
    id: GridItemType.EMP,
    name: '电磁脉冲',
    desc: '自动摧毁周围的敌人',
    w: 2, h: 2,
    cost: 200,
    color: '#AA00FF',
    icon: '磁',
    fireRateBonus: 0,
    damageBonus: 0,
    empRadius: 2.0,
    empDamage: 9999,
    fireTime: 30.0,
    reloadTime: 5.0
  },
  [GridItemType.AMMO_FIRE]: {
    id: GridItemType.AMMO_FIRE,
    name: '火焰弹',
    desc: '点燃敌人，持续3秒每秒5点伤害',
    w: 1, h: 2,
    cost: 50,
    color: '#FF6600',
    icon: '\uD83D\uDD25',
    isAmmo: true,
    element: 'fire',
    fireRateBonus: 0,
    damageBonus: 0,
    fireTime: 0,
    reloadTime: 0
  },
  [GridItemType.AMMO_ICE]: {
    id: GridItemType.AMMO_ICE,
    name: '冰冻弹',
    desc: '使敌人减速50%，持续2秒',
    w: 1, h: 2,
    cost: 50,
    color: '#00CCFF',
    icon: '\u2744',
    isAmmo: true,
    element: 'ice',
    fireRateBonus: 0,
    damageBonus: 0,
    fireTime: 0,
    reloadTime: 0
  },
  [GridItemType.AMMO_ELECTRIC]: {
    id: GridItemType.AMMO_ELECTRIC,
    name: '闪电弹',
    desc: '连锁命中另一个敌人，造成40%伤害',
    w: 1, h: 2,
    cost: 65,
    color: '#FFFF00',
    icon: '\u26A1',
    isAmmo: true,
    element: 'electric',
    fireRateBonus: 0,
    damageBonus: 0,
    fireTime: 0,
    reloadTime: 0
  },
  [GridItemType.AMMO_ARMOR_PIERCE]: {
    id: GridItemType.AMMO_ARMOR_PIERCE,
    name: '穿甲弹',
    desc: '每颗星标为单体伤害额外增加50%',
    w: 1, h: 2,
    cost: 60,
    color: '#FF8800',
    icon: '穿',
    isAmmo: true,
    element: 'armor_pierce',
    fireRateBonus: 0,
    damageBonus: 0,
    fireTime: 0,
    reloadTime: 0
  }
}

// 可购买物品（用于商店目录显示）
const GRID_ITEM_LIST = [
  GRID_ITEM_DEFS[GridItemType.BARREL],
  GRID_ITEM_DEFS[GridItemType.CREW],
  GRID_ITEM_DEFS[GridItemType.TORPEDO_TUBE],
  GRID_ITEM_DEFS[GridItemType.SHIELD],
  GRID_ITEM_DEFS[GridItemType.EMP],
  GRID_ITEM_DEFS[GridItemType.AMMO_FIRE],
  GRID_ITEM_DEFS[GridItemType.AMMO_ICE],
  GRID_ITEM_DEFS[GridItemType.AMMO_ELECTRIC],
  GRID_ITEM_DEFS[GridItemType.AMMO_ARMOR_PIERCE]
]

class InventoryGrid {
  constructor() {
    this.reset()
  }

  reset() {
    // 网格: cells[row][col] = null 或 placedItem 引用
    this.cells = []
    for (let r = 0; r < GRID_ROWS; r++) {
      this.cells[r] = []
      for (let c = 0; c < GRID_COLS; c++) {
        this.cells[r][c] = null
      }
    }
    // 已放置物品列表: [{def, col, row, uid, count}]
    this.placedItems = []
    this._nextUid = 1
    // 单元格解锁状态: unlocked[row][col] = true/false
    this.unlocked = []
    for (let r = 0; r < GRID_ROWS; r++) {
      this.unlocked[r] = []
      for (let c = 0; c < GRID_COLS; c++) {
        this.unlocked[r][c] = false
      }
    }
    // 初始解锁中心 3x3 区域
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) {
        this.unlocked[r][c] = true
      }
    }
    // 护盾当前 HP
    this.shieldHP = 0
    this.maxShieldHP = 0
    // 鱼雷自动射击计时器
    this.torpedoTimer = 0
    // 默认放置 Gun Barrel 在正中间 (col=2, row=1, 1x3)
    var barrelDef = GRID_ITEM_DEFS[GridItemType.BARREL]
    this.place(barrelDef, 2, 1)
  }

  /**
   * 检查是否可以放置（所有占用格必须已解锁且为空）
   */
  canPlace(def, col, row) {
    if (col < 0 || row < 0) return false
    if (col + def.w > GRID_COLS) return false
    if (row + def.h > GRID_ROWS) return false
    for (let r = row; r < row + def.h; r++) {
      for (let c = col; c < col + def.w; c++) {
        if (!this.unlocked[r][c]) return false
        if (this.cells[r][c] !== null) return false
      }
    }
    return true
  }

  /**
   * 查找第一个可放置位置（自动放置用）
   * 返回 {col, row} 或 null
   */
  findFirstSlot(def) {
    for (let r = 0; r <= GRID_ROWS - def.h; r++) {
      for (let c = 0; c <= GRID_COLS - def.w; c++) {
        if (this.canPlace(def, c, r)) return { col: c, row: r }
      }
    }
    return null
  }

  /**
   * 智能放置：用户点击任意格子时，自动寻找包含该格的最佳放置位置
   * 返回 {col, row} 或 null
   */
  findBestSlotAt(def, clickCol, clickRow) {
    // 先尝试精确位置
    if (this.canPlace(def, clickCol, clickRow)) return { col: clickCol, row: clickRow }
    // 对于多格物品，尝试让点击的格子在物品范围内的各种偏移
    for (let dr = 0; dr < def.h; dr++) {
      for (let dc = 0; dc < def.w; dc++) {
        const tryCol = clickCol - dc
        const tryRow = clickRow - dr
        if (tryCol >= 0 && tryRow >= 0 && this.canPlace(def, tryCol, tryRow)) {
          return { col: tryCol, row: tryRow }
        }
      }
    }
    // Also try placing BELOW the click point (user might drag to top edge for tall items)
    for (let dr = 1; dr <= 2; dr++) {
      const tryRow = clickRow + dr
      for (let dc = 0; dc < def.w; dc++) {
        const tryCol = clickCol - dc
        if (tryCol >= 0 && tryRow >= 0 && this.canPlace(def, tryCol, tryRow)) {
          return { col: tryCol, row: tryRow }
        }
      }
    }
    // Expand search: nearest valid position within 2 cells radius
    for (let radius = 1; radius <= 2; radius++) {
      for (let oRow = -radius; oRow <= radius; oRow++) {
        for (let oCol = -radius; oCol <= radius; oCol++) {
          const tryCol = clickCol + oCol
          const tryRow = clickRow + oRow
          if (tryCol >= 0 && tryRow >= 0 && this.canPlace(def, tryCol, tryRow)) {
            return { col: tryCol, row: tryRow }
          }
        }
      }
    }
    return null
  }

  /**
   * 获取可解锁的格子列表（必须与已解锁区域相邻）
   * 返回 [{col, row}]
   */
  getUnlockableCells() {
    var result = []
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.unlocked[r][c]) continue
        // 检查上下左右是否有已解锁的格子
        if ((r > 0 && this.unlocked[r - 1][c]) ||
            (r < GRID_ROWS - 1 && this.unlocked[r + 1][c]) ||
            (c > 0 && this.unlocked[r][c - 1]) ||
            (c < GRID_COLS - 1 && this.unlocked[r][c + 1])) {
          result.push({ col: c, row: r })
        }
      }
    }
    return result
  }

  /**
   * 解锁指定格子
   */
  unlockCell(col, row) {
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false
    if (this.unlocked[row][col]) return false
    this.unlocked[row][col] = true
    return true
  }

  /**
   * 是否所有格子已解锁
   */
  isAllUnlocked() {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!this.unlocked[r][c]) return false
      }
    }
    return true
  }

  /**
   * 放置物品
   * 返回 placedItem 或 null
   */
  place(def, col, row) {
    if (!this.canPlace(def, col, row)) return null
    const item = { def: def, col: col, row: row, uid: this._nextUid++, count: 1 }
    for (let r = row; r < row + def.h; r++) {
      for (let c = col; c < col + def.w; c++) {
        this.cells[r][c] = item
      }
    }
    this.placedItems.push(item)
    this._recalcShield()
    return item
  }

  /**
   * 移除指定 uid 的物品
   * 返回被移除的 item 或 null
   */
  removeByUid(uid) {
    const idx = this.placedItems.findIndex(it => it.uid === uid)
    if (idx < 0) return null
    const item = this.placedItems[idx]
    // 清除网格引用
    for (let r = item.row; r < item.row + item.def.h; r++) {
      for (let c = item.col; c < item.col + item.def.w; c++) {
        if (this.cells[r][c] === item) this.cells[r][c] = null
      }
    }
    this.placedItems.splice(idx, 1)
    this._recalcShield()
    return item
  }

  /**
   * 根据网格坐标找到该位置的物品
   */
  getItemAt(col, row) {
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null
    if (!this.unlocked[row][col]) return null
    return this.cells[row][col]
  }

  /**
   * 根据物品类型 ID 查找已放置物品
   */
  findItemByType(typeId) {
    return this.placedItems.find(function(it) { return it.def.id === typeId }) || null
  }

  /**
   * 升级物品：普通装备 count 翻倍，线性成长装备（枪管）每次 +1
   * 返回 true 成功，false 已满级
   */
  upgradeItem(uid) {
    var item = this.placedItems.find(function(it) { return it.uid === uid })
    if (!item) return false
    if (item.count >= 64) return false
    if (item.def.linearScaling) {
      item.count += 1
    } else {
      item.count *= 2
    }
    this._recalcShield()
    return true
  }

  /**
   * 判断某格是否在已解锁区域
   */
  isCellUnlocked(col, row) {
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false
    return this.unlocked[row][col]
  }

  /**
   * 获取装备效果（商店显示用，不考虑冷却状态）
   */
  getEffects() {
    return this._calcEffects(null)
  }

  /**
   * 获取实战效果（考虑武器冷却状态）
   * @param weaponStates - {uid: {phase: 'firing'|'reloading', timer}} 或 null
   */
  getEffectsWithStates(weaponStates) {
    return this._calcEffects(weaponStates)
  }

  _calcEffects(weaponStates) {
    let fireRateBonus = 0
    let damageBonus = 0
    let torpedoCount = 0
    let torpedoInterval = Infinity
    let crewBonus = 0

    for (const item of this.placedItems) {
      const mult = item.def.linearScaling ? item.count : getMultiplier(item.count)
      // 辅助成员始终生效（被动，不受冷却影响）
      if (item.def.crewBonus) {
        crewBonus += item.def.crewBonus * mult
      }
      // 如果有武器状态，只计算当前处于 firing 状态的武器
      if (weaponStates && item.def.fireTime > 0) {
        var ws = weaponStates[item.uid]
        if (ws && ws.phase === 'reloading') continue
      }
      fireRateBonus += (item.def.fireRateBonus || 0) * mult
      damageBonus += (item.def.damageBonus || 0) * mult
      if (item.def.torpedoInterval) {
        torpedoCount += mult
        torpedoInterval = Math.min(torpedoInterval, item.def.torpedoInterval / Math.sqrt(mult))
      }
    }
    if (torpedoCount === 0) torpedoInterval = 0

    return {
      fireRateBonus,
      damageBonus,
      torpedoCount,
      torpedoInterval,
      crewBonus,
      shieldHP: this.shieldHP,
      maxShieldHP: this.maxShieldHP
    }
  }

  /**
   * 护盾吸收伤害，返回实际扣减的生命值
   */
  absorbDamage(damage) {
    if (this.shieldHP <= 0) return damage
    const absorbed = Math.min(this.shieldHP, damage)
    this.shieldHP -= absorbed
    return damage - absorbed
  }

  /**
   * 波次间恢复护盾
   */
  replenishShield() {
    this._recalcShield()
    this.shieldHP = this.maxShieldHP
  }

  _recalcShield() {
    let total = 0
    for (const item of this.placedItems) {
      const mult = getMultiplier(item.count)
      total += (item.def.shieldHP || 0) * mult
    }
    this.maxShieldHP = total
    // 不超过最大值
    if (this.shieldHP > this.maxShieldHP) this.shieldHP = this.maxShieldHP
  }

  /**
   * 获取炮身视觉挂载档位（用于渲染枪管外观，随购买枪管数量增长）
   * 每个枪管 count 对应一根炮管，映射到 gun_0..gun_4 五档贴图
   * 1=gun_0（基础），2=gun_1，3=gun_2，4=gun_3，5+=gun_4
   */
  getVisualGunLevel() {
    let barrelUnits = 0
    for (const item of this.placedItems) {
      if (item.def.id === GridItemType.BARREL) {
        barrelUnits += item.count
      }
    }
    if (barrelUnits <= 0) return 0
    return Math.min(4, barrelUnits - 1)
  }

  /**
   * 获取所有装备的 count 列表（供渲染用）
   */
  getItemCounts() {
    var result = {}
    for (var i = 0; i < this.placedItems.length; i++) {
      var it = this.placedItems[i]
      result[it.def.id] = (result[it.def.id] || 0) + it.count
    }
    return result
  }

  /**
   * 统计炮管总数量（用于弹道数、显示数量）
   */
  getGunCount() {
    let count = 0
    for (const item of this.placedItems) {
      if (item.def.id === GridItemType.BARREL) {
        count += item.count
      }
    }
    return count
  }

  /**
   * 获取当前激活的元素弹药效果（基于弹仓与武器的邻接关系）
   * 返回 { fire: multiplier, ice: multiplier, electric: multiplier, armor_pierce: multiplier }
   * multiplier = 弹仓的升级倍数，0 表示无此效果
   */
  getActiveElements() {
    var result = { fire: 0, ice: 0, electric: 0, armor_pierce: 0 }
    var ammoItems = []
    var weaponItems = []
    for (var i = 0; i < this.placedItems.length; i++) {
      var item = this.placedItems[i]
      if (item.def.isAmmo) {
        ammoItems.push(item)
      } else if (item.def.fireRateBonus > 0) {
        weaponItems.push(item)
      }
    }
    // 检查每个弹仓是否与某个武器相邻
    for (var a = 0; a < ammoItems.length; a++) {
      var ammo = ammoItems[a]
      var adjacent = false
      for (var w = 0; w < weaponItems.length; w++) {
        if (this._isAdjacent(ammo, weaponItems[w])) {
          adjacent = true
          break
        }
      }
      if (adjacent) {
        var mult = getMultiplier(ammo.count)
        var elem = ammo.def.element
        if (elem === 'fire') result.fire += mult
        else if (elem === 'ice') result.ice += mult
        else if (elem === 'electric') result.electric += mult
        else if (elem === 'armor_pierce') {
          var tier = getUpgradeTier(ammo.count)
          var starLevel = tier.stars + (tier.starType === 'gold' ? 3 : 0)
          result.armor_pierce += starLevel
        }
      }
    }
    return result
  }

  /**
   * 判断两个物品是否在网格中相邻（共享边）
   */
  _isAdjacent(itemA, itemB) {
    // 获取 itemA 占据的所有格子
    for (var r = itemA.row; r < itemA.row + itemA.def.h; r++) {
      for (var c = itemA.col; c < itemA.col + itemA.def.w; c++) {
        // 检查上下左右是否属于 itemB
        if (this._cellBelongsTo(c - 1, r, itemB)) return true
        if (this._cellBelongsTo(c + 1, r, itemB)) return true
        if (this._cellBelongsTo(c, r - 1, itemB)) return true
        if (this._cellBelongsTo(c, r + 1, itemB)) return true
      }
    }
    return false
  }

  _cellBelongsTo(col, row, item) {
    return col >= item.col && col < item.col + item.def.w &&
           row >= item.row && row < item.row + item.def.h
  }
}

module.exports = {
  GRID_COLS, GRID_ROWS, CELL_UNLOCK_COST,
  UPGRADE_TIERS, getUpgradeTier, getMultiplier,
  GridItemType, GRID_ITEM_DEFS, GRID_ITEM_LIST,
  InventoryGrid
}
