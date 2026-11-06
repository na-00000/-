/**
 * ============================================================================
 * [Audio Engine] Web Audio API Synthesizer & 자연스러운 한국어 TTS 엔진
 * - 목소리 갈라짐(Pitch Shifting 왜곡) 원천 차단: 원음 피치(1.0) 및 자연스러운 호흡 속도 적용
 * - 신경망(Natural/Neural) 한국어 청소년/청년 보이스(InJoon, Google 한국어 등) 최우선 매칭
 * - 효과음(SFX)과 음성(TTS) 간 오디오 버퍼 충돌 방지 딜레이 설계
 * ============================================================================
 */

class SoundController {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.compressor = null;
    this.speechSynth = window.speechSynthesis || null;
    this.isAudioUnlocked = false;
    this.currentUtterance = null;
    this.isMuted = false;
    this.speakTimer = null;
    this.lastSfxEndTime = 0;

    // v2 설정 키를 사용하여 기존 피치 왜곡 설정(1.18~1.30)을 자연스러운 원음(1.0)으로 자동 초기화
    const savedConfig = this.loadVoiceConfig();
    this.voiceConfig = {
      volume: 1.0,
      sfxVolume: savedConfig.sfxVolume ?? 0.75,
      // 중요: TTS 엔진의 목소리 갈라짐(위상 왜곡)을 막기 위해 기본 피치를 원음(1.0)으로 유지
      pitch: savedConfig.pitch ?? 1.0,
      rate: savedConfig.rate ?? 0.96,
      preferredVoiceURI: savedConfig.preferredVoiceURI || null,
      voicePreset: savedConfig.voicePreset || 'teen_boy'
    };

    this.availableKoreanVoices = [];
    this.selectedVoice = null;

    this.initVoices();

    const unlockHandler = () => {
      this.initAudioContext();
      window.removeEventListener('pointerdown', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
    };
    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
  }

  loadVoiceConfig() {
    try {
      return JSON.parse(localStorage.getItem('daily_korean_voice_config_v2')) || {};
    } catch (e) {
      return {};
    }
  }

  saveVoiceConfig() {
    try {
      localStorage.setItem('daily_korean_voice_config_v2', JSON.stringify(this.voiceConfig));
    } catch (e) {
      console.warn('Voice config save failed:', e);
    }
  }

