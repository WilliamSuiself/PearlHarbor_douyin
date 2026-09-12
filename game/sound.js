/**
 * 音效管理器
 * Web 环境：使用 Web Audio API + 预加载 AudioBuffer，极低延迟
 * 小程序环境：使用 InnerAudioContext
 */

var _api = typeof tt !== 'undefined' ? tt : (typeof wx !== 'undefined' ? wx : null)
var _isWeb = typeof window !== 'undefined' && window.document

const SOUND_MAP = {
  shoot:    { src: 'audio/shoot.mp3',    vol: 0.5, vibrate: 'light' },
  damage:   { src: 'audio/damage.mp3',   vol: 0.6, vibrate: 'heavy' },
  gameover: { src: 'audio/gameover.mp3', vol: 0.7, vibrate: 'heavy' },
  wave:     { src: 'audio/wave.mp3',     vol: 0.6, vibrate: 'medium' },
  coin:     { src: 'audio/硬币.mp3',      vol: 0.65, vibrate: 'light' },
  impact:   { src: 'audio/impact.mp3',   vol: 0.5, vibrate: 'light' },
  screech:    { src: 'audio/screech.mp3',    vol: 0.5, vibrate: 'medium' },
  heavygun:   { src: 'audio/重武器.mp3',     vol: 0.7, vibrate: 'heavy' },
  planecrash: { src: 'audio/飞机坠毁.mp3',  vol: 0.8, vibrate: 'heavy' },
}

class SoundManager {
  constructor() {
    this._initialized = false
    this._available = _isWeb || (_api && typeof _api.createInnerAudioContext === 'function')
    this._contexts = {}
    this._bgm = null
    // Web: Audio 元素池（避免 XHR，兼容 file:// 协议）
    this._audioPools = {}
    this._webBgm = null
  }

  init() {
    if (this._initialized) return true
    if (_isWeb) {
      return this._initWebAudio()
    }
    if (!this._available) return false
    try {
      this._initialized = true
      console.log('[sound] 音效管理器初始化成功')
    } catch (e) {
      this._initialized = false
      console.warn('[sound] 音效初始化失败:', e)
    }
    return this._initialized
  }

