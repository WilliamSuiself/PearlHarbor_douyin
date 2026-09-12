/**
 * 设备方向追踪器（陀螺仪）— 横屏模式
 * 完全匹配 Flutter DeviceOrientationTracker 的逻辑：
 *
 * 手机传感器坐标系（固定于硬件，竖屏参考）：
 *   X = 沿短边（竖屏时朝右）
 *   Y = 沿长边（竖屏时朝上）
 *   Z = 垂直屏幕（朝用户）
 *
 * 横屏时的映射：
 *   landscapeRight (顶部→右): X 朝上, Y 朝左
 *   landscapeLeft  (顶部→左): X 朝下, Y 朝右
 *
 * Yaw  (左右转) = 绕设备 X 轴旋转（横屏时 X 是竖直轴）
 * Pitch (上下倾) = 绕设备 Y 轴旋转（横屏时 Y 是水平轴）
 *
 * 通过加速度计自动检测横屏方向，设置正确的符号。
 *
 * 传感器优先级：
 *   1. _api.startGyroscope（陀螺仪，仅小游戏可用）
 *   2. _api.startDeviceMotionListening（设备方向，小程序可用）
 *   3. 触摸控制（兜底）
 */

var _api = typeof tt !== 'undefined' ? tt : (typeof wx !== 'undefined' ? wx : {})

class DeviceOrientationTracker {
  constructor() {
    this._yaw = 0
    this._pitch = 0
    this._smoothYaw = 0
    this._smoothPitch = 0
    this._lastTime = 0
    this._listening = false
    this._onGyroChange = null
    this._onAccelChange = null
    this._onMotionChange = null
    this._useDeviceMotion = false
    this._prevBeta = null
    this._prevGamma = null
    // 方向符号：+1 = landscapeRight, -1 = landscapeLeft
    this._orientSign = -1
    // 平滑滤波的时间戳（用于把平滑系数换算成与调用频率无关的时间常数）
    this._lastAccelTime = 0
    this._lastPitchSmoothTime = 0
  }

  get yaw() { return this._smoothYaw }
  get pitch() {
    const now = Date.now()
    const dt = this._lastPitchSmoothTime
      ? Math.max(0.001, Math.min(0.5, (now - this._lastPitchSmoothTime) / 1000))
      : 0.016
    this._lastPitchSmoothTime = now
    const alpha = 1 - Math.exp(-dt / DeviceOrientationTracker.SMOOTH_TAU_PITCH)
    this._smoothPitch += (this._pitch - this._smoothPitch) * alpha
    this._clampPitch()
    return this._smoothPitch
  }

  start() {
    if (this._listening) return
    this._lastTime = Date.now()
    this._listening = true

    // 1. 启动加速度计来检测横屏方向
    this._startAccelerometer()

    // 2. 尝试陀螺仪，失败则回退到 DeviceMotion
    this._tryStartGyroscope()
  }

  _tryStartGyroscope() {
    // Flutter WebView 环境：接收 Flutter 传入的传感器数据
    if (typeof window !== 'undefined' && window.document) {
      this._setupFlutterSensors()
      return
    }

    if (typeof _api.startGyroscope !== 'function') {
      console.warn('[orientation] _api.startGyroscope 不存在，回退 DeviceMotion')
      this._startDeviceMotion()
      return
    }

    try {
      _api.startGyroscope({
        interval: 20,
        success: () => {
          console.log('[orientation] 陀螺仪启动成功')
          this._onGyroChange = (res) => {
            this._handleGyro(res)
          }
          _api.onGyroscopeChange(this._onGyroChange)
        },
        fail: (err) => {
          console.warn('[orientation] 陀螺仪启动失败:', err, '，回退 DeviceMotion')
          this._startDeviceMotion()
        }
      })
    } catch (e) {
      console.warn('[orientation] startGyroscope 异常:', e, '，回退 DeviceMotion')
      this._startDeviceMotion()
    }
  }