  /**
   * 한국어 음성 목록 로드 및 가장 자연스러운 보이스 자동 선택
   */
  initVoices() {
    if (!this.speechSynth) return;

    const updateVoiceList = () => {
      const allVoices = this.speechSynth.getVoices() || [];
      this.availableKoreanVoices = allVoices.filter(
        v => v.lang.toLowerCase().includes('ko') || v.name.includes('한국') || v.name.toLowerCase().includes('korean')
      );

      this.selectOptimalNaturalVoice();
    };

    updateVoiceList();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = updateVoiceList;
    }
  }

  /**
   * 갈라짐 없이 가장 깨끗하고 자연스러운 한국어 청소년/남성 신경망 보이스 탐색
   * 1순위: 사용자가 직접 선택한 보이스
   * 2순위: Microsoft InJoon Online (Natural) - 가장 자연스러운 한국어 소년/청년 신경망 목소리
   * 3순위: 기타 Online (Natural) 또는 Wavenet / Neural 고품질 한국어 보이스
   * 4순위: Android/Chrome 남성 보이스 (ko-kr-x-ism-local, Standard-C, Standard-D)
   * 5순위: Google 한국의 / 기본 한국어 보이스 (원음 피치 1.0 유지로 갈라짐 방지)
   */
  selectOptimalNaturalVoice() {
    if (this.availableKoreanVoices.length === 0) return;

    if (this.voiceConfig.preferredVoiceURI) {
      const userVoice = this.availableKoreanVoices.find(v => v.voiceURI === this.voiceConfig.preferredVoiceURI);
      if (userVoice) {
        this.selectedVoice = userVoice;
        return;
      }
    }

    const priorityMatchers = [
      // 1순위: Microsoft InJoon Natural (고품질 신경망 남성/청소년 보이스)
      v => /injoon|인준/i.test(v.name + v.voiceURI) && /natural|online/i.test(v.name + v.voiceURI),
      v => /injoon|인준|bongjin|봉진|gookmin|국민/i.test(v.name + v.voiceURI),
      // 2순위: Google/Android 고품질 남성 보이스
      v => /wavenet-c|wavenet-d|standard-c|standard-d|ko-kr-x-ism/i.test(v.name + v.voiceURI),
      // 3순위: 기타 Natural/Online 신경망 한국어 보이스 (음질 최우선)
      v => /natural|online|wavenet|neural/i.test(v.name + v.voiceURI),
      // 4순위: Google 한국어 기본 보이스
      v => /google|구글/i.test(v.name + v.voiceURI)
    ];

    for (const matcher of priorityMatchers) {
      const matched = this.availableKoreanVoices.find(matcher);
      if (matched) {
        this.selectedVoice = matched;
        return;
      }
    }

    this.selectedVoice = this.availableKoreanVoices[0];
  }

  /**
   * 프리셋 변경 (기계적 갈라짐이 발생하지 않는 안전한 원음 대역 0.96 ~ 1.04 내에서만 조절)
   */
  setVoicePreset(presetName) {
    this.voiceConfig.voicePreset = presetName;
    if (presetName === 'teen_boy') {
      this.voiceConfig.pitch = 1.0;
      this.voiceConfig.rate = 0.96;
    } else if (presetName === 'bright_boy') {
      this.voiceConfig.pitch = 1.04;
      this.voiceConfig.rate = 1.0;
    } else if (presetName === 'calm_boy') {
      this.voiceConfig.pitch = 0.96;
      this.voiceConfig.rate = 0.88;
    }
    this.saveVoiceConfig();
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        this.compressor = this.audioCtx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-16, this.audioCtx.currentTime);
        this.compressor.knee.setValueAtTime(24, this.audioCtx.currentTime);
        this.compressor.ratio.setValueAtTime(4, this.audioCtx.currentTime);
        this.compressor.attack.setValueAtTime(0.005, this.audioCtx.currentTime);
        this.compressor.release.setValueAtTime(0.2, this.audioCtx.currentTime);

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(1.1, this.audioCtx.currentTime);

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.audioCtx.destination);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.isAudioUnlocked = true;
  }

  getDestination() {
    this.initAudioContext();
    return this.masterGain || (this.audioCtx ? this.audioCtx.destination : null);
  }

  // --------------------------------------------------------------------------
  // Web Audio API 사운드 신시사이저 (TTS와 겹치지 않도록 깔끔하고 부드럽게 출력)
  // --------------------------------------------------------------------------

  playClick() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.25 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.07);
      this.lastSfxEndTime = Date.now() + 80;
    } catch (e) {
      console.warn('Audio click error:', e);
    }
  }

  playSuccess() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const noteDuration = 0.075;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + idx * noteDuration;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.32 * this.voiceConfig.sfxVolume, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration * 1.4);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + noteDuration * 1.4);
      });
      this.lastSfxEndTime = Date.now() + 360;
    } catch (e) {
      console.warn('Audio success error:', e);
    }
  }

  playRetry() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(349.23, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(261.63, ctx.currentTime + 0.22);

      gain.gain.setValueAtTime(0.3 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.26);
      this.lastSfxEndTime = Date.now() + 270;
    } catch (e) {
      console.warn('Audio retry error:', e);
    }
  }

  playStepComplete() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const st = ctx.currentTime + idx * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(0.26 * this.voiceConfig.sfxVolume, st + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.22);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(st);
        osc.stop(st + 0.22);
      });
      this.lastSfxEndTime = Date.now() + 340;
    } catch (e) {
      console.warn('Audio step error:', e);
    }
  }

  playFanfare() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const melody = [
        { f: 523.25, t: 0.0, d: 0.10 },
        { f: 659.25, t: 0.10, d: 0.10 },
        { f: 783.99, t: 0.20, d: 0.10 },
        { f: 1046.5, t: 0.30, d: 0.25 },
        { f: 783.99, t: 0.55, d: 0.10 },
        { f: 1046.5, t: 0.65, d: 0.45 }
      ];

      melody.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const st = ctx.currentTime + note.t;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.f, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(0.32 * this.voiceConfig.sfxVolume, st + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, st + note.d);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(st);
        osc.stop(st + note.d);
      });
      this.lastSfxEndTime = Date.now() + 1100;
    } catch (e) {
      console.warn('Audio fanfare error:', e);
    }
  }

  // --------------------------------------------------------------------------
  // 자연스러운 한국어 TTS 발화 처리 (갈라짐 방지 & 억양 최적화)
  // --------------------------------------------------------------------------

  /**
   * TTS 엔진이 억양을 과도하게 높여 목소리가 갈라지는 현상을 막기 위한 문장 정제
   * - 느낌표(!)를 마침표(.)로 완화하여 끝음 갈라짐 방지
   * - 슬래시(/)를 쉼표(, )로 변환하여 급식 메뉴를 자연스럽게 낭독
   */
  cleanTextForNaturalSpeech(rawText) {
    if (!rawText) return '';
    return String(rawText)
      .replace(/\//g, ', ')
      .replace(/[!]+/g, '.')
      .replace(/[~]+/g, ' ')
      .replace(/['"“”‘’]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 자연스럽고 깨끗한 목소리로 읽기
   * @param {string} text 읽을 텍스트
   * @param {Function} onEnd 종료 콜백
   */
  speak(text, onEnd) {
    if (!this.speechSynth || !text) {
      if (onEnd) onEnd();
      return;
    }

    clearTimeout(this.speakTimer);

    try {
      if (this.speechSynth.speaking || this.speechSynth.pending) {
        this.speechSynth.cancel();
      }

      // 효과음(SFX) 재생 직후라면 오디오 드라이버 충돌로 인한 지직거림/갈라짐을 막기 위해 대기
      const now = Date.now();
      const waitMs = Math.max(90, this.lastSfxEndTime - now + 40);

      this.speakTimer = setTimeout(() => {
        if (this.availableKoreanVoices.length === 0) {
          this.initVoices();
        }

        const cleanText = this.cleanTextForNaturalSpeech(text);
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ko-KR';
        utterance.volume = 1.0;

        if (this.selectedVoice) {
          utterance.voice = this.selectedVoice;
          utterance.lang = this.selectedVoice.lang || 'ko-KR';
        }

        // 핵심: 피치(pitch)를 인위적으로 높이면(1.15 이상) 보코더 위상이 깨져 목소리가 갈라지므로
        // 원음 피치(1.0)를 기본 적용하여 사람처럼 매끄러운 음질을 보장합니다.
        const safePitch = Math.min(1.08, Math.max(0.92, this.voiceConfig.pitch || 1.0));
        const safeRate = Math.min(1.15, Math.max(0.75, this.voiceConfig.rate || 0.96));

        utterance.pitch = safePitch;
        utterance.rate = safeRate;

        const speakerBtns = document.querySelectorAll('.tts-speaker-btn');
        speakerBtns.forEach(btn => btn.classList.add('is-speaking'));

        let callbackCalled = false;
        const finishCallback = () => {
          if (callbackCalled) return;
          callbackCalled = true;
          speakerBtns.forEach(btn => btn.classList.remove('is-speaking'));
          if (onEnd) onEnd();
        };

        utterance.onend = finishCallback;
        utterance.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') {
            console.warn('TTS error:', e);
          }
          finishCallback();
        };

        this.currentUtterance = utterance;
        this.speechSynth.speak(utterance);
      }, waitMs);
    } catch (err) {
      console.warn('Speech synthesis exception:', err);
      if (onEnd) onEnd();
    }
  }

  stopSpeaking() {
    clearTimeout(this.speakTimer);
    if (this.speechSynth) {
      this.speechSynth.cancel();
    }
    const speakerBtns = document.querySelectorAll('.tts-speaker-btn');
    speakerBtns.forEach(btn => btn.classList.remove('is-speaking'));
  }
}

window.soundCtrl = new SoundController();
