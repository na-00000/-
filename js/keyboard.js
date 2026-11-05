/**
 * ============================================================================
 * [Keyboard Engine] 뇌성마비 맞춤형 한글 자모 조합/분리 및 실시간 오답 검증 로직
 * - 태블릿 가로 화면 맞춤형 와이드 2단 그리드 (자음 파랑 / 모음 주황 / 기능키)
 * - 최소 76px × 76px 터치 타겟 & 최소 20px 간격 엄수
 * - 초성·중성·종성 + 이중모음(ㅘ,ㅝ 등) + 겹받침(ㄺ,ㄻ 등) + 쌍자음 완벽 조합 지원
 * - 뇌성마비 손떨림(Tremor) 이중 터치 방지 디바운스 및 다음 글자 시각·음성 힌트 탑재
 * ============================================================================
 */

class KoreanAccessibilityKeyboard {
  constructor(options = {}) {
    this.containerEl = options.containerEl || document.getElementById('keyboardRoot');
    this.previewEl = options.previewEl || document.getElementById('previewDisplay');
    this.onCharComplete = options.onCharComplete || null;
    this.onSentenceComplete = options.onSentenceComplete || null;
    this.onRetry = options.onRetry || null;

    // 한글 유니코드 표준 테이블
    this.CHO = [
      'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
      'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    ];
    this.JUNG = [
      'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
      'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
    ];
    this.JONG = [
      '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
      'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
      'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    ];

    // 이중모음 분해/조합 사전 (자판에 없는 복합 모음을 2단계 터치로 조합)
    this.COMPOUND_VOWEL_PARTS = {
      'ㅘ': ['ㅗ', 'ㅏ'],
      'ㅙ': ['ㅗ', 'ㅐ'],
      'ㅚ': ['ㅗ', 'ㅣ'],
      'ㅝ': ['ㅜ', 'ㅓ'],
      'ㅞ': ['ㅜ', 'ㅔ'],
      'ㅟ': ['ㅜ', 'ㅣ'],
      'ㅢ': ['ㅡ', 'ㅣ'],
      'ㅒ': ['ㅑ', 'ㅣ'],
      'ㅖ': ['ㅕ', 'ㅣ']
    };

    // 겹받침 분해/조합 사전 (예: '맑' = ㄹ + ㄱ)
    this.COMPOUND_JONG_PARTS = {
      'ㄳ': ['ㄱ', 'ㅅ'],
      'ㄵ': ['ㄴ', 'ㅈ'],
      'ㄶ': ['ㄴ', 'ㅎ'],
      'ㄺ': ['ㄹ', 'ㄱ'],
      'ㄻ': ['ㄹ', 'ㅁ'],
      'ㄼ': ['ㄹ', 'ㅂ'],
      'ㄽ': ['ㄹ', 'ㅅ'],
      'ㄾ': ['ㄹ', 'ㅌ'],
      'ㄿ': ['ㄹ', 'ㅍ'],
      'ㅀ': ['ㄹ', 'ㅎ'],
      'ㅄ': ['ㅂ', 'ㅅ']
    };

    // 단자음 2회 터치로 쌍자음 조합 지원 사전
    this.DOUBLE_CONSONANT_PARTS = {
      'ㄲ': 'ㄱ',
      'ㄸ': 'ㄷ',
      'ㅃ': 'ㅂ',
      'ㅆ': 'ㅅ',
      'ㅉ': 'ㅈ'
    };

    // 자모 음성 발음 사전
    this.JAMO_NAMES = {
      'ㄱ': '기역', 'ㄲ': '쌍기역', 'ㄴ': '니은', 'ㄷ': '디귿', 'ㄸ': '쌍디귿',
      'ㄹ': '리을', 'ㅁ': '미음', 'ㅂ': '비읍', 'ㅃ': '쌍비읍', 'ㅅ': '시옷',
      'ㅆ': '쌍시옷', 'ㅇ': '이응', 'ㅈ': '지읒', 'ㅉ': '쌍지읒', 'ㅊ': '치읓',
      'ㅋ': '키읔', 'ㅌ': '티읕', 'ㅍ': '피읖', 'ㅎ': '히읗',
      'ㅏ': '아', 'ㅑ': '야', 'ㅓ': '어', 'ㅕ': '여', 'ㅗ': '오',
      'ㅛ': '요', 'ㅜ': '우', 'ㅠ': '유', 'ㅡ': '으', 'ㅣ': '이',
      'ㅐ': '애', 'ㅔ': '에'
    };

    this.targetSentence = '';
    this.currentCharIndex = 0;
    this.inputBuffer = {
      cho: null,
      jung: null,
      jong: null
    };

    this.isComposingLocked = false;
    this.showKeyHintHighlight = true;

    // 손떨림 이중 터치 방지용 타임스탬프
    this.lastKeyTime = 0;
    this.lastAcceptedKey = null;

    this.initDOM();
  }

  /**
   * 완성형 한글 음절을 초성, 중성, 종성으로 분해
   */
  decompose(char) {
    if (!char) return null;
    const code = char.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) {
      return { char, isHangul: false };
    }

    const offset = code - 0xac00;
    const jongIdx = offset % 28;
    const jungIdx = Math.floor((offset - jongIdx) / 28) % 21;
    const choIdx = Math.floor(Math.floor((offset - jongIdx) / 28) / 21);

    return {
      char,
      isHangul: true,
      cho: this.CHO[choIdx],
      jung: this.JUNG[jungIdx],
      jong: this.JONG[jongIdx] || null
    };
  }

  /**
   * 초성, 중성, 종성을 조합하여 완성형 음절 생성
   */
  compose(cho, jung, jong = null) {
    const choIdx = this.CHO.indexOf(cho);
    const jungIdx = this.JUNG.indexOf(jung);
    const jongIdx = jong ? this.JONG.indexOf(jong) : 0;

    if (choIdx === -1 || jungIdx === -1 || jongIdx === -1) {
      return null;
    }

    const code = 0xac00 + (choIdx * 21 * 28) + (jungIdx * 28) + jongIdx;
    return String.fromCharCode(code);
  }

  /**
   * 목표 문장 설정 및 초기화
   */
  setTargetSentence(sentence) {
    this.targetSentence = (sentence || '').trim();
    this.currentCharIndex = 0;
    this.resetBuffer();
    this.renderSentenceBoxes();
    this.highlightCurrentBox();
  }

  resetBuffer() {
    this.inputBuffer = { cho: null, jung: null, jong: null };
    this.updatePreview('');
  }

  updatePreview(text) {
    if (this.previewEl) {
      this.previewEl.textContent = text || '-';
    }
  }

  /**
   * 상단 목표 글자 & 입력 글자 박스 UI 생성
   */
  renderSentenceBoxes() {
    const container = document.getElementById('sentenceBoxesContainer');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < this.targetSentence.length; i++) {
      const char = this.targetSentence[i];
      const isSpace = char === ' ';

      const pair = document.createElement('div');
      pair.className = 'char-box-pair';

      const targetBox = document.createElement('div');
      targetBox.className = `target-char ${isSpace ? 'is-space' : ''}`;
      targetBox.textContent = isSpace ? '␣' : char;
      targetBox.setAttribute('aria-label', isSpace ? '띄어쓰기' : `목표 글자 ${char}`);

      const inputBox = document.createElement('div');
      inputBox.id = `inputCharBox_${i}`;
      inputBox.className = `input-char-box ${isSpace ? 'is-space' : ''}`;
      inputBox.textContent = isSpace ? ' ' : '';
      inputBox.setAttribute('aria-label', `입력 칸 ${i + 1}`);

      pair.appendChild(targetBox);
      pair.appendChild(inputBox);
      container.appendChild(pair);
    }
  }

