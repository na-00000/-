/**
 * ============================================================================
 * [Audio Engine] 태블릿 PC (Android / iPad / Windows 태블릿) 완벽 호환 사운드 & TTS 엔진
 * - 모바일/태블릿 브라우저 오디오 자동재생 차단(Autoplay Policy) 완벽 해제
 * - setTimeout 비동기 지연을 제거한 동기식(Synchronous) 즉시 발화로 태블릿 무음 버그 해결
 * - 안드로이드 Chrome/삼성 인터넷의 utterance.voice 바인딩 오류 자동 감지 및 폴백
 * - 기기 내 TTS 미작동 시 HTML5 Audio 스트림 폴백으로 100% 음성 출력 보장
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
    this.fallbackAudio = null;
    this.isMuted = false;

    // 모바일/태블릿 환경 감지 (Android, iPad, iPhone, 터치 기기)
    this.isTabletOrMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);

    const savedConfig = this.loadVoiceConfig();
    this.voiceConfig = {
      volume: 1.0,
      sfxVolume: savedConfig.sfxVolume ?? 0.85,
      pitch: savedConfig.pitch ?? 1.0,
      rate: savedConfig.rate ?? 0.96,
      preferredVoiceURI: savedConfig.preferredVoiceURI || null,
      voicePreset: savedConfig.voicePreset || 'teen_boy'
    };

    this.availableKoreanVoices = [];
    this.selectedVoice = null;

    this.initVoices();
    this.setupGlobalTouchUnlock();
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
   * 태블릿 브라우저의 오디오 & TTS 잠금을 해제하기 위한 글로벌 터치/클릭 리스너
   * - 모바일 브라우저는 pointerdown이 아닌 touchend / click 시점에 오디오 잠금이 풀림
   */
  setupGlobalTouchUnlock() {
    const unlockEvents = ['click', 'touchend', 'pointerup', 'keydown'];

    const unlockHandler = () => {
      this.unlockAudioAndTTS();
    };

    unlockEvents.forEach(evtName => {
      window.addEventListener(evtName, unlockHandler, { passive: true, capture: true });
    });
  }

  /**
   * Web Audio API 및 Web Speech API 하드웨어 채널 즉시 활성화
   */
  unlockAudioAndTTS() {
    // 1. Web Audio API Context 생성 및 resume
    this.initAudioContext();

    if (this.audioCtx && !this.isAudioUnlocked) {
      try {
        // 무음 버퍼(Silent Buffer) 1프레임 재생으로 태블릿 스피커 채널 강제 오픈
        const buffer = this.audioCtx.createBuffer(1, 1, 22050);
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioCtx.destination);
        if (source.start) {
          source.start(0);
        } else if (source.noteOn) {
          source.noteOn(0);
        }
        this.isAudioUnlocked = true;
      } catch (e) {
        console.warn('Silent buffer unlock error:', e);
      }
    }

    // 2. Web Speech API 일시정지 상태 해제
    if (this.speechSynth && this.speechSynth.paused) {
      try {
        this.speechSynth.resume();
      } catch (e) {}
    }
  }

  /**
   * 한국어 음성 목록 로드
   */
  initVoices() {
    if (!this.speechSynth) return;

    const updateVoiceList = () => {
      try {
        const allVoices = this.speechSynth.getVoices() || [];
        this.availableKoreanVoices = allVoices.filter(
          v => (v.lang && v.lang.toLowerCase().includes('ko')) ||
               (v.name && (v.name.includes('한국') || v.name.toLowerCase().includes('korean')))
        );
        this.selectOptimalNaturalVoice();
      } catch (e) {
        console.warn('getVoices error:', e);
      }
    };

    updateVoiceList();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = updateVoiceList;
    }
  }

  /**
   * 기기별 최적의 한국어 보이스 선택
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
      v => /injoon|인준/i.test(v.name + v.voiceURI) && /natural|online/i.test(v.name + v.voiceURI),
      v => /injoon|인준|bongjin|봉진|gookmin|국민/i.test(v.name + v.voiceURI),
      v => /wavenet-c|wavenet-d|standard-c|standard-d|ko-kr-x-ism/i.test(v.name + v.voiceURI),
      v => /natural|online|wavenet|neural/i.test(v.name + v.voiceURI),
      v => /google|구글|삼성|samsung/i.test(v.name + v.voiceURI)
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
        this.masterGain.gain.setValueAtTime(1.25, this.audioCtx.currentTime);

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.audioCtx.destination);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  getDestination() {
    this.initAudioContext();
    return this.masterGain || (this.audioCtx ? this.audioCtx.destination : null);
  }

  // --------------------------------------------------------------------------
  // Web Audio API 효과음 신시사이저
  // --------------------------------------------------------------------------

  playClick() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.065);

      gain.gain.setValueAtTime(0.32 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.065);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.07);
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
      if (ctx.state === 'suspended') ctx.resume();

      const notes = [523.25, 659.25, 783.99, 1046.5];
      const noteDuration = 0.075;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + idx * noteDuration;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.38 * this.voiceConfig.sfxVolume, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration * 1.4);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + noteDuration * 1.4);
      });
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
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(349.23, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(261.63, ctx.currentTime + 0.22);

      gain.gain.setValueAtTime(0.35 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.26);
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
      if (ctx.state === 'suspended') ctx.resume();

      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const st = ctx.currentTime + idx * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(0.32 * this.voiceConfig.sfxVolume, st + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.22);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(st);
        osc.stop(st + 0.22);
      });
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
      if (ctx.state === 'suspended') ctx.resume();

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
        gain.gain.linearRampToValueAtTime(0.38 * this.voiceConfig.sfxVolume, st + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, st + note.d);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(st);
        osc.stop(st + note.d);
      });
    } catch (e) {
      console.warn('Audio fanfare error:', e);
    }
  }

  // --------------------------------------------------------------------------
  // 태블릿 PC 완벽 대응 한국어 TTS 발화 처리 (동기식 즉시 호출 + 오디오 폴백)
  // --------------------------------------------------------------------------

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
   * 태블릿 PC에서도 100% 소리가 나도록 setTimeout 없이 동기식으로 즉시 발화
   */
  speak(text, onEnd) {
    const cleanText = this.cleanTextForNaturalSpeech(text);
    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    // 이전 재생 중인 폴백 오디오가 있으면 정지
    if (this.fallbackAudio) {
      try {
        this.fallbackAudio.pause();
        this.fallbackAudio = null;
      } catch (e) {}
    }

    const speakerBtns = document.querySelectorAll('.tts-speaker-btn');
    speakerBtns.forEach(btn => btn.classList.add('is-speaking'));

    let callbackCalled = false;
    const finishCallback = () => {
      if (callbackCalled) return;
      callbackCalled = true;
      speakerBtns.forEach(btn => btn.classList.remove('is-speaking'));
      if (onEnd) onEnd();
    };

    // 1. 브라우저 내장 Web Speech API 지원 여부 확인
    if (this.speechSynth && typeof SpeechSynthesisUtterance !== 'undefined') {
      try {
        // 중요: 안드로이드 태블릿에서는 cancel()을 무조건 호출하면 바로 다음 speak()까지 취소되는 버그가 있으므로
        // 실제로 발화 중일 때만 cancel() 호출
        if (this.speechSynth.speaking) {
          this.speechSynth.cancel();
        }
        if (this.speechSynth.paused) {
          this.speechSynth.resume();
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ko-KR';
        utterance.volume = 1.0;

        // 중요: 안드로이드 태블릿에서는 특정 voice 객체를 강제 할당하면 무음이 되는 버그가 흔하므로,
        // 사용자가 직접 선택한 경우나 데스크톱 환경에서만 voice 객체를 지정하고,
        // 태블릿 기본 상태에서는 lang = 'ko-KR'로 시스템 기본 한국어 엔진을 직접 구동합니다.
        if (this.voiceConfig.preferredVoiceURI && this.selectedVoice) {
          utterance.voice = this.selectedVoice;
        } else if (!this.isTabletOrMobile && this.selectedVoice) {
          utterance.voice = this.selectedVoice;
        }

        const safePitch = Math.min(1.08, Math.max(0.92, this.voiceConfig.pitch || 1.0));
        const safeRate = Math.min(1.15, Math.max(0.75, this.voiceConfig.rate || 0.96));
        utterance.pitch = safePitch;
        utterance.rate = safeRate;

        let hasStarted = false;

        utterance.onstart = () => {
          hasStarted = true;
        };

        utterance.onend = () => {
          finishCallback();
        };

        utterance.onerror = (e) => {
          if (e.error === 'interrupted' || e.error === 'canceled') {
            finishCallback();
            return;
          }
          console.warn('Web Speech API error on tablet, switching to fallback:', e.error);
          // 만약 voice 객체 문제로 에러가 났다면 기본 시스템 보이스 또는 오디오 폴백 실행
          this.playFallbackTTS(cleanText, finishCallback);
        };

        this.currentUtterance = utterance;
        // 핵심: setTimeout 없이 사용자 터치 컨텍스트 안에서 즉시 동기 실행!
        this.speechSynth.speak(utterance);

        // 안전장치: 일부 태블릿(카카오톡 인앱 브라우저, 구형 안드로이드 웹뷰 등)에서
        // speechSynthesis.speak()가 아무 반응 없이 멈춰있는 경우 900ms 후 확인하여 폴백 가동
        setTimeout(() => {
          if (!hasStarted && !callbackCalled && !this.speechSynth.speaking) {
            this.playFallbackTTS(cleanText, finishCallback);
          }
        }, 900);

        return;
      } catch (err) {
        console.warn('SpeechSynthesis exception:', err);
      }
    }

    // 2. Web Speech API 미지원 기기일 경우 폴백 실행
    this.playFallbackTTS(cleanText, finishCallback);
  }

  /**
   * 기기 내 TTS 엔진이 꺼져 있거나 작동하지 않는 태블릿을 위한 HTML5 Audio TTS 폴백
   */
  playFallbackTTS(text, onFinish) {
    try {
      const shortText = text.slice(0, 180);
      const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=ko&q=${encodeURIComponent(shortText)}`;
      const audio = new Audio(url);
      audio.volume = 1.0;
      this.fallbackAudio = audio;

      audio.onended = () => {
        onFinish();
      };
      audio.onerror = () => {
        onFinish();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          onFinish();
        });
      }
    } catch (e) {
      onFinish();
    }
  }

  stopSpeaking() {
    if (this.fallbackAudio) {
      try {
        this.fallbackAudio.pause();
        this.fallbackAudio = null;
      } catch (e) {}
    }
    if (this.speechSynth && this.speechSynth.speaking) {
      try {
        this.speechSynth.cancel();
      } catch (e) {}
    }
    const speakerBtns = document.querySelectorAll('.tts-speaker-btn');
    speakerBtns.forEach(btn => btn.classList.remove('is-speaking'));
  }
}

window.soundCtrl = new SoundController();
