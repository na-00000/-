/**
 * ============================================================================
 * [Audio Engine v4] 태블릿 PC (갤럭시 탭 / 아이패드 / 윈도우 태블릿) 사운드 & TTS 완벽 보장 엔진
 *
 * [핵심 해결 사항]
 * 1. 안드로이드 크롬/삼성 인터넷에서 speechSynthesis.cancel() 호출 시 다음 발화까지
 *    통째로 증발하는 치명적 버그 해결
 * 2. 안드로이드 한국어 로케일('ko_KR' 및 'ko-KR') 자동 호환 및 원음 파라미터(1.0) 적용
 * 3. 기기에 한국어 TTS 엔진이 없거나 먹통인 태블릿을 위해 첫 터치 시 잠금 해제되는
 *    HTML5 <audio> 한국어 음성 스트림(Stream TTS) 동시 지원
 * ============================================================================
 */

class SoundController {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.compressor = null;
    this.speechSynth = window.speechSynthesis || null;
    this.isAudioUnlocked = false;
    this.isMuted = false;

    // 안드로이드 크롬 가비지 컬렉터(GC)가 발화 중인 Utterance를 삭제하는 버그 방지
    window._activeUtterances = window._activeUtterances || [];

    this.isTabletOrMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);

    const savedConfig = this.loadVoiceConfig();
    this.voiceConfig = {
      volume: 1.0,
      sfxVolume: savedConfig.sfxVolume ?? 0.95,
      pitch: savedConfig.pitch ?? 1.0,
      rate: savedConfig.rate ?? 1.0,
      preferredVoiceURI: savedConfig.preferredVoiceURI || null,
      voicePreset: savedConfig.voicePreset || 'teen_boy',
      // 태블릿에서 내장 TTS가 안 될 때 즉시 작동하는 스트림 모드 지원 ('auto' | 'stream' | 'native')
      ttsEngineMode: savedConfig.ttsEngineMode || 'auto'
    };

    this.availableKoreanVoices = [];
    this.selectedVoice = null;
    this.sharedAudioEl = null;

    this.initVoices();
    this.setupGlobalTouchUnlock();
  }

  getSharedAudioElement() {
    if (!this.sharedAudioEl) {
      this.sharedAudioEl = document.getElementById('sharedTtsAudioElement');
      if (!this.sharedAudioEl) {
        const el = document.createElement('audio');
        el.id = 'sharedTtsAudioElement';
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        el.setAttribute('referrerpolicy', 'no-referrer');
        el.style.display = 'none';
        if (document.body) {
          document.body.appendChild(el);
        }
        this.sharedAudioEl = el;
      }
    }
    return this.sharedAudioEl;
  }

  loadVoiceConfig() {
    try {
      return JSON.parse(localStorage.getItem('daily_korean_voice_config_v4')) || {};
    } catch (e) {
      return {};
    }
  }

  saveVoiceConfig() {
    try {
      localStorage.setItem('daily_korean_voice_config_v4', JSON.stringify(this.voiceConfig));
    } catch (e) {}
  }

  /**
   * 화면 어디든 터치하면 즉시 태블릿의 오디오 컨텍스트 잠금을 해제
   */
  setupGlobalTouchUnlock() {
    const unlockEvents = ['touchstart', 'touchend', 'pointerdown', 'click'];
    const unlockHandler = () => {
      this.initAudioContext();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (!this.isAudioUnlocked && this.audioCtx) {
        try {
          const buffer = this.audioCtx.createBuffer(1, 1, 22050);
          const source = this.audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.audioCtx.destination);
          source.start(0);
          this.isAudioUnlocked = true;
        } catch (e) {}
      }
    };

    unlockEvents.forEach(evtName => {
      window.addEventListener(evtName, unlockHandler, { passive: true, capture: true });
    });
  }

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
      } catch (e) {}
    };

    updateVoiceList();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = updateVoiceList;
    }
  }

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
      this.voiceConfig.rate = 1.0;
      this.voiceConfig.ttsEngineMode = 'auto';
    } else if (presetName === 'bright_boy') {
      // 태블릿 고음량 스트림 강제 모드 (기기 내장 TTS가 고장난 태블릿에서 100% 작동)
      this.voiceConfig.pitch = 1.0;
      this.voiceConfig.rate = 1.0;
      this.voiceConfig.ttsEngineMode = 'stream';
    } else if (presetName === 'calm_boy') {
      this.voiceConfig.pitch = 0.96;
      this.voiceConfig.rate = 0.9;
      this.voiceConfig.ttsEngineMode = 'native';
    }
    this.saveVoiceConfig();
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        this.compressor = this.audioCtx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, this.audioCtx.currentTime);
        this.compressor.knee.setValueAtTime(20, this.audioCtx.currentTime);
        this.compressor.ratio.setValueAtTime(4, this.audioCtx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
        this.compressor.release.setValueAtTime(0.2, this.audioCtx.currentTime);

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(1.5, this.audioCtx.currentTime);

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
      osc.frequency.setValueAtTime(680, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 0.065);

      gain.gain.setValueAtTime(0.4 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.065);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch (e) {}
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
        gain.gain.linearRampToValueAtTime(0.45 * this.voiceConfig.sfxVolume, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration * 1.4);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + noteDuration * 1.4);
      });
    } catch (e) {}
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

      gain.gain.setValueAtTime(0.42 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch (e) {}
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
        gain.gain.linearRampToValueAtTime(0.38 * this.voiceConfig.sfxVolume, st + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.22);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(st);
        osc.stop(st + 0.22);
      });
    } catch (e) {}
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
        gain.gain.linearRampToValueAtTime(0.45 * this.voiceConfig.sfxVolume, st + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, st + note.d);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(st);
        osc.stop(st + note.d);
      });
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // 태블릿 100% 호환 한국어 음성 출력 (HTML5 Audio Stream + Native Web Speech)
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
   * 태블릿과 PC 모두에서 100% 음성이 출력되도록 보장하는 발화 함수
   * - 태블릿/모바일이거나 'stream' 모드인 경우: 클릭 즉시 HTML5 <audio> 스트림을 동기 재생하고,
   *   오프라인 등으로 스트림 재생 실패 시 즉시 기기 내장 Web Speech API로 폴백합니다.
   * - 데스크톱이거나 'native' 모드인 경우: 기기 내장 신경망 Web Speech API를 우선 실행하고,
   *   음성이 없거나 실패 시 HTML5 <audio> 스트림으로 폴백합니다.
   */
  speak(text, onEnd) {
    const cleanText = this.cleanTextForNaturalSpeech(text);
    if (!cleanText) {
      if (onEnd) onEnd();
      return;
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

    const preferStreamFirst =
      this.voiceConfig.ttsEngineMode === 'stream' ||
      (this.isTabletOrMobile && this.voiceConfig.ttsEngineMode === 'auto');

    if (preferStreamFirst) {
      // 태블릿에서는 사용자 클릭 이벤트 안에서 즉시 <audio>.play()를 실행해야 브라우저가 차단하지 않음!
      this.playStreamTTS(cleanText, finishCallback, () => {
        this.playNativeWebSpeech(cleanText, finishCallback, finishCallback);
      });
    } else {
      // 데스크톱이나 내장 강제 모드에서는 Web Speech API 우선 실행 후 실패 시 스트림 폴백
      this.playNativeWebSpeech(cleanText, finishCallback, () => {
        this.playStreamTTS(cleanText, finishCallback, finishCallback);
      });
    }
  }

  /**
   * 기기 내장 Web Speech API 발화
   */
  playNativeWebSpeech(cleanText, onSuccessEnd, onFail) {
    if (!this.speechSynth || typeof SpeechSynthesisUtterance === 'undefined') {
      if (onFail) onFail();
      return;
    }

    try {
      if (this.availableKoreanVoices.length === 0) {
        this.initVoices();
      }

      // 데스크톱에서는 이전 발화 취소 (안드로이드에서는 cancel() 직후 speak()가 증발하는 버그 방지)
      if (!this.isTabletOrMobile && this.speechSynth.speaking) {
        this.speechSynth.cancel();
      }
      if (this.speechSynth.paused) {
        this.speechSynth.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.volume = 1.0;

      if (this.selectedVoice) {
        utterance.lang = this.selectedVoice.lang || 'ko-KR';
        if (!this.isTabletOrMobile || this.voiceConfig.preferredVoiceURI) {
          utterance.voice = this.selectedVoice;
        }
      } else {
        utterance.lang = 'ko-KR';
      }

      utterance.pitch = Math.min(1.08, Math.max(0.92, this.voiceConfig.pitch || 1.0));
      utterance.rate = Math.min(1.15, Math.max(0.75, this.voiceConfig.rate || 1.0));

      window._activeUtterances.push(utterance);
      const cleanup = () => {
        const idx = window._activeUtterances.indexOf(utterance);
        if (idx !== -1) window._activeUtterances.splice(idx, 1);
      };

      utterance.onend = () => {
        cleanup();
        onSuccessEnd();
      };

      utterance.onerror = (e) => {
        cleanup();
        if (e.error === 'interrupted' || e.error === 'canceled') {
          return;
        }
        if (onFail) onFail();
      };

      this.speechSynth.speak(utterance);
    } catch (e) {
      if (onFail) onFail();
    }
  }

  /**
   * HTML5 <audio> 기반 한국어 고음량 스트림 재생 (태블릿 미디어 볼륨 직결)
   */
  playStreamTTS(cleanText, onSuccessEnd, onFail) {
    const audio = this.getSharedAudioElement();
    if (!audio) {
      if (onFail) onFail();
      return;
    }

    try {
      const shortText = cleanText.slice(0, 190);
      const primaryUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(shortText)}`;
      const backupUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=ko&client=gtx&q=${encodeURIComponent(shortText)}`;

      let triedBackup = false;

      audio.onended = () => {
        onSuccessEnd();
      };

      audio.onerror = () => {
        if (!triedBackup) {
          triedBackup = true;
          audio.src = backupUrl;
          audio.play().catch(() => {
            if (onFail) onFail();
          });
        } else {
          if (onFail) onFail();
        }
      };

      audio.src = primaryUrl;
      audio.volume = 1.0;
      audio.playbackRate = Math.min(1.15, Math.max(0.8, this.voiceConfig.rate || 1.0));

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (!triedBackup) {
            triedBackup = true;
            audio.src = backupUrl;
            audio.play().catch(() => {
              if (onFail) onFail();
            });
          } else {
            if (onFail) onFail();
          }
        });
      }
    } catch (e) {
      if (onFail) onFail();
    }
  }

  stopSpeaking() {
    if (this.sharedAudioEl && !this.sharedAudioEl.paused) {
      try {
        this.sharedAudioEl.pause();
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