  /**
   * 현재 입력해야 할 칸 포커스 및 다음 눌러야 할 자판 힌트 표시
   */
  highlightCurrentBox() {
    document.querySelectorAll('.input-char-box').forEach(el => {
      el.classList.remove('current-focus');
    });

    if (this.currentCharIndex >= this.targetSentence.length) {
      this.clearKeyHintHighlight();
      this.finishSentence();
      return;
    }

    const currentChar = this.targetSentence[this.currentCharIndex];
    const currentBox = document.getElementById(`inputCharBox_${this.currentCharIndex}`);
    const dec = this.decompose(currentChar);

    // 공백이나 특수기호(., !, ?, ~ 등)는 자동 완성 통과 처리하여 학생이 막히지 않도록 배려
    if (currentChar === ' ' || (dec && !dec.isHangul)) {
      if (currentBox) {
        currentBox.classList.add('matched');
        currentBox.textContent = currentChar;
      }
      this.currentCharIndex++;
      this.highlightCurrentBox();
      return;
    }

    if (currentBox) {
      currentBox.classList.add('current-focus');
    }

    this.updateNextKeyGuide();
  }

  /**
   * 현재 상태에서 학생이 눌러야 할 다음 자모 키 계산
   */
  getExpectedNextKey() {
    if (this.currentCharIndex >= this.targetSentence.length) return null;
    const targetChar = this.targetSentence[this.currentCharIndex];
    const targetDec = this.decompose(targetChar);
    if (!targetDec || !targetDec.isHangul) return null;

    // 1. 초성 단계
    if (!this.inputBuffer.cho) {
      return { key: targetDec.cho, type: 'consonant', desc: `파란색 자음 '${targetDec.cho}'(${this.JAMO_NAMES[targetDec.cho] || targetDec.cho})` };
    }

    // 초성이 단자음만 입력된 쌍자음 중간 단계인 경우
    if (this.inputBuffer.cho !== targetDec.cho && this.DOUBLE_CONSONANT_PARTS[targetDec.cho] === this.inputBuffer.cho) {
      return { key: targetDec.cho, altKey: this.inputBuffer.cho, type: 'consonant', desc: `자음 '${this.inputBuffer.cho}'을 한 번 더 누르거나 '${targetDec.cho}'` };
    }

    // 2. 중성(모음) 단계
    if (!this.inputBuffer.jung) {
      const compoundParts = this.COMPOUND_VOWEL_PARTS[targetDec.jung];
      const neededVowel = compoundParts ? compoundParts[0] : targetDec.jung;
      return { key: neededVowel, type: 'vowel', desc: `주황색 모음 '${neededVowel}'(${this.JAMO_NAMES[neededVowel] || neededVowel})` };
    }

    // 중성이 이중모음의 첫 번째 모음만 입력된 상태인 경우 (예: 'ㅘ'에서 'ㅗ'만 입력됨)
    if (this.inputBuffer.jung !== targetDec.jung) {
      const compoundParts = this.COMPOUND_VOWEL_PARTS[targetDec.jung];
      if (compoundParts && this.inputBuffer.jung === compoundParts[0]) {
        const secondVowel = compoundParts[1];
        return { key: secondVowel, type: 'vowel', desc: `주황색 모음 '${secondVowel}'(${this.JAMO_NAMES[secondVowel] || secondVowel})` };
      }
    }

    // 3. 종성(받침) 단계
    if (targetDec.jong) {
      if (!this.inputBuffer.jong) {
        const compoundJong = this.COMPOUND_JONG_PARTS[targetDec.jong];
        const neededJong = compoundJong ? compoundJong[0] : targetDec.jong;
        return { key: neededJong, type: 'consonant', desc: `받침 자음 '${neededJong}'(${this.JAMO_NAMES[neededJong] || neededJong})` };
      }

      // 겹받침의 두 번째 자음 단계 (예: '맑'에서 '말'까지 완성된 상태)
      if (this.inputBuffer.jong !== targetDec.jong) {
        const compoundJong = this.COMPOUND_JONG_PARTS[targetDec.jong];
        if (compoundJong && this.inputBuffer.jong === compoundJong[0]) {
          const secondJong = compoundJong[1];
          return { key: secondJong, type: 'consonant', desc: `겹받침 자음 '${secondJong}'(${this.JAMO_NAMES[secondJong] || secondJong})` };
        }
      }
    }

    return null;
  }

