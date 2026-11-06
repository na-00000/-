/**
 * ============================================================================
 * [App Engine] 학생용 5단계 학습 흐름 제어 & 양산희망학교 식단 자동 연동 엔진
 * - 1단계: 오늘 날짜 선택 (대형 달력 그리드, 월 이동 및 오늘 자동 하이라이트)
 * - 2단계: 오늘의 날씨 선택 (CSS/SVG 애니메이션 카드 4종)
 * - 3단계: 오늘의 기분 선택 (CSS/SVG 감정 캐릭터 카드 4종)
 * - 4단계: 양산희망학교 오늘의 급식 메뉴 자동 연동 & 긴 글자 자동 줄바꿈/배열
 * - 5단계: 오늘의 한 문장 따라 쓰기 (초·중·종성·겹받침·이중모음 자판 & 폭죽 보상)
 * ============================================================================
 */

const YANGSAN_DIET_URL = 'https://huimang-s.gne.go.kr/huimang-s/dv/dietView/selectDietCalendarView.do?mi=152211';

class YangsanDietService {
  static getWeeklySchoolMenus() {
    return {
      1: [
        { name: '찰흑미밥', icon: '🍚' },
        { name: '한우미역국', icon: '🍲' },
        { name: '소불고기', icon: '🥩' },
        { name: '달걀말이', icon: '🍳' },
        { name: '배추김치', icon: '🥬' },
        { name: '친환경사과', icon: '🍎' }
      ],
      2: [
        { name: '혼합잡곡밥', icon: '🍚' },
        { name: '유부어묵국', icon: '🍲' },
        { name: '수제등심돈가스', icon: '🍤' },
        { name: '양배추콘샐러드', icon: '🥗' },
        { name: '깍두기', icon: '🥬' },
        { name: '요구르트', icon: '🥛' }
      ],
      3: [
        { name: '강황카레라이스', icon: '🍛' },
        { name: '맑은장국', icon: '🍲' },
        { name: '닭다리살오븐구이', icon: '🍗' },
        { name: '친환경오이무침', icon: '🥒' },
        { name: '배추김치', icon: '🥬' },
        { name: '우리밀초코케이크', icon: '🍰' }
      ],
      4: [
        { name: '찰보리밥', icon: '🍚' },
        { name: '쇠고기무국', icon: '🍲' },
        { name: '돈육메추리알장조림', icon: '🥩' },
        { name: '시금치나물', icon: '🥬' },
        { name: '배추김치', icon: '🥬' },
        { name: '바나나', icon: '🍌' }
      ],
      5: [
        { name: '곤드레콩나물밥/매실간장양념장', icon: '🍚' },
        { name: '두부탕국', icon: '🍲' },
        { name: '반달치즈떡갈비구운채소', icon: '🥩' },
        { name: '배추김치', icon: '🥬' },
        { name: '화분요거트', icon: '🥛' },
        { name: '친환경사과', icon: '🍎' }
      ]
    };
  }