  // Flutter 通过 runJavaScript 调用 window._onFlutterGyro / _onFlutterAccel
  _setupFlutterSensors() {
    const self = this
    // 陀螺仪 → 仅控制 yaw（左右）
    window._onFlutterGyro = function(gx, gy, gz) {
      if (!self._listening) return
      self._handleGyroYawOnly(gx, gy, gz)
    }
    // 加速度计 → 控制 pitch（上下）+ 检测横屏方向
    window._onFlutterAccel = function(ax, ay, az) {
      if (!self._listening) return
      self._handleAccelPitch(ax, ay, az)
    }
    console.log('[orientation] Flutter 传感器桥接已注册（陀螺仪→yaw，加速度计→pitch）')
  }

  // 陀螺仪仅控制 yaw（左右旋转）
  _handleGyroYawOnly(gx, gy, gz) {
    const now = Date.now()
    const dt = Math.max(0.001, Math.min(0.1, (now - this._lastTime) / 1000))
    this._lastTime = now

    // 横屏模式：翻转 x 轴，手机右转→背景左移
    const rawGx = -gx
    const filteredGx = Math.abs(rawGx) > DeviceOrientationTracker.DEAD_ZONE ? rawGx : 0
    const deg = 180.0 / Math.PI

    this._yaw -= this._orientSign * filteredGx * dt * deg
    // yaw 仅由陀螺仪控制，pitch 由加速度计控制

    this._clampYaw()
    this._smoothYawStep()
  }

  // 加速度计控制 pitch（上下倾斜）+ 检测横屏方向
  // Android 加速度计硬件坐标系（m/s²）：
  //   ax = 沿短边（竖屏右）  ay = 沿长边（竖屏上）  az = 垂直屏幕（朝用户）
  // 横屏持握时：
  //   ax 包含大部分重力分量（用于检测 landscapeLeft/Right）
  //   ay, az 的比值决定前后倾斜角度 → 映射为 pitch
  _handleAccelPitch(ax, ay, az) {
    // 0. 计算两次回调之间的真实时间差。
    //    抖音小游戏的 tt.onAccelerometerChange 固定只有 5 次/秒的回调频率
    //    （远低于 Flutter 原生传感器的 ~60Hz），如果用固定的"每次回调混合一点"
    //    的平滑系数，会导致混合速度被拖慢十几倍，pitch 看起来像是"没反应"。
    //    这里改成基于时间常数的指数平滑，使响应速度不再依赖回调频率。
    const now = Date.now()
    const dt = this._lastAccelTime
      ? Math.max(0.001, Math.min(0.5, (now - this._lastAccelTime) / 1000))
      : 0.016
    this._lastAccelTime = now

    // 1. 低通滤波：过滤手持微颤（时间常数约 0.1s，与回调频率无关）
    if (this._filteredAz === undefined) {
      this._filteredAx = ax
      this._filteredAz = az
    }
    const filterAlpha = 1 - Math.exp(-dt / 0.1)
    this._filteredAx = this._filteredAx + (ax - this._filteredAx) * filterAlpha
    this._filteredAz = this._filteredAz + (az - this._filteredAz) * filterAlpha

    // 2. 横屏方向检测：用滤波后的 ax（不是瞬时原始值）+ 更高的翻转阈值（带滞回），
    //    避免手持轻微抖动时 ax 在临界值附近来回穿越，导致 orientSign 突然反转、
    //    yaw 瞬间"反向乱跳"。横屏方向在一局游戏内基本不会真的变化，所以宁可
    //    保守一点，只有非常明确的翻转才切换符号。
    const nx = this._filteredAx / 9.8
    if (Math.abs(nx) > 0.6) {
      this._orientSign = nx < 0 ? 1.0 : -1.0
    }

    // 3. 用滤波后的数据计算倾斜角 → pitch
    const tiltRad = Math.atan2(this._filteredAz, Math.abs(this._filteredAx))
    const tiltDeg = tiltRad * 180.0 / Math.PI
    // 中立位置：自然持握（屏幕约 40-50°）时初始 pitch 约 45°，方便对空
    const neutralAngle = -5.0
    const rawPitch = (tiltDeg - neutralAngle) * 1.2
    this._pitch = Math.max(-60, Math.min(60, rawPitch))
    this._clampPitch()
  }