  _initWebAudio() {
    try {
      this._initialized = true
      console.log('[sound] Web Audio 初始化，使用 Audio 元素预加载...')
      // 为每个音效创建 Audio 元素池（支持重叠播放）
      var keys = Object.keys(SOUND_MAP)
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i]
        var cfg = SOUND_MAP[key]
        // 高频音效用更大的池
        var poolSize = (key === 'shoot' || key === 'impact') ? 4 : 2
        this._createPool(key, cfg.src, cfg.vol, poolSize)
      }
      return true
    } catch (e) {
      console.warn('[sound] Web Audio 初始化失败:', e)
      this._initialized = false
      return false
    }
  }

  _createPool(name, src, vol, size) {
    var pool = []
    for (var i = 0; i < size; i++) {
      var audio = new Audio()
      audio.preload = 'auto'
      audio.volume = vol
      audio.src = src
      pool.push(audio)
    }
    this._audioPools[name] = { pool: pool, index: 0 }
  }

  activate() {
    return this.init()
  }

  _play(name) {
    const cfg = SOUND_MAP[name]
    if (!cfg) return
    this._vibrate(cfg.vibrate)
    if (!this._initialized && !this.init()) return

    if (_isWeb) {
      this._playWebAudio(name, cfg.vol)
      return
    }

    try {
      const ctx = _api.createInnerAudioContext()
      ctx.onError((err) => { console.warn('[sound] 播放错误:', name, err) })
      ctx.onEnded(() => { try { ctx.destroy() } catch (e) {} })
      ctx.src = cfg.src
      ctx.volume = cfg.vol
      ctx.play()
    } catch (e) {
      console.warn('[sound] 音效播放失败:', name, e)
    }
  }

  _playWebAudio(name, vol) {
    var poolData = this._audioPools[name]
    if (!poolData) return
    var audio = poolData.pool[poolData.index]
    poolData.index = (poolData.index + 1) % poolData.pool.length
    try {
      audio.currentTime = 0
      audio.volume = vol
      audio.play().catch(function(e) {})
    } catch (e) {}
  }

  playShoot()    { this._play('shoot') }
  playDamage()   { this._play('damage') }
  playGameOver() { this._play('gameover') }
  playWave()     { this._play('wave') }
  playCoin()     { this._play('coin') }
  playImpact()   { this._play('impact') }
  playScreech()    { this._play('screech') }
  playHeavyGun()   { this._play('heavygun') }
  playPlaneCrash() { this._play('planecrash') }

  // 背景音乐
  playBGMIntro() {
    if (!this._initialized && !this.init()) return
    this.stopBGM()

    if (_isWeb) {
      this._playBGMWeb(SoundManager.BGM_VOL_INTRO)
      return
    }

    try {
      this._bgm = _api.createInnerAudioContext()
      this._bgm.onError((err) => { console.warn('BGM播放失败:', err) })
      this._bgm.src = SoundManager.BGM_PATH
      this._bgm.loop = true
      this._bgm.autoplay = true
      this._bgm.volume = SoundManager.BGM_VOL_INTRO
      this._bgm.play()
    } catch (e) {
      console.warn('BGM播放失败:', e)
    }
  }

  _playBGMWeb(vol) {
    try {
      this._webBgm = new Audio()
      this._webBgm.src = SoundManager.BGM_PATH
      this._webBgm.loop = true
      this._webBgm.volume = vol
      this._webBgm.play().catch(function(e) {
        console.warn('[sound] BGM 播放被阻止（需用户交互）:', e)
      })
    } catch (e) {
      console.warn('[sound] BGM 播放失败:', e)
    }
  }

  lowerBGM() {
    if (_isWeb && this._webBgm) {
      this._webBgm.volume = SoundManager.BGM_VOL_GAME
      return
    }
    if (this._bgm) {
      try { this._bgm.volume = SoundManager.BGM_VOL_GAME } catch (e) {}
    }
  }

  raiseBGM() {
    if (_isWeb && this._webBgm) {
      this._webBgm.volume = SoundManager.BGM_VOL_INTRO
      return
    }
    if (this._bgm) {
      try { this._bgm.volume = SoundManager.BGM_VOL_INTRO } catch (e) {}
    }
  }

  stopBGM() {
    if (_isWeb && this._webBgm) {
      try { this._webBgm.pause(); this._webBgm.currentTime = 0 } catch (e) {}
      this._webBgm = null
      return
    }
    if (this._bgm) {
      try { this._bgm.stop(); this._bgm.destroy() } catch (e) {}
      this._bgm = null
    }
  }

  pause() {
    // 暂停 BGM
    if (_isWeb && this._webBgm) {
      try { this._webBgm.pause() } catch (e) {}
    }
    if (this._bgm) {
      try { this._bgm.pause() } catch (e) {}
    }
    // 停止当前正在播放的音效
    if (_isWeb && this._audioPools) {
      for (const key of Object.keys(this._audioPools)) {
        var poolData = this._audioPools[key]
        if (poolData && poolData.pool) {
          for (var i = 0; i < poolData.pool.length; i++) {
            try { poolData.pool[i].pause() } catch (e) {}
          }
        }
      }
    }
  }

  resume() {
    if (_isWeb && this._webBgm) {
      try { this._webBgm.play().catch(function(e) {}) } catch (e) {}
      return
    }
    if (this._bgm) {
      try { this._bgm.play() } catch (e) {}
    }
  }

  _vibrate(type) {
    try {
      if (_isWeb) {
        // 通过 Flutter 桥接调用原生振动
        if (window.FlutterVibrate) {
          window.FlutterVibrate.postMessage(type || 'light')
        }
        return
      }
      if (type === 'heavy') {
        _api.vibrateLong({ fail: function(){} })
      } else {
        _api.vibrateShort({ type: type === 'medium' ? 'medium' : 'light', fail: function(){} })
      }
    } catch (e) {}
  }

  dispose() {
    this.stopBGM()
    // 清理 Web Audio 池
    for (const key of Object.keys(this._audioPools)) {
      var poolData = this._audioPools[key]
      for (var i = 0; i < poolData.pool.length; i++) {
        try { poolData.pool[i].pause(); poolData.pool[i].src = '' } catch (e) {}
      }
    }
    this._audioPools = {}
    for (const key of Object.keys(this._contexts)) {
      try { this._contexts[key].destroy() } catch (e) {}
    }
    this._contexts = {}
    this._initialized = false
  }
}

SoundManager.BGM_PATH = 'audio/bgm.mp3'
SoundManager.BGM_VOL_INTRO = 0.6
SoundManager.BGM_VOL_GAME = 0.35

module.exports = { SoundManager }