  /**
   * 음식 이름에서 알레르기 번호 및 특수기호 제거
   */
  static cleanDishName(rawText) {
    if (!rawText) return '';
    return rawText
      .replace(/\([0-9.,\s]+\)/g, '')
      .replace(/[0-9]+\.[0-9.]*/g, '')
      .replace(/[*@#%^&•·]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[0-9]+\s*(kcal|Kcal|KCAL)/g, '')
      .trim();
  }

  /**
   * 긴 급식 메뉴 이름이 카드 칸을 절대 벗어나지 않도록 의미 단위로 자동 분할
   * 예: "곤드레콩나물밥/매실간장양념장" -> ["곤드레콩나물밥", "매실간장양념장"]
   * 예: "반달치즈떡갈비구운채소" -> ["반달치즈떡갈비", "구운채소"]
   */
  static splitDishIntoBalancedLines(dishName) {
    if (!dishName) return [''];

    // 1. 슬래시(/), 플러스(+), 쉼표 등으로 먼저 분리
    const rawParts = dishName.split(/[\/+&]+/).map(s => s.trim()).filter(Boolean);
    const finalLines = [];

    // 복합 요리명 자연스러운 분할 키워드
    const splitKeywords = [
      '떡갈비', '메추리알', '콩나물밥', '돈가스', '돈까스', '불고기',
      '닭다리살', '고등어', '오징어', '옥수수', '브로콜리', '양배추', '감자채'
    ];

    rawParts.forEach(part => {
      if (part.length <= 7) {
        finalLines.push(part);
        return;
      }

      // 키워드 기준 자연스러운 분리 시도
      let splitted = false;
      for (const kw of splitKeywords) {
        const idx = part.indexOf(kw);
        if (idx !== -1) {
          const cutPos = idx + kw.length;
          if (cutPos >= 3 && cutPos < part.length - 1) {
            finalLines.push(part.slice(0, cutPos));
            finalLines.push(part.slice(cutPos));
            splitted = true;
            break;
          }
        }
      }

      // 키워드가 없는 긴 단어(8자 이상)는 균등한 길이로 2줄 자동 분할
      if (!splitted) {
        const mid = Math.ceil(part.length / 2);
        finalLines.push(part.slice(0, mid));
        finalLines.push(part.slice(mid));
      }
    });

    return finalLines;
  }

  /**
   * 음식 이름에 어울리는 아이콘 자동 매칭
   */
  static detectFoodIcon(dishName) {
    if (!dishName) return '🍱';
    if (/(카레|짜장|하이라이스|비빔밥|볶음밥|덮밥)/.test(dishName)) return '🍛';
    if (/(밥|찰보리|흑미|잡곡|기장|차조|현미|죽)/.test(dishName)) return '🍚';
    if (/(국|탕|찌개|전골|스튜|스프|장국)/.test(dishName)) return '🍲';
    if (/(돈가스|까스|커틀릿|튀김|탕수육|강정|고로케|핫도그)/.test(dishName)) return '🍤';
    if (/(닭|치킨|오리|삼계)/.test(dishName)) return '🍗';
    if (/(불고기|갈비|떡갈비|장조림|수육|보쌈|제육|스테이크|주물럭|고기|육)/.test(dishName)) return '🥩';
    if (/(계란|달걀|메추리알|두부|전|부침)/.test(dishName)) return '🍳';
    if (/(생선|고등어|삼치|갈치|가자미|오징어|어묵|새우)/.test(dishName)) return '🐟';
    if (/(샐러드)/.test(dishName)) return '🥗';
    if (/(김치|깍두기|석박지|나물|무침|겉절이|소박이|피클)/.test(dishName)) return '🥬';
    if (/(우유|요구르트|요거트|주스|음료|식혜)/.test(dishName)) return '🥛';
    if (/(사과|배|바나나|귤|포도|수박|딸기|토마토|과일)/.test(dishName)) return '🍎';
    if (/(떡|빵|케이크|쿠키|과자|푸딩)/.test(dishName)) return '🍰';
    return '🍱';
  }

  static parseRawDishLines(lines) {
    const items = [];
    const seen = new Set();

    lines.forEach((raw, idx) => {
      const cleaned = this.cleanDishName(raw);
      if (cleaned && cleaned.length >= 2 && !seen.has(cleaned)) {
        seen.add(cleaned);
        items.push({
          id: Date.now() + idx,
          name: cleaned,
          icon: this.detectFoodIcon(cleaned)
        });
      }
    });

    return items;
  }

  static async fetchFromNeisAPI(ymdStr) {
    const cleanYmd = ymdStr.replace(/-/g, '');
    let schoolCode = localStorage.getItem('yangsan_huimang_sd_code') || 'S100003451';

    try {
      const infoRes = await fetch(
        'https://open.neis.go.kr/hub/schoolInfo?Type=json&ATPT_OFCDC_SC_CODE=S10&SCHUL_NM=' + encodeURIComponent('양산희망학교')
      );
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        const row = infoData?.schoolInfo?.[1]?.row?.[0];
        if (row && row.SD_SCHUL_CODE) {
          schoolCode = row.SD_SCHUL_CODE;
          localStorage.setItem('yangsan_huimang_sd_code', schoolCode);
        }
      }
    } catch (e) {}

    const mealUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=S10&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${cleanYmd}`;
    const res = await fetch(mealUrl);
    if (!res.ok) throw new Error('NEIS API response not ok');

    const data = await res.json();
    const rows = data?.mealServiceDietInfo?.[1]?.row;
    if (!rows || rows.length === 0) throw new Error('No meal data for date');

    const lunchRow = rows.find(r => r.MMEAL_SC_CODE === '2') || rows[0];
    const ddishNm = lunchRow.DDISH_NM || '';
    const rawLines = ddishNm.split(/<br\s*\/?>|\n/i);
    const parsed = this.parseRawDishLines(rawLines);
    if (parsed.length === 0) throw new Error('Empty parsed dishes');

    return {
      source: '양산희망학교 실시간 식단 (나이스 연동)',
      items: parsed
    };
  }

  static async fetchFromSchoolPage(dateStr) {
    const targetDay = parseInt(dateStr.split('-')[2], 10);
    const proxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(YANGSAN_DIET_URL)}`,
      `https://corsproxy.io/?${encodeURIComponent(YANGSAN_DIET_URL)}`
    ];

    for (const proxyUrl of proxies) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const tds = Array.from(doc.querySelectorAll('td'));
        for (const td of tds) {
          const textContent = td.innerText || td.textContent || '';
          const lines = textContent.split(/\n+/).map(l => l.trim()).filter(Boolean);
          if (lines.length > 1 && parseInt(lines[0], 10) === targetDay) {
            const dishLines = lines.slice(1).filter(l => !/(중식|조식|석식|Kcal|kcal)/.test(l));
            const parsed = this.parseRawDishLines(dishLines);
            if (parsed.length >= 2) {
              return {
                source: '양산희망학교 홈페이지 식단표 자동 반영',
                items: parsed
              };
            }
          }
        }
      } catch (e) {}
    }
    throw new Error('School page direct fetch fallback');
  }

  static async getDietForDate(dateStr, forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const customOverride = localStorage.getItem('daily_korean_lunch_custom_override');
        const savedMenu = JSON.parse(localStorage.getItem('daily_korean_lunch_menu'));
        if (customOverride === 'true' && Array.isArray(savedMenu) && savedMenu.length > 0) {
          return {
            source: '교사 지정 양산희망학교 식단',
            items: savedMenu
          };
        }
      } catch (e) {}
    }

    try {
      const neisResult = await this.fetchFromNeisAPI(dateStr);
      localStorage.setItem('daily_korean_lunch_menu', JSON.stringify(neisResult.items));
      localStorage.setItem('daily_korean_lunch_source', neisResult.source);
      return neisResult;
    } catch (e) {}

    try {
      const pageResult = await this.fetchFromSchoolPage(dateStr);
      localStorage.setItem('daily_korean_lunch_menu', JSON.stringify(pageResult.items));
      localStorage.setItem('daily_korean_lunch_source', pageResult.source);
      return pageResult;
    } catch (e) {}

    const dObj = new Date(dateStr);
    let dayOfWeek = isNaN(dObj.getTime()) ? new Date().getDay() : dObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) dayOfWeek = 5;

    const weeklyDB = this.getWeeklySchoolMenus();
    const fallbackItems = (weeklyDB[dayOfWeek] || weeklyDB[1]).map((item, idx) => ({
      id: Date.now() + idx,
      name: item.name,
      icon: item.icon
    }));

    const result = {
      source: '양산희망학교 주간 표준 식단표 (자동 반영)',
      items: fallbackItems
    };

    localStorage.setItem('daily_korean_lunch_menu', JSON.stringify(result.items));
    localStorage.setItem('daily_korean_lunch_source', result.source);
    return result;
  }
}