  // 陀螺仪仅控制 yaw（左右）——pitch 由加速度计控制（平衡逻辑，抗抖动）
  _handleGyro(res) {
    const now = Date.now()
    const dt = Math.max(0.001, Math.min(0.1, (now - this._lastTime) / 1000))
    this._lastTime = now

    const gx = Math.abs(res.x) > DeviceOrientationTracker.DEAD_ZONE ? res.x : 0
    const deg = 180.0 / Math.PI

    this._yaw -= this._orientSign * gx * dt * deg
    // pitch 不再由陀螺仪控制——由加速度计控制

    this._clampYaw()
    this._smoothYawStep()
  }

  // DeviceMotion 回退：通过 beta/gamma 角度增量模拟陀螺仪
  _startDeviceMotion() {
    if (typeof _api.startDeviceMotionListening !== 'function') {
      console.warn('[orientation] _api.startDeviceMotionListening 也不存在，仅能使用触摸')
      return
    }

    this._useDeviceMotion = true
    this._prevBeta = null
    this._prevGamma = null

    try {
      _api.startDeviceMotionListening({
        interval: 20,
        success: () => {
          console.log('[orientation] DeviceMotion 启动成功')
          this._onMotionChange = (res) => {
            this._handleDeviceMotion(res)
          }
          _api.onDeviceMotionChange(this._onMotionChange)
        },
        fail: (err) => {
          console.warn('[orientation] DeviceMotion 启动失败:', err)
        }
      })
    } catch (e) {
      console.warn('[orientation] startDeviceMotionListening 异常:', e)
    }
  }

  _handleDeviceMotion(res) {
    // DeviceMotion 返回绝对欧拉角（度）：
    //   alpha: 绕 Z 轴 (0-360)
    //   beta:  绕 X 轴 (-180 ~ 180)
    //   gamma: 绕 Y 轴 (-90 ~ 90)
    // 通过帧间差值模拟角速度

    if (this._prevBeta === null) {
      this._prevBeta = res.beta || 0
      this._prevGamma = res.gamma || 0
      this._lastTime = Date.now()
      return
    }

    const now = Date.now()
    this._lastTime = now

    let dBeta = (res.beta || 0) - this._prevBeta
    let dGamma = (res.gamma || 0) - this._prevGamma

    // 处理角度跳变
    if (dBeta > 180) dBeta -= 360
    if (dBeta < -180) dBeta += 360
    if (dGamma > 90) dGamma -= 180
    if (dGamma < -90) dGamma += 180

    this._prevBeta = res.beta || 0
    this._prevGamma = res.gamma || 0

    // 死区过滤噪声
    const gx = Math.abs(dBeta) > 0.3 ? dBeta : 0
    // 仅用 beta 增量控制 yaw；pitch 由独立的加速度计回调控制（防抖动）
    this._yaw -= this._orientSign * gx

    this._clampYaw()
    this._smoothYawStep()
  }

  _clampYaw() {
    while (this._yaw > 180) this._yaw -= 360
    while (this._yaw < -180) this._yaw += 360
  }

  _clampPitch() {
    this._pitch = Math.max(-60, Math.min(60, this._pitch))
  }

  // yaw 的平滑：固定比例混合。yaw 由陀螺仪高频驱动（~50Hz，间隔稳定），
  // 这套写法已经在真机上验证过是稳的，不要改成按时间换算的版本——
  // 陀螺仪真机回调的时间戳本身会有小抖动，按时间换算反而会把时间戳噪声
  // 放大成角度上的"乱跳"。
  _smoothYawStep() {
    const s = DeviceOrientationTracker.SMOOTHING
    this._smoothYaw = this._smoothYaw * s + this._yaw * (1 - s)
  }

