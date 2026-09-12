/**
 * AR 坐标系统 — 球面坐标 + 投影
 * 从 Flutter ARPosition / ARProjector 移植
 */

class ARPosition {
  constructor(azimuth = 0, elevation = 0, distance = 50) {
    this.azimuth = azimuth
    this.elevation = elevation
    this.distance = distance
  }

  copyWith({ azimuth, elevation, distance } = {}) {
    return new ARPosition(
      azimuth !== undefined ? azimuth : this.azimuth,
      elevation !== undefined ? elevation : this.elevation,
      distance !== undefined ? distance : this.distance
    )
  }

  static wrapAngle(angle) {
    while (angle > 180) angle -= 360
    while (angle < -180) angle += 360
    return angle
  }
}

class ARProjector {

  /**
   * 将 AR 坐标投影到屏幕坐标
   * @returns {{x: number, y: number}|null}
   */
  static toScreen(target, cameraYaw, cameraPitch, screenW, screenH) {
    let deltaAz = ARPosition.wrapAngle(target.azimuth - cameraYaw)
    let deltaEl = target.elevation - cameraPitch

    const halfH = ARProjector.FOV_H / 2
    const halfV = ARProjector.FOV_V / 2

    if (Math.abs(deltaAz) > halfH + 10 || Math.abs(deltaEl) > halfV + 10) {
      return null
    }

    const x = screenW / 2 + (deltaAz / halfH) * (screenW / 2)
    const y = screenH / 2 - (deltaEl / halfV) * (screenH / 2)
    return { x, y }
  }

  static scaleForDistance(distance, baseSize, refDist = 30) {
    if (distance < 1) return baseSize * 3.0
    const s = (baseSize * refDist / distance)
    return Math.max(baseSize * 0.3, Math.min(baseSize * 4.0, s))
  }

  static angularDistFromCenter(target, cameraYaw, cameraPitch) {
    const deltaAz = ARPosition.wrapAngle(target.azimuth - cameraYaw)
    const deltaEl = target.elevation - cameraPitch
    return Math.sqrt(deltaAz * deltaAz + deltaEl * deltaEl)
  }

  static directionAngle(target, cameraYaw) {
    const deltaAz = ARPosition.wrapAngle(target.azimuth - cameraYaw)
    return deltaAz * Math.PI / 180.0
  }
}

ARProjector.FOV_H = 70.0
ARProjector.FOV_V = 50.0

module.exports = { ARPosition, ARProjector }