window.YangsanDietService = YangsanDietService;

class StudentApp {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 5;

    this.today = new Date();
    this.viewYear = this.today.getFullYear();
    this.viewMonth = this.today.getMonth();

    this.studentSession = {
      date: this.formatDate(this.today),
      weather: null,
      weatherLabel: '',
      emotion: null,
      emotionLabel: '',
      lunch: '',
      sentence: '',
      completedAt: null
    };

    this.keyboardInstance = null;

    // 한 줄에 깔끔하게 들어가고 TTS가 자연스럽게 읽도록 다듬은 안내문
    this.stepGuides = {
      1: '달력에서 파란색 오늘 날짜를 찾아 눌러보세요.',
      2: '오늘 밖의 날씨는 어떤가요? 알맞은 날씨를 골라보세요.',
      3: '오늘 나의 기분은 어떤가요? 표정 카드를 골라보세요.',
      4: '양산희망학교 오늘의 급식 메뉴예요. 좋아하는 음식을 골라보세요.',
      5: '오늘의 문장을 듣고, 아래 글자판으로 한 글자씩 따라 써보세요.'
    };

    this.init();
  }

  formatDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  init() {
    this.initStorageDefaults();
    this.bindHeaderEvents();
    this.initVoiceSettingsModal();
    this.renderCalendar();
    this.bindWeatherEvents();
    this.bindEmotionEvents();
    this.bindDietBarEvents();
    this.initWritingStage();
    this.goToStep(1, true);
  }

  initStorageDefaults() {
    if (!localStorage.getItem('daily_korean_sentences')) {
      const defaultSentences = [
        { id: 1, category: '동요', text: '봄바람이 살랑살랑 불어요' },
        { id: 2, category: '동요', text: '나비야 나비야 이리 날아오너라' },
        { id: 3, category: '응원', text: '오늘도 참 잘했어요' },
        { id: 4, category: '명언', text: '맑은 하늘이 참 예쁘다' },
        { id: 5, category: '속담', text: '가는 말이 고와야 오는 말이 곱다' }
      ];
      localStorage.setItem('daily_korean_sentences', JSON.stringify(defaultSentences));
    }
  }

  bindHeaderEvents() {
    const ttsBtn = document.getElementById('btnInstructionTTS');
    if (ttsBtn) {
      ttsBtn.addEventListener('click', () => {
        this.speakCurrentInstruction();
      });
    }

    const btnPrev = document.getElementById('btnPrevStep');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (this.currentStep > 1) {
          if (window.soundCtrl) window.soundCtrl.playClick();
          this.goToStep(this.currentStep - 1, true);
        }
      });
    }

    document.querySelectorAll('.step-node').forEach(node => {
      node.addEventListener('click', () => {
        const targetStep = parseInt(node.getAttribute('data-step'), 10);
        if (targetStep && targetStep !== this.currentStep) {
          if (window.soundCtrl) window.soundCtrl.playClick();
          this.goToStep(targetStep, true);
        }
      });
    });

    const btnCalPrev = document.getElementById('btnCalPrevMonth');
    const btnCalNext = document.getElementById('btnCalNextMonth');
    const btnCalToday = document.getElementById('btnCalGoToday');

    if (btnCalPrev) {
      btnCalPrev.addEventListener('click', () => {
        this.viewMonth--;
        if (this.viewMonth < 0) {
          this.viewMonth = 11;
          this.viewYear--;
        }
        if (window.soundCtrl) window.soundCtrl.playClick();
        this.renderCalendar();
      });
    }

    if (btnCalNext) {
      btnCalNext.addEventListener('click', () => {
        this.viewMonth++;
        if (this.viewMonth > 11) {
          this.viewMonth = 0;
          this.viewYear++;
        }
        if (window.soundCtrl) window.soundCtrl.playClick();
        this.renderCalendar();
      });
    }

    if (btnCalToday) {
      btnCalToday.addEventListener('click', () => {
        this.viewYear = this.today.getFullYear();
        this.viewMonth = this.today.getMonth();
        if (window.soundCtrl) window.soundCtrl.playClick();
        this.renderCalendar();
      });
    }
  }

  initVoiceSettingsModal() {
    const openBtn = document.getElementById('btnOpenVoiceModal');
    const closeBtn = document.getElementById('btnCloseVoiceModal');
    const testBtn = document.getElementById('btnTestVoice');
    const modal = document.getElementById('voiceSettingsModal');
    const pitchRange = document.getElementById('voicePitchRange');
    const rateRange = document.getElementById('voiceRateRange');
    const voiceSelect = document.getElementById('koreanVoiceSelect');

    if (!modal) return;

    const syncModalUI = () => {
      if (!window.soundCtrl) return;
      const cfg = window.soundCtrl.voiceConfig;
      if (pitchRange) {
        pitchRange.value = cfg.pitch;
        document.getElementById('pitchValueLabel').textContent = cfg.pitch.toFixed(2);
      }
      if (rateRange) {
        rateRange.value = cfg.rate;
        document.getElementById('rateValueLabel').textContent = cfg.rate.toFixed(2);
      }

      document.querySelectorAll('.voice-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-preset') === cfg.voicePreset);
      });

      if (voiceSelect && window.soundCtrl.availableKoreanVoices.length > 0) {
        voiceSelect.innerHTML = `<option value="">자동 (자연스러운 청소년/기본 신경망 보이스)</option>` +
          window.soundCtrl.availableKoreanVoices.map(v => `
            <option value="${v.voiceURI}" ${cfg.preferredVoiceURI === v.voiceURI ? 'selected' : ''}>
              ${v.name} (${v.lang})
            </option>
          `).join('');
      }
    };

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (window.soundCtrl) window.soundCtrl.initVoices();
        syncModalUI();
        modal.classList.add('active');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    document.querySelectorAll('.voice-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        if (window.soundCtrl) {
          window.soundCtrl.setVoicePreset(preset);
          syncModalUI();
          window.soundCtrl.speak('안녕, 나는 너의 국어 공부를 도와줄 친구야. 오늘도 즐겁게 시작해 보자.');
        }
      });
    });

    if (pitchRange) {
      pitchRange.addEventListener('input', () => {
        const val = parseFloat(pitchRange.value);
        document.getElementById('pitchValueLabel').textContent = val.toFixed(2);
        if (window.soundCtrl) {
          window.soundCtrl.voiceConfig.pitch = val;
          window.soundCtrl.saveVoiceConfig();
        }
      });
    }

    if (rateRange) {
      rateRange.addEventListener('input', () => {
        const val = parseFloat(rateRange.value);
        document.getElementById('rateValueLabel').textContent = val.toFixed(2);
        if (window.soundCtrl) {
          window.soundCtrl.voiceConfig.rate = val;
          window.soundCtrl.saveVoiceConfig();
        }
      });
    }

    if (voiceSelect) {
      voiceSelect.addEventListener('change', () => {
        if (window.soundCtrl) {
          window.soundCtrl.voiceConfig.preferredVoiceURI = voiceSelect.value || null;
          window.soundCtrl.selectOptimalNaturalVoice();
          window.soundCtrl.saveVoiceConfig();
        }
      });
    }

    if (testBtn) {
      testBtn.addEventListener('click', () => {
        if (window.soundCtrl) {
          window.soundCtrl.speak('안녕, 이제 목소리가 갈라지지 않고 자연스럽고 또렷하게 잘 들리지? 함께 재미있게 공부해 보자.');
        }
      });
    }
  }

  goToStep(stepNumber, playSpeech = true) {
    if (stepNumber < 1 || stepNumber > this.totalSteps) return;

    this.currentStep = stepNumber;

    document.querySelectorAll('.step-section').forEach(sec => {
      sec.classList.remove('active');
    });
    const targetSec = document.getElementById(`stepSection_${stepNumber}`);
    if (targetSec) {
      targetSec.classList.add('active');
    }

    document.querySelectorAll('.step-node').forEach(node => {
      const stepIdx = parseInt(node.getAttribute('data-step'), 10);
      node.classList.remove('current', 'completed');
      if (stepIdx < stepNumber) {
        node.classList.add('completed');
      } else if (stepIdx === stepNumber) {
        node.classList.add('current');
      }
    });

    const guideText = this.stepGuides[stepNumber];
    const bannerTextEl = document.getElementById('instructionText');
    if (bannerTextEl) {
      bannerTextEl.textContent = guideText;
    }

    const badgeEl = document.getElementById('stepBadge');
    if (badgeEl) {
      badgeEl.textContent = `${stepNumber}단계`;
    }

    const btnPrev = document.getElementById('btnPrevStep');
    if (btnPrev) {
      btnPrev.style.display = stepNumber === 1 ? 'none' : 'inline-flex';
    }

    if (stepNumber === 4) {
      this.loadAndRenderLunchMenu(false);
      return;
    } else if (stepNumber === 5) {
      this.setupSentenceWriting();
      return;
    }

    if (playSpeech && window.soundCtrl) {
      this.speakCurrentInstruction();
    }
  }

  speakCurrentInstruction() {
    const text = this.stepGuides[this.currentStep];
    if (window.soundCtrl) {
      window.soundCtrl.speak(text);
    }
  }

  // ==========================================================================
  // [1단계] 오늘 날짜 달력 렌더링 & 검증
  // ==========================================================================
  renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const titleEl = document.getElementById('calendarMonthTitle');
    const todayHintEl = document.getElementById('todayHintText');
    if (!grid || !titleEl) return;

    grid.innerHTML = '';
    titleEl.textContent = `${this.viewYear}년 ${this.viewMonth + 1}월`;

    if (todayHintEl) {
      todayHintEl.textContent = `💡 오늘은 ${this.today.getMonth() + 1}월 ${this.today.getDate()}일이에요`;
    }

    const firstDay = new Date(this.viewYear, this.viewMonth, 1).getDay();
    const lastDate = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const blank = document.createElement('div');
      blank.className = 'date-btn disabled';
      blank.setAttribute('aria-hidden', 'true');
      grid.appendChild(blank);
    }

    const todayDate = this.today.getDate();
    const isCurrentYearMonth =
      this.today.getFullYear() === this.viewYear &&
      this.today.getMonth() === this.viewMonth;

    for (let day = 1; day <= lastDate; day++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'date-btn';

      const dayOfWeek = (firstDay + day - 1) % 7;
      if (dayOfWeek === 0) btn.classList.add('sun');
      if (dayOfWeek === 6) btn.classList.add('sat');

      const isToday = isCurrentYearMonth && day === todayDate;
      if (isToday) {
        btn.classList.add('is-today');
        btn.innerHTML = `<span>${day}</span><span class="today-tag">오늘</span>`;
        btn.setAttribute('aria-label', `오늘 날짜 ${this.viewMonth + 1}월 ${day}일`);
      } else {
        btn.textContent = day;
        btn.setAttribute('aria-label', `${this.viewMonth + 1}월 ${day}일`);
      }

      btn.addEventListener('click', () => {
        this.handleDateSelect(day, isToday);
      });

      grid.appendChild(btn);
    }
  }

  handleDateSelect(day, isToday) {
    if (isToday) {
      this.studentSession.date = `${this.viewYear}-${String(this.viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (window.soundCtrl) {
        window.soundCtrl.playStepComplete();
        window.soundCtrl.speak(`정답이야. 오늘은 ${this.viewMonth + 1}월 ${day}일이지. 이제 오늘 날씨를 골라보자.`, () => {
          setTimeout(() => this.goToStep(2, false), 200);
        });
      } else {
        this.goToStep(2, true);
      }
    } else {
      if (window.soundCtrl) {
        window.soundCtrl.playRetry();
        window.soundCtrl.speak(`그 칸은 ${day}일이야. 오늘은 ${this.today.getMonth() + 1}월 ${this.today.getDate()}일이니까 파란색 오늘 칸을 눌러봐.`);
      }
    }
  }

  // ==========================================================================
  // [2단계] 오늘의 날씨 선택
  // ==========================================================================
  bindWeatherEvents() {
    const weatherCards = document.querySelectorAll('.weather-card[data-weather]');
    weatherCards.forEach(card => {
      card.addEventListener('click', () => {
        const weatherType = card.getAttribute('data-weather');
        const weatherLabel = card.querySelector('.weather-label')?.textContent.trim() || weatherType;

        weatherCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        this.studentSession.weather = weatherType;
        this.studentSession.weatherLabel = weatherLabel;

        if (window.soundCtrl) {
          window.soundCtrl.playStepComplete();
          window.soundCtrl.speak(`오늘 날씨는 ${weatherLabel}이구나. 참 잘 골랐어. 이제 오늘 기분을 알려줘.`, () => {
            setTimeout(() => this.goToStep(3, false), 200);
          });
        } else {
          this.goToStep(3, true);
        }
      });
    });
  }

  // ==========================================================================
  // [3단계] 오늘의 기분 선택
  // ==========================================================================
  bindEmotionEvents() {
    const emotionCards = document.querySelectorAll('.emotion-card[data-emotion]');
    emotionCards.forEach(card => {
      card.addEventListener('click', () => {
        const emotionType = card.getAttribute('data-emotion');
        const emotionLabel = card.querySelector('.emotion-label')?.textContent.replace(/[^\w가-힣\s]/g, '').trim() || emotionType;

        emotionCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        this.studentSession.emotion = emotionType;
        this.studentSession.emotionLabel = emotionLabel;

        if (window.soundCtrl) {
          window.soundCtrl.playStepComplete();
          window.soundCtrl.speak(`오늘 기분이 ${emotionLabel}구나. 표현해줘서 고마워. 이제 양산희망학교 급식 메뉴를 보러 가자.`, () => {
            setTimeout(() => this.goToStep(4, false), 200);
          });
        } else {
          this.goToStep(4, true);
        }
      });
    });
  }

  // ==========================================================================
  // [4단계] 양산희망학교 오늘의 급식 식단 자동 연동 & 카드 내부 글자 자동 배열
  // ==========================================================================
  bindDietBarEvents() {
    const btnSyncDiet = document.getElementById('btnSyncYangsanDiet');
    if (btnSyncDiet) {
      btnSyncDiet.addEventListener('click', () => {
        if (window.soundCtrl) window.soundCtrl.playClick();
        localStorage.removeItem('daily_korean_lunch_custom_override');
        this.loadAndRenderLunchMenu(true);
      });
    }
  }

  async loadAndRenderLunchMenu(forceRefresh = false) {
    const container = document.getElementById('lunchMenuGrid');
    const dateLabelEl = document.getElementById('dietDateLabel');
    const statusBadgeEl = document.getElementById('dietSyncStatus');
    if (!container) return;

    const targetDate = this.studentSession.date || this.formatDate(this.today);
    if (dateLabelEl) {
      dateLabelEl.textContent = `${targetDate} 중식 식단`;
    }
    if (statusBadgeEl) {
      statusBadgeEl.textContent = '🔄 양산희망학교 식단 불러오는 중...';
    }

    const dietData = await YangsanDietService.getDietForDate(targetDate, forceRefresh);
    const lunchItems = dietData.items || [];

    if (statusBadgeEl) {
      statusBadgeEl.textContent = `✅ ${dietData.source}`;
    }

    // 카드 개수에 맞춰 대칭형 그리드 컬럼(예: 6개면 3x2, 5개면 5x1) 자동 지정
    container.setAttribute('data-count', String(lunchItems.length));
    container.innerHTML = '';

    lunchItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'lunch-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `급식 메뉴 ${item.name} 선택하기`);

      // 긴 메뉴 이름을 의미 단위로 자동 줄바꿈 분할 및 글자 크기 자동 조절
      const lines = YangsanDietService.splitDishIntoBalancedLines(item.name);
      const maxLineLen = Math.max(...lines.map(l => l.length));
      const totalLen = item.name.length;

      let sizeClass = '';
      if (maxLineLen >= 8 || totalLen >= 11) {
        sizeClass = 'is-lg-text';
      } else if (maxLineLen >= 6 || totalLen >= 7) {
        sizeClass = 'is-md-text';
      }

      const formattedLinesHTML = lines
        .map(line => `<span class="dish-line">${line}</span>`)
        .join('');

      card.innerHTML = `
        <div class="lunch-icon-wrapper" aria-hidden="true">${item.icon || '🍱'}</div>
        <div class="lunch-name ${sizeClass}">${formattedLinesHTML}</div>
        <div class="lunch-card-btns">
          <button type="button" class="lunch-speak-btn" aria-label="${item.name} 소리 듣기">
            <span>🔊</span> 소리 듣기
          </button>
        </div>
      `;

      const speakBtn = card.querySelector('.lunch-speak-btn');
      if (speakBtn) {
        speakBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.soundCtrl) {
            window.soundCtrl.playClick();
            window.soundCtrl.speak(item.name);
          }
        });
      }

      card.addEventListener('click', () => {
        this.handleLunchSelect(item.name, card);
      });

      container.appendChild(card);
    });

    if (this.currentStep === 4 && lunchItems.length > 0 && window.soundCtrl) {
      const menuNames = lunchItems.map(i => i.name.replace(/\//g, ', ')).join(', ');
      window.soundCtrl.speak(`양산희망학교 오늘의 급식 메뉴는 ${menuNames} 이야. 가장 먹고 싶은 음식 카드를 눌러봐.`);
    }
  }

  handleLunchSelect(menuName, cardEl) {
    document.querySelectorAll('.lunch-card').forEach(c => c.classList.remove('active'));
    if (cardEl) cardEl.classList.add('active');

    this.studentSession.lunch = menuName;

    if (window.soundCtrl) {
      window.soundCtrl.playStepComplete();
      const spokenMenu = menuName.replace(/\//g, ', ');
      window.soundCtrl.speak(`${spokenMenu} 메뉴를 골랐구나. 정말 맛있겠다. 이제 마지막 다섯 번째 단계 문장 따라 쓰기를 해보자.`, () => {
        setTimeout(() => this.goToStep(5, false), 200);
      });
    } else {
      this.goToStep(5, true);
    }
  }

  // ==========================================================================
  // [5단계] 오늘의 한 문장 따라 쓰기 & 커스텀 자판 연동
  // ==========================================================================
  initWritingStage() {
    this.keyboardInstance = new KoreanAccessibilityKeyboard({
      containerEl: document.getElementById('keyboardRoot'),
      onSentenceComplete: (completedText) => {
        this.handleSentenceSuccess(completedText);
      }
    });

    const btnSentenceTTS = document.getElementById('btnSentenceTTS');
    if (btnSentenceTTS) {
      btnSentenceTTS.addEventListener('click', () => {
        if (this.studentSession.sentence && window.soundCtrl) {
          window.soundCtrl.speak(this.studentSession.sentence);
        }
      });
    }

    const btnRestart = document.getElementById('btnRestartTask');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        this.hideCelebration();
        this.studentSession = {
          date: this.formatDate(this.today),
          weather: null,
          weatherLabel: '',
          emotion: null,
          emotionLabel: '',
          lunch: '',
          sentence: '',
          completedAt: null
        };
        this.goToStep(1, true);
      });
    }
  }

  setupSentenceWriting() {
    let sentenceText = localStorage.getItem('daily_korean_selected_sentence');
    let category = '오늘의 문장';

    let db = [];
    try {
      db = JSON.parse(localStorage.getItem('daily_korean_sentences')) || [];
    } catch (e) {
      db = [];
    }

    if (sentenceText) {
      const matchedItem = db.find(item => item.text === sentenceText);
      if (matchedItem && matchedItem.category) {
        category = matchedItem.category;
      }
    } else if (db.length > 0) {
      const randomIndex = Math.floor(Math.random() * db.length);
      sentenceText = db[randomIndex].text;
      category = db[randomIndex].category || '오늘의 문장';
    } else {
      sentenceText = '봄바람이 살랑살랑 불어요';
    }

    this.studentSession.sentence = sentenceText;

    const catBadge = document.getElementById('sentenceCategoryBadge');
    if (catBadge) {
      catBadge.textContent = category;
    }

    if (this.keyboardInstance) {
      this.keyboardInstance.setTargetSentence(sentenceText);
    }

    if (this.currentStep === 5 && window.soundCtrl) {
      window.soundCtrl.speak(`오늘 따라 쓸 문장은, ${sentenceText}, 이야. 초록색 테두리가 반짝이는 글자 버튼을 순서대로 눌러봐.`);
    }
  }

  handleSentenceSuccess(completedText) {
    this.studentSession.completedAt = new Date().toISOString();
    this.saveDailyRecord();

    if (window.soundCtrl) {
      window.soundCtrl.playFanfare();
    }

    this.showCelebration();

    setTimeout(() => {
      if (window.soundCtrl) {
        window.soundCtrl.speak('우와, 정말 대단해. 오늘의 매일 국어 다섯 단계 과제를 모두 멋지게 끝마쳤어. 오늘도 최고야.');
      }
    }, 650);
  }

  saveDailyRecord() {
    let records = [];
    try {
      records = JSON.parse(localStorage.getItem('daily_korean_records')) || [];
    } catch (e) {
      records = [];
    }

    const newRecord = {
      id: Date.now(),
      date: this.studentSession.date || this.formatDate(new Date()),
      weather: this.studentSession.weather || 'sunny',
      weatherLabel: this.studentSession.weatherLabel || '맑음',
      emotion: this.studentSession.emotion || 'happy',
      emotionLabel: this.studentSession.emotionLabel || '기뻐요',
      lunch: this.studentSession.lunch || '소불고기',
      sentence: this.studentSession.sentence,
      completedAt: this.studentSession.completedAt,
      isSuccess: true
    };

    records.push(newRecord);
    localStorage.setItem('daily_korean_records', JSON.stringify(records));
  }

  showCelebration() {
    const overlay = document.getElementById('celebrationModal');
    if (overlay) {
      overlay.classList.add('active');
    }
    this.startConfetti();
  }

  hideCelebration() {
    const overlay = document.getElementById('celebrationModal');
    if (overlay) {
      overlay.classList.remove('active');
    }
    this.stopConfetti();
  }

  startConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const confettiCount = 130;
    const pieces = [];

    for (let i = 0; i < confettiCount; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 13 + 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 4.5 + 2.5,
        angle: Math.random() * 360,
        spin: Math.random() * 0.12 - 0.06
      });
    }

    let isRunning = true;
    this.confettiLoop = () => {
      if (!isRunning) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      pieces.forEach(p => {
        p.y += p.speed;
        p.angle += p.spin;
        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      requestAnimationFrame(this.confettiLoop);
    };

    requestAnimationFrame(this.confettiLoop);
    this._stopConfettiFlag = () => {
      isRunning = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }

  stopConfetti() {
    if (this._stopConfettiFlag) {
      this._stopConfettiFlag();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('stepSection_1')) {
    window.studentApp = new StudentApp();
  }
});