  // pitch 的平滑：按时间常数换算。pitch 在小游戏平台由加速度计低频驱动
  // （固定 5Hz，且各次回调间隔基本固定在 200ms 左右，抖动风险比陀螺仪小很多），
  // 用与调用频率无关的时间常数，才不会出现"上下倾斜迟钝/像坏了"。
  _smoothPitchStep(dt) {
    const alpha = 1 - Math.exp(-dt / DeviceOrientationTracker.SMOOTH_TAU_PITCH)
    this._smoothPitch += (this._pitch - this._smoothPitch) * alpha
  }

  _startAccelerometer() {
    // Web 环境不需要加速度计（横屏方向由系统管理）
    if (typeof window !== 'undefined' && window.document) return

    try {
      // 注意：抖音小游戏 tt.startAccelerometer 不支持 interval 参数
      // （官方文档：暂不支持interval属性，回调固定 5 次/秒），传了也会被忽略，
      // 这里干脆不传，避免个别版本对未知参数做严格校验导致 fail。
      _api.startAccelerometer({
        success: () => {
          this._onAccelChange = (res) => {
            // 小游戏加速度计返回已归一化到 g 单位（0∶1.0）
            // 乘 9.8 转为 m/s² 以复用 _handleAccelPitch（同时更新 orientSign、pitch）
            this._handleAccelPitch(res.x * 9.8, res.y * 9.8, res.z * 9.8)
          }
          _api.onAccelerometerChange(this._onAccelChange)
        },
        fail: () => {
          console.warn('[orientation] 加速度计不可用，使用默认横屏方向')
        }
      })
    } catch (e) {
      console.warn('[orientation] startAccelerometer 异常:', e)
    }
  }

  stop() {
    if (!this._listening) return
    this._listening = false

    // 清除 Flutter 传感器桥接
    if (typeof window !== 'undefined') {
      window._onFlutterGyro = null
      window._onFlutterAccel = null
    }

    // 停止陀螺仪
    if (this._onGyroChange) {
      try { _api.offGyroscopeChange(this._onGyroChange) } catch (e) {}
      this._onGyroChange = null
    }
    try { _api.stopGyroscope({ fail: () => {} }) } catch (e) {}

    // 停止 DeviceMotion
    if (this._onMotionChange) {
      try { _api.offDeviceMotionChange(this._onMotionChange) } catch (e) {}
      this._onMotionChange = null
    }
    if (this._useDeviceMotion) {
      try { _api.stopDeviceMotionListening({ fail: () => {} }) } catch (e) {}
      this._useDeviceMotion = false
    }

    // 停止加速度计
    if (this._onAccelChange) {
      try { _api.offAccelerometerChange(this._onAccelChange) } catch (e) {}
      this._onAccelChange = null
    }
    try { _api.stopAccelerometer({ fail: () => {} }) } catch (e) {}
  }

  reset() {
    this._yaw = 0
    this._pitch = 0
    this._smoothYaw = 0
    this._smoothPitch = 0
    this._lastTime = 0
    this._prevBeta = null
    this._prevGamma = null
    this._lastAccelTime = 0
    this._lastPitchSmoothTime = 0
    this._filteredAx = undefined
    this._filteredAz = undefined
  }

  // 触摸控制：手指拖拽改变朝向
  // 横屏模式下 dx 控制左右(yaw)，dy 控制上下(pitch)
  applyTouchDelta(dx, dy, sensitivity = 0.5) {
    this._yaw += dx * sensitivity
    this._pitch -= dy * sensitivity
    this._clampYaw()
    this._clampPitch()
    this._smoothYawStep()
    // pitch 的平滑交给 get pitch() 在每个渲染帧统一处理
  }

  dispose() {
    this.stop()
  }
}

// yaw 的固定平滑比例：陀螺仪回调频率高且稳定，保持原来经过真机验证的写法。
DeviceOrientationTracker.SMOOTHING = 0.2
// pitch 的平滑时间常数（秒）：加速度计在小游戏平台固定 5Hz，用与调用频率
// 无关的时间常数才能既不迟钝、又不会因为偶尔的回调间隔变化而跳变。
DeviceOrientationTracker.SMOOTH_TAU_PITCH = 0.15
DeviceOrientationTracker.DEAD_ZONE = 0.03

module.exports = { DeviceOrientationTracker }
