/**
 * ============================================================================
 * [Audio Engine] Web Audio API Synthesizer & Web Speech API (TTS) 고도화 버전
 * - 한국어 청소년 남자아이(소년) 목소리 최적 매칭 및 피치/속도 튜닝
 * - TTS 음량 최대화(1.0) 및 효과음 더킹(Ducking)으로 선명한 음성 전달
 * - Web Audio API DynamicsCompressor + Gain 증폭으로 또렷한 음향 피드백
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

    // 청소년 남자아이 음성 프로필 기본 설정 (LocalStorage 연동)
    const savedConfig = this.loadVoiceConfig();
    this.voiceConfig = {
      volume: 1.0,           // 최대 음량
      sfxVolume: savedConfig.sfxVolume ?? 0.85,
      pitch: savedConfig.pitch ?? 1.18, // 활기찬 청소년 남자아이 톤
      rate: savedConfig.rate ?? 0.95,   // 또렷하고 생동감 있는 속도
      preferredVoiceURI: savedConfig.preferredVoiceURI || null,
      voicePreset: savedConfig.voicePreset || 'teen_boy' // 'teen_boy' | 'bright_boy' | 'calm_boy'
    };

    this.availableKoreanVoices = [];
    this.selectedVoice = null;

    this.initVoices();

    // 브라우저 첫 인터랙션 시 오디오 컨텍스트 즉시 활성화
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
      return JSON.parse(localStorage.getItem('daily_korean_voice_config')) || {};
    } catch (e) {
      return {};
    }
  }

  saveVoiceConfig() {
    try {
      localStorage.setItem('daily_korean_voice_config', JSON.stringify(this.voiceConfig));
    } catch (e) {
      console.warn('Voice config save failed:', e);
    }
  }

  /**
   * 한국어 음성 목록 로드 및 '청소년 남자아이' 최적 보이스 자동 선택
   */
  initVoices() {
    if (!this.speechSynth) return;

    const updateVoiceList = () => {
      const allVoices = this.speechSynth.getVoices() || [];
      this.availableKoreanVoices = allVoices.filter(
        v => v.lang.toLowerCase().includes('ko') || v.name.includes('한국') || v.name.toLowerCase().includes('korean')
      );

      this.selectOptimalTeenBoyVoice();
    };

    updateVoiceList();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = updateVoiceList;
    }
  }

  /**
   * 한국어에 최적화된 청소년 남자아이 보이스 자동 탐색
   * 1순위: 사용자가 직접 지정한 보이스
   * 2순위: Microsoft InJoon (가장 자연스러운 한국어 소년/청년 보이스), BongJin, GookMin
   * 3순위: Google/Android 한국어 남성 보이스 (ko-kr-x-ism, Standard-C, Standard-D, Wavenet-C/D)
   * 4순위: 이름에 Male / 남성 포함된 한국어 보이스
   * 5순위: 기본 한국어 보이스 + 소년 피치 모듈레이션
   */
  selectOptimalTeenBoyVoice() {
    if (this.availableKoreanVoices.length === 0) return;

    // 1. 사용자 지정 보이스 확인
    if (this.voiceConfig.preferredVoiceURI) {
      const userVoice = this.availableKoreanVoices.find(v => v.voiceURI === this.voiceConfig.preferredVoiceURI);
      if (userVoice) {
        this.selectedVoice = userVoice;
        return;
      }
    }

    // 2. 청소년/남성 특화 보이스 우선순위 키워드
    const priorityKeywords = [
      'injoon', '인준',
      'ko-kr-x-ism', 'ism-local', 'ism-network',
      'standard-c', 'standard-d', 'wavenet-c', 'wavenet-d',
      'bongjin', '봉진', 'gookmin', '국민',
      'male', '남성', 'man', 'boy'
    ];

    for (const keyword of priorityKeywords) {
      const matched = this.availableKoreanVoices.find(
        v => v.name.toLowerCase().includes(keyword) || v.voiceURI.toLowerCase().includes(keyword)
      );
      if (matched) {
        this.selectedVoice = matched;
        return;
      }
    }

    // 3. Google 한국어 또는 기본 한국어 보이스
    const googleKo = this.availableKoreanVoices.find(v => v.name.includes('Google') || v.name.includes('구글'));
    this.selectedVoice = googleKo || this.availableKoreanVoices[0];
  }

  /**
   * 프리셋 변경 ('teen_boy': 활기찬 청소년 소년, 'bright_boy': 명랑한 소년, 'calm_boy': 차분한 소년)
   */
  setVoicePreset(presetName) {
    this.voiceConfig.voicePreset = presetName;
    if (presetName === 'teen_boy') {
      this.voiceConfig.pitch = 1.18;
      this.voiceConfig.rate = 0.95;
    } else if (presetName === 'bright_boy') {
      this.voiceConfig.pitch = 1.30;
      this.voiceConfig.rate = 1.0;
    } else if (presetName === 'calm_boy') {
      this.voiceConfig.pitch = 1.05;
      this.voiceConfig.rate = 0.88;
    }
    this.saveVoiceConfig();
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        // 컴프레서 및 마스터 게인으로 음량 증폭 및 클리핑 방지
        this.compressor = this.audioCtx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-18, this.audioCtx.currentTime);
        this.compressor.knee.setValueAtTime(20, this.audioCtx.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.audioCtx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
        this.compressor.release.setValueAtTime(0.2, this.audioCtx.currentTime);

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(1.35, this.audioCtx.currentTime);

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
  // Web Audio API 사운드 신시사이저 (선명하고 큰 볼륨 지원)
  // --------------------------------------------------------------------------

  /** 1. 버튼 탭/클릭 피드백 */
  playClick() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(720, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.35 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch (e) {
      console.warn('Audio click error:', e);
    }
  }

  /** 2. 정답/성공 효과음 (경쾌한 도-미-솔-도 마림바 아르페지오) */
  playSuccess() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const noteDuration = 0.085;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + idx * noteDuration;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.42 * this.voiceConfig.sfxVolume, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration * 1.6);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(startTime);
        osc.stop(startTime + noteDuration * 1.6);
      });
    } catch (e) {
      console.warn('Audio success error:', e);
    }
  }

  /** 3. 오답 재시도 효과음 (다정하고 명확한 하강음 "다시 써보자!") */
  playRetry() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(349.23, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(261.63, ctx.currentTime + 0.26);

      gain.gain.setValueAtTime(0.4 * this.voiceConfig.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.30);

      osc.connect(gain);
      gain.connect(dest);

      osc.start();
      osc.stop(ctx.currentTime + 0.31);
    } catch (e) {
      console.warn('Audio retry error:', e);
    }
  }

  /** 4. 단계 완료 효과음 (상승 화음) */
  playStepComplete() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const chords = [
        { freqs: [392.0, 493.88, 587.33], start: 0, dur: 0.14 },
        { freqs: [523.25, 659.25, 783.99, 1046.5], start: 0.14, dur: 0.28 }
      ];

      chords.forEach(chord => {
        chord.freqs.forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const st = ctx.currentTime + chord.start;

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, st);

          gain.gain.setValueAtTime(0, st);
          gain.gain.linearRampToValueAtTime(0.28 * this.voiceConfig.sfxVolume, st + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, st + chord.dur);

          osc.connect(gain);
          gain.connect(dest);

          osc.start(st);
          osc.stop(st + chord.dur);
        });
      });
    } catch (e) {
      console.warn('Audio step error:', e);
    }
  }

  /** 5. 5단계 최종 완료 축하 팡파르 */
  playFanfare() {
    if (this.isMuted) return;
    const dest = this.getDestination();
    if (!this.audioCtx || !dest) return;

    try {
      const ctx = this.audioCtx;
      const melody = [
        { f: 523.25, t: 0.0, d: 0.11 },
        { f: 659.25, t: 0.11, d: 0.11 },
        { f: 783.99, t: 0.22, d: 0.11 },
        { f: 1046.5, t: 0.33, d: 0.30 },
        { f: 783.99, t: 0.60, d: 0.11 },
        { f: 1046.5, t: 0.72, d: 0.55 }
      ];

      melody.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const st = ctx.currentTime + note.t;

        osc.type = 'triangle';
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
  // Web Speech API (TTS) 한국어 청소년 남자아이 음성 출력 (고음량 & 명료도 강화)
  // --------------------------------------------------------------------------

  /**
   * 한국어 청소년 남자아이 목소리로 또렷하고 크게 읽기
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
      // 이전 발화가 진행 중이면 정지 후 60ms 뒤 발화 (안드로이드/크롬 첫 음절 삼킴 및 볼륨 저하 방지)
      if (this.speechSynth.speaking || this.speechSynth.pending) {
        this.speechSynth.cancel();
      }

      this.speakTimer = setTimeout(() => {
        if (this.availableKoreanVoices.length === 0) {
          this.initVoices();
        }

        // 음성 인식률을 높이고 또렷하게 발화하도록 텍스트 정제
        const cleanText = String(text)
          .replace(/[~]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ko-KR';
        utterance.volume = 1.0; // 브라우저 최대 볼륨 (100%)

        if (this.selectedVoice) {
          utterance.voice = this.selectedVoice;
        }

        // 청소년 남자아이 톤 적용:
        // 남성 기본 보이스(InJoon, ism 등)인 경우 피치를 살짝 높여(1.15~1.22) 맑은 청소년 소년 톤 연출
        // 여성 기본 보이스만 설치된 기기인 경우 피치를 조정해 소년 느낌을 구현
        const voiceNameLower = this.selectedVoice ? (this.selectedVoice.name + this.selectedVoice.voiceURI).toLowerCase() : '';
        const isNativeMale = ['injoon', '인준', 'ism', 'standard-c', 'standard-d', 'wavenet-c', 'wavenet-d', 'bongjin', 'gookmin', 'male', '남성'].some(
          k => voiceNameLower.includes(k)
        );

        if (isNativeMale) {
          utterance.pitch = this.voiceConfig.pitch || 1.18;
          utterance.rate = this.voiceConfig.rate || 0.95;
        } else {
          // 기본 보이스일 때 명랑한 소년 톤 피치 적용
          utterance.pitch = this.voiceConfig.pitch || 1.25;
          utterance.rate = this.voiceConfig.rate || 0.96;
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

        utterance.onend = finishCallback;
        utterance.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') {
            console.warn('TTS error:', e);
          }
          finishCallback();
        };

        this.currentUtterance = utterance;
        this.speechSynth.resume(); // 일부 태블릿 브라우저의 일시정지 버그 해제
        this.speechSynth.speak(utterance);
      }, 65);
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

  getVoiceStatusLabel() {
    const presetLabels = {
      teen_boy: '활기찬 청소년 남자아이',
      bright_boy: '명랑한 소년',
      calm_boy: '차분한 청소년'
    };
    const presetName = presetLabels[this.voiceConfig.voicePreset] || '청소년 남자아이';
    const engineName = this.selectedVoice ? this.selectedVoice.name.replace(/Microsoft |Google |Online \(Natural\) - /g, '') : '한국어 기본';
    return `${presetName} (${engineName})`;
  }
}

// 전역 싱글톤 인스턴스
window.soundCtrl = new SoundController();