  /**
   * 자판 가이드 문구 및 다음 누를 키 하이라이트 표시
   */
  updateNextKeyGuide() {
    this.clearKeyHintHighlight();
    const expected = this.getExpectedNextKey();
    if (!expected) return;

    this.updateGuide(`${expected.desc} 버튼을 눌러보세요`);

    if (this.showKeyHintHighlight && this.containerEl) {
      const targetBtn = this.containerEl.querySelector(`.key-btn[data-key="${expected.key}"]`);
      if (targetBtn) {
        targetBtn.classList.add('next-key-hint');
      }
    }
  }

  clearKeyHintHighlight() {
    if (!this.containerEl) return;
    this.containerEl.querySelectorAll('.key-btn.next-key-hint').forEach(btn => {
      btn.classList.remove('next-key-hint');
    });
  }

  /**
   * 음성으로 다음 눌러야 할 자모 힌트 안내
   */
  speakNextKeyHint() {
    const expected = this.getExpectedNextKey();
    if (!expected || !window.soundCtrl) return;
    const targetChar = this.targetSentence[this.currentCharIndex];
    window.soundCtrl.speak(`'${targetChar}' 글자를 쓰려면, ${expected.desc} 버튼을 눌러봐!`);
  }

  /**
   * 뇌성마비 맞춤형 태블릿 가로 와이드 대형 자판 DOM 생성
   */
  initDOM() {
    if (!this.containerEl) return;

    const consonantsRow1 = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ'];
    const consonantsRow2 = ['ㅋ', 'ㅌ', 'ㅍ', 'ㅎ', 'ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'];
    const vowels = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ', 'ㅣ', 'ㅐ', 'ㅔ'];

    this.containerEl.innerHTML = `
      <!-- 상단 조합 상태 & 음성 힌트 바 -->
      <div class="keyboard-preview-bar" role="status" aria-live="polite">
        <div class="preview-label-box">
          <span class="preview-tag">조합 중인 글자</span>
          <div class="preview-display" id="previewDisplay">-</div>
          <div class="preview-guide" id="keyboardGuideText">파란색 자음을 먼저 눌러보세요</div>
        </div>
        <div class="keyboard-quick-actions">
          <button type="button" class="btn-3d btn-warning kb-hint-btn" id="btnKeyVoiceHint" aria-label="다음 누를 글자 음성 힌트 듣기">
            💡 글자 힌트 듣기
          </button>
          <button type="button" class="key-btn key-backspace" id="btnKeyBackspace" aria-label="한 글자 지우기">
            <span>⌫</span> 지우기
          </button>
          <button type="button" class="key-btn key-space" id="btnKeySpace" aria-label="한 칸 띄우기">
            <span>␣</span> 띄어쓰기
          </button>
          <button type="button" class="key-btn key-clear" id="btnKeyClear" aria-label="현재 글자 다시 쓰기">
            <span>↺</span> 다시
          </button>
        </div>
      </div>

      <!-- 2단 대형 자모 그리드 (1단: 파란색 자음 / 2단: 주황색 모음) -->
      <div class="keyboard-sections">
        <!-- 1단: 자음 영역 (파랑 계열) -->
        <div class="keyboard-section consonant-section">
          <div class="section-side-label consonant-badge">
            <span>1단</span>
            <strong>자음</strong>
          </div>
          <div class="key-rows-wrapper">
            <div class="key-grid consonant-grid-row" role="group" aria-label="기본 자음 1열">
              ${consonantsRow1.map(c => `
                <button type="button" class="key-btn consonant-key" data-key="${c}" aria-label="자음 ${this.JAMO_NAMES[c] || c}">${c}</button>
              `).join('')}
            </div>
            <div class="key-grid consonant-grid-row" role="group" aria-label="기본 자음 및 쌍자음 2열">
              ${consonantsRow2.map(c => `
                <button type="button" class="key-btn consonant-key ${this.DOUBLE_CONSONANT_PARTS[c] ? 'double-consonant' : ''}" data-key="${c}" aria-label="자음 ${this.JAMO_NAMES[c] || c}">${c}</button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- 2단: 모음 영역 (주황 계열) -->
        <div class="keyboard-section vowel-section">
          <div class="section-side-label vowel-badge">
            <span>2단</span>
            <strong>모음</strong>
          </div>
          <div class="key-rows-wrapper">
            <div class="key-grid vowel-grid-row" role="group" aria-label="모음 글자판">
              ${vowels.map(v => `
                <button type="button" class="key-btn vowel-key" data-key="${v}" aria-label="모음 ${this.JAMO_NAMES[v] || v}">${v}</button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    this.previewEl = document.getElementById('previewDisplay');
    this.guideEl = document.getElementById('keyboardGuideText');

    // 자모 키 터치 바인딩
    this.containerEl.querySelectorAll('.key-btn[data-key]').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const key = btn.getAttribute('data-key');
        this.handleKeyPress(key, btn);
      });
    });

    // 음성 힌트 버튼
    const btnHint = document.getElementById('btnKeyVoiceHint');
    if (btnHint) {
      btnHint.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.speakNextKeyHint();
      });
    }

    // 지우기(백스페이스)
    const btnBackspace = document.getElementById('btnKeyBackspace');
    if (btnBackspace) {
      btnBackspace.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.handleBackspace();
      });
    }

    // 띄어쓰기(스페이스)
    const btnSpace = document.getElementById('btnKeySpace');
    if (btnSpace) {
      btnSpace.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.handleSpace();
      });
    }

    // 다시 쓰기(현재 글자 초기화)
    const btnClear = document.getElementById('btnKeyClear');
    if (btnClear) {
      btnClear.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.resetBuffer();
        const currentBox = document.getElementById(`inputCharBox_${this.currentCharIndex}`);
        if (currentBox) currentBox.textContent = '';
        this.updateNextKeyGuide();
        if (window.soundCtrl) window.soundCtrl.playClick();
      });
    }
  }

  /**
   * 키 입력 처리 및 실시간 한글 오토마타 검증
   */
  handleKeyPress(key, btnEl) {
    if (this.isComposingLocked) return;
    if (this.currentCharIndex >= this.targetSentence.length) return;

    // 손떨림에 의한 의도치 않은 이중 터치 방지 (260ms 내 동일 키 중복 입력 차단)
    const now = Date.now();
    if (key === this.lastAcceptedKey && (now - this.lastKeyTime) < 260) {
      return;
    }

    if (btnEl) {
      btnEl.classList.add('is-active');
      setTimeout(() => btnEl.classList.remove('is-active'), 150);
    }

    if (window.soundCtrl) window.soundCtrl.playClick();

    const targetChar = this.targetSentence[this.currentCharIndex];
    const targetDec = this.decompose(targetChar);

    if (!targetDec || !targetDec.isHangul) {
      if (key === targetChar) {
        this.acceptChar(key);
      } else {
        this.triggerError();
      }
      return;
    }

    const isConsonant = this.CHO.includes(key);
    const isVowel = this.JUNG.includes(key);

    // ========================================================================
    // [단계 1] 초성 입력 대기 상태
    // ========================================================================
    if (!this.inputBuffer.cho) {
      if (!isConsonant) {
        this.triggerError('파란색 자음을 먼저 눌러주세요!');
        return;
      }

      // 목표 초성과 정확히 일치하거나, 쌍자음의 단자음 첫 입력인 경우 허용
      if (key === targetDec.cho || this.DOUBLE_CONSONANT_PARTS[targetDec.cho] === key) {
        this.inputBuffer.cho = key;
        this.recordAcceptedKey(key);
        this.updatePreview(key);
        this.updateCurrentBoxText(key);
        this.updateNextKeyGuide();
        return;
      }

      this.triggerError();
      return;
    }

    // [단계 1-2] 쌍자음 목표인데 단자음 1개가 입력된 상태에서 한 번 더 눌러 쌍자음 완성
    if (this.inputBuffer.cho !== targetDec.cho && !this.inputBuffer.jung) {
      if (key === targetDec.cho || (this.DOUBLE_CONSONANT_PARTS[targetDec.cho] === key)) {
        this.inputBuffer.cho = targetDec.cho;
        this.recordAcceptedKey(key);
        this.updatePreview(this.inputBuffer.cho);
        this.updateCurrentBoxText(this.inputBuffer.cho);
        this.updateNextKeyGuide();
        return;
      }
      this.triggerError();
      return;
    }

    // ========================================================================
    // [단계 2] 중성(모음) 입력 대기 상태 (초성 완료 후)
    // ========================================================================
    if (this.inputBuffer.cho && !this.inputBuffer.jung) {
      if (!isVowel) {
        this.triggerError('주황색 모음을 눌러주세요!');
        return;
      }

      const compoundParts = this.COMPOUND_VOWEL_PARTS[targetDec.jung];

      // 2-A. 단일 모음이 목표와 바로 일치하는 경우
      if (key === targetDec.jung) {
        this.inputBuffer.jung = key;
        this.recordAcceptedKey(key);
        const combined = this.compose(this.inputBuffer.cho, this.inputBuffer.jung);
        this.updatePreview(combined);
        this.updateCurrentBoxText(combined);

        if (!targetDec.jong) {
          this.acceptChar(combined);
        } else {
          this.updateNextKeyGuide();
        }
        return;
      }

      // 2-B. 이중모음(예: ㅘ = ㅗ + ㅏ)의 첫 번째 모음('ㅗ')을 누른 경우
      if (compoundParts && key === compoundParts[0]) {
        this.inputBuffer.jung = key;
        this.recordAcceptedKey(key);
        const partialCombined = this.compose(this.inputBuffer.cho, this.inputBuffer.jung);
        this.updatePreview(partialCombined);
        this.updateCurrentBoxText(partialCombined);
        this.updateNextKeyGuide();
        return;
      }

      this.triggerError();
      return;
    }

    // [단계 2-2] 이중모음의 두 번째 모음 입력 대기 상태 (예: 'ㅘ'에서 'ㅗ'까지 입력된 상태)
    if (this.inputBuffer.cho && this.inputBuffer.jung && this.inputBuffer.jung !== targetDec.jung) {
      const compoundParts = this.COMPOUND_VOWEL_PARTS[targetDec.jung];
      if (compoundParts && this.inputBuffer.jung === compoundParts[0] && key === compoundParts[1]) {
        this.inputBuffer.jung = targetDec.jung;
        this.recordAcceptedKey(key);
        const combined = this.compose(this.inputBuffer.cho, this.inputBuffer.jung);
        this.updatePreview(combined);
        this.updateCurrentBoxText(combined);

        if (!targetDec.jong) {
          this.acceptChar(combined);
        } else {
          this.updateNextKeyGuide();
        }
        return;
      }

      this.triggerError('이중모음의 다음 모음을 눌러주세요!');
      return;
    }

    // ========================================================================
    // [단계 3] 종성(받침) 입력 대기 상태 (초성 + 중성 완료 후)
    // ========================================================================
    if (this.inputBuffer.cho && this.inputBuffer.jung === targetDec.jung && targetDec.jong) {
      if (!isConsonant) {
        this.triggerError('파란색 받침 자음을 눌러주세요!');
        return;
      }

      const compoundJong = this.COMPOUND_JONG_PARTS[targetDec.jong];

      // 3-A. 아직 받침이 하나도 입력되지 않은 상태
      if (!this.inputBuffer.jong) {
        // 단일 받침이 목표 종성과 일치하는 경우
        if (key === targetDec.jong) {
          this.inputBuffer.jong = key;
          this.recordAcceptedKey(key);
          const finalChar = this.compose(this.inputBuffer.cho, this.inputBuffer.jung, this.inputBuffer.jong);
          this.updatePreview(finalChar);
          this.updateCurrentBoxText(finalChar);
          this.acceptChar(finalChar);
          return;
        }

        // 겹받침(예: '맑'의 'ㄺ')의 첫 번째 자음('ㄹ')을 누른 경우
        if (compoundJong && key === compoundJong[0]) {
          this.inputBuffer.jong = key;
          this.recordAcceptedKey(key);
          const partialChar = this.compose(this.inputBuffer.cho, this.inputBuffer.jung, this.inputBuffer.jong);
          this.updatePreview(partialChar);
          this.updateCurrentBoxText(partialChar);
          this.updateNextKeyGuide();
          return;
        }

        // 쌍받침(예: '있'의 'ㅆ')을 단자음('ㅅ')으로 먼저 누른 경우
        if (this.DOUBLE_CONSONANT_PARTS[targetDec.jong] === key) {
          this.inputBuffer.jong = key;
          this.recordAcceptedKey(key);
          const partialChar = this.compose(this.inputBuffer.cho, this.inputBuffer.jung, this.inputBuffer.jong);
          this.updatePreview(partialChar);
          this.updateCurrentBoxText(partialChar);
          this.updateNextKeyGuide();
          return;
        }

        this.triggerError();
        return;
      }

      // 3-B. 겹받침 또는 쌍받침의 두 번째 자음 입력 대기 상태
      if (this.inputBuffer.jong && this.inputBuffer.jong !== targetDec.jong) {
        if (
          (compoundJong && this.inputBuffer.jong === compoundJong[0] && key === compoundJong[1]) ||
          (this.DOUBLE_CONSONANT_PARTS[targetDec.jong] === this.inputBuffer.jong && (key === this.inputBuffer.jong || key === targetDec.jong))
        ) {
          this.inputBuffer.jong = targetDec.jong;
          this.recordAcceptedKey(key);
          const finalChar = this.compose(this.inputBuffer.cho, this.inputBuffer.jung, this.inputBuffer.jong);
          this.updatePreview(finalChar);
          this.updateCurrentBoxText(finalChar);
          this.acceptChar(finalChar);
          return;
        }

        this.triggerError();
        return;
      }
    }
  }

  recordAcceptedKey(key) {
    this.lastAcceptedKey = key;
    this.lastKeyTime = Date.now();
  }

  /**
   * 한 음절 완성 확정 처리
   */
  acceptChar(char) {
    const currentBox = document.getElementById(`inputCharBox_${this.currentCharIndex}`);
    if (currentBox) {
      currentBox.textContent = char;
      currentBox.classList.remove('current-focus');
      currentBox.classList.add('matched', 'success-pop');
    }

    if (window.soundCtrl) {
      window.soundCtrl.playSuccess();
    }

    this.resetBuffer();
    this.currentCharIndex++;

    if (this.onCharComplete) {
      this.onCharComplete(char, this.currentCharIndex);
    }

    this.highlightCurrentBox();
  }

  /**
   * 오답 발생 시 즉각적인 시각·청각 피드백 (retry 사운드 + "다시 써보자!" 팝업 + 쉐이크 후 초기화)
   */
  triggerError(customMsg) {
    this.isComposingLocked = true;

    if (window.soundCtrl) {
      window.soundCtrl.playRetry();
    }

    const currentBox = document.getElementById(`inputCharBox_${this.currentCharIndex}`);
    if (currentBox) {
      currentBox.classList.add('error-shake');
    }

    const expected = this.getExpectedNextKey();
    const hintMsg = customMsg || (expected ? `다시 써보자! (${expected.desc})` : '다시 써보자!');
    this.showRetryBanner(hintMsg);

    setTimeout(() => {
      if (currentBox) {
        currentBox.classList.remove('error-shake');
        currentBox.textContent = '';
      }
      this.resetBuffer();
      this.isComposingLocked = false;
      this.updateNextKeyGuide();
      if (this.onRetry) this.onRetry();
    }, 680);
  }

  showRetryBanner(message) {
    let banner = document.getElementById('retryBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'retryBanner';
      banner.className = 'retry-banner';
      banner.innerHTML = `
        <span class="banner-icon">✏️</span>
        <span class="banner-text" id="retryBannerText">${message}</span>
      `;
      document.body.appendChild(banner);
    } else {
      const textEl = document.getElementById('retryBannerText');
      if (textEl) textEl.textContent = message;
    }

    banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      banner.classList.remove('show');
    }, 1400);
  }

  updateCurrentBoxText(text) {
    const currentBox = document.getElementById(`inputCharBox_${this.currentCharIndex}`);
    if (currentBox) {
      currentBox.textContent = text;
    }
  }

  updateGuide(text) {
    if (this.guideEl) {
      this.guideEl.textContent = text;
    }
  }

  handleBackspace() {
    if (this.isComposingLocked) return;
    if (window.soundCtrl) window.soundCtrl.playClick();

    if (this.inputBuffer.jong) {
      this.inputBuffer.jong = null;
      const combined = this.compose(this.inputBuffer.cho, this.inputBuffer.jung);
      this.updatePreview(combined);
      this.updateCurrentBoxText(combined);
      this.updateNextKeyGuide();
    } else if (this.inputBuffer.jung) {
      this.inputBuffer.jung = null;
      this.updatePreview(this.inputBuffer.cho);
      this.updateCurrentBoxText(this.inputBuffer.cho);
      this.updateNextKeyGuide();
    } else if (this.inputBuffer.cho) {
      this.resetBuffer();
      this.updateCurrentBoxText('');
      this.updateNextKeyGuide();
    } else if (this.currentCharIndex > 0) {
      this.currentCharIndex--;
      const prevBox = document.getElementById(`inputCharBox_${this.currentCharIndex}`);
      if (prevBox) {
        prevBox.classList.remove('matched', 'success-pop');
        prevBox.textContent = '';
      }
      this.resetBuffer();
      this.highlightCurrentBox();
    }
  }

  handleSpace() {
    if (this.currentCharIndex >= this.targetSentence.length) return;
    const targetChar = this.targetSentence[this.currentCharIndex];

    if (targetChar === ' ') {
      this.acceptChar(' ');
    } else {
      this.triggerError('지금은 글자를 쓸 차례예요!');
    }
  }

  finishSentence() {
    this.updatePreview('완성!');
    this.updateGuide('참 잘했어요! 문장을 모두 완성했어요!');
    if (this.onSentenceComplete) {
      this.onSentenceComplete(this.targetSentence);
    }
  }
}

window.KoreanAccessibilityKeyboard = KoreanAccessibilityKeyboard;
