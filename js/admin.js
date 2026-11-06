/**
 * ============================================================================
 * [Admin Engine] 교사용 관리자 웹앱 & 양산희망학교 식단 연동/기록 관리 (admin.js)
 * - 1. 학생 일일 학습 기록 뷰어 (Daily Record Viewer / 캘린더 & 상세 카드)
 * - 2. 양산희망학교 식단 자동 동기화, 텍스트 정제기, 당일 급식 메뉴 관리
 * - 3. 오늘의 한 문장 데이터베이스 관리 (카테고리별 등록, 지정/랜덤 출제)
 * ============================================================================
 */

class AdminController {
  constructor() {
    this.currentTab = 'records';
    this.calDate = new Date();
    this.selectedDateStr = this.formatDate(new Date());

    this.init();
  }

  init() {
    this.bindTabEvents();
    this.initRecordsViewer();
    this.initLunchManager();
    this.initSentenceManager();
  }

  formatDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  bindTabEvents() {
    const tabs = document.querySelectorAll('.admin-nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const targetTab = tab.getAttribute('data-tab');
        this.currentTab = targetTab;

        document.querySelectorAll('.admin-tab-pane').forEach(pane => {
          pane.classList.remove('active');
        });
        const activePane = document.getElementById(`tabPane_${targetTab}`);
        if (activePane) {
          activePane.classList.add('active');
        }

        if (targetTab === 'records') {
          this.renderRecordsCalendar();
          this.renderRecordDetails(this.selectedDateStr);
          this.renderRecordsTable();
        } else if (targetTab === 'lunch') {
          this.renderLunchList();
        } else if (targetTab === 'sentences') {
          this.renderSentenceList();
        }
      });
    });
  }

  // ==========================================================================
  // [1] 학생 일일 학습 기록 뷰어 (Daily Record Viewer)
  // ==========================================================================
  initRecordsViewer() {
    const prevMonthBtn = document.getElementById('btnPrevMonth');
    const nextMonthBtn = document.getElementById('btnNextMonth');
    const todayMonthBtn = document.getElementById('btnTodayMonth');

    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => {
        this.calDate.setMonth(this.calDate.getMonth() - 1);
        this.renderRecordsCalendar();
      });
    }

    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => {
        this.calDate.setMonth(this.calDate.getMonth() + 1);
        this.renderRecordsCalendar();
      });
    }

    if (todayMonthBtn) {
      todayMonthBtn.addEventListener('click', () => {
        this.calDate = new Date();
        this.selectedDateStr = this.formatDate(new Date());
        this.renderRecordsCalendar();
        this.renderRecordDetails(this.selectedDateStr);
      });
    }

    const btnSampleData = document.getElementById('btnGenerateSampleData');
    if (btnSampleData) {
      btnSampleData.addEventListener('click', () => {
        this.generateSampleRecords();
      });
    }

    const btnClearRecords = document.getElementById('btnClearAllRecords');
    if (btnClearRecords) {
      btnClearRecords.addEventListener('click', () => {
        if (confirm('모든 학생 학습 기록을 삭제하시겠습니까?')) {
          localStorage.removeItem('daily_korean_records');
          this.renderRecordsCalendar();
          this.renderRecordDetails(this.selectedDateStr);
          this.renderRecordsTable();
          alert('기록이 초기화되었습니다.');
        }
      });
    }

    const btnExportJSON = document.getElementById('btnExportJSON');
    if (btnExportJSON) {
      btnExportJSON.addEventListener('click', () => {
        const records = localStorage.getItem('daily_korean_records') || '[]';
        const blob = new Blob([records], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `양산희망학교_매일국어_학습기록_${this.formatDate(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    this.renderRecordsCalendar();
    this.renderRecordDetails(this.selectedDateStr);
    this.renderRecordsTable();
  }

  getStoredRecords() {
    try {
      return JSON.parse(localStorage.getItem('daily_korean_records')) || [];
    } catch (e) {
      return [];
    }
  }

  renderRecordsCalendar() {
    const grid = document.getElementById('adminCalendarGrid');
    const titleEl = document.getElementById('adminCalendarTitle');
    if (!grid || !titleEl) return;

    const year = this.calDate.getFullYear();
    const month = this.calDate.getMonth();

    titleEl.textContent = `${year}년 ${month + 1}월`;
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const allRecords = this.getStoredRecords();

    for (let i = 0; i < firstDay; i++) {
      const blank = document.createElement('div');
      blank.className = 'admin-cal-day disabled';
      grid.appendChild(blank);
    }

    for (let day = 1; day <= lastDate; day++) {
      const cell = document.createElement('div');
      cell.className = 'admin-cal-day';
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (dateString === this.selectedDateStr) {
        cell.classList.add('selected');
      }

      const dayRecords = allRecords.filter(r => r.date === dateString);
      const hasRecord = dayRecords.length > 0;

      cell.innerHTML = `
        <div class="day-num">${day}</div>
        ${hasRecord ? `<div class="record-badge" title="완료 기록 ${dayRecords.length}건">★ 완료</div>` : ''}
      `;

      if (hasRecord) {
        cell.classList.add('has-record');
      }

      cell.addEventListener('click', () => {
        this.selectedDateStr = dateString;
        this.renderRecordsCalendar();
        this.renderRecordDetails(dateString);
      });

      grid.appendChild(cell);
    }
  }

  renderRecordDetails(dateStr) {
    const detailBox = document.getElementById('recordDetailPanel');
    if (!detailBox) return;

    const allRecords = this.getStoredRecords();
    const targetRecords = allRecords.filter(r => r.date === dateStr);

    if (targetRecords.length === 0) {
      detailBox.innerHTML = `
        <div class="empty-record-notice">
          <div class="empty-icon">📅</div>
          <div class="empty-title">${dateStr}</div>
          <p>이 날짜에 저장된 학생 학습 기록이 없습니다.</p>
        </div>
      `;
      return;
    }

    const rec = targetRecords[targetRecords.length - 1];
    const weatherIconMap = {
      sunny: '☀️ 맑음',
      cloudy: '☁️ 흐림',
      rainy: '🌧️ 비',
      snowy: '❄️ 눈'
    };
    const emotionIconMap = {
      happy: '😊 기쁨',
      sad: '😢 슬픔',
      angry: '😠 화남',
      excited: '🤩 신남'
    };

    const completedTimeStr = rec.completedAt
      ? new Date(rec.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : '완료';

    detailBox.innerHTML = `
      <div class="record-summary-card">
        <div class="record-card-header">
          <span class="record-date-badge">${rec.date}</span>
          <span class="record-success-tag">과제 완료 (${completedTimeStr})</span>
        </div>

        <div class="record-detail-grid">
          <div class="record-item">
            <span class="item-label">오늘의 날씨</span>
            <span class="item-value highlight-weather">${weatherIconMap[rec.weather] || rec.weatherLabel || '선택됨'}</span>
          </div>
          <div class="record-item">
            <span class="item-label">나의 기분</span>
            <span class="item-value highlight-emotion">${emotionIconMap[rec.emotion] || rec.emotionLabel || '선택됨'}</span>
          </div>
          <div class="record-item">
            <span class="item-label">선호 급식 메뉴</span>
            <span class="item-value highlight-lunch">🍱 ${rec.lunch}</span>
          </div>
          <div class="record-item full-width">
            <span class="item-label">따라 쓴 문장</span>
            <span class="item-value highlight-sentence">"${rec.sentence}"</span>
          </div>
        </div>

        <div class="teacher-memo-area">
          <label for="teacherMemoInput" class="memo-label" style="font-weight: 800;">교사 지도 피드백 / 메모:</label>
          <textarea id="teacherMemoInput" class="teacher-memo-input" rows="3" placeholder="학생의 손가락 터치 수행 상태나 반응을 기록하세요...">${rec.memo || ''}</textarea>
          <button type="button" class="btn-3d btn-primary btn-save-memo" id="btnSaveMemo">메모 저장</button>
        </div>
      </div>
    `;

    const btnSaveMemo = document.getElementById('btnSaveMemo');
    if (btnSaveMemo) {
      btnSaveMemo.addEventListener('click', () => {
        const memoText = document.getElementById('teacherMemoInput').value.trim();
        rec.memo = memoText;
        localStorage.setItem('daily_korean_records', JSON.stringify(allRecords));
        alert('지도 메모가 저장되었습니다.');
      });
    }
  }

  renderRecordsTable() {
    const tableBody = document.getElementById('recordsTableBody');
    if (!tableBody) return;

    const allRecords = this.getStoredRecords().reverse();

    if (allRecords.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">기록이 없습니다.</td></tr>`;
      return;
    }

    tableBody.innerHTML = allRecords.map(r => `
      <tr>
        <td><strong>${r.date}</strong></td>
        <td>${r.weatherLabel || r.weather}</td>
        <td>${r.emotionLabel || r.emotion}</td>
        <td>${r.lunch}</td>
        <td>${r.sentence}</td>
        <td><span class="table-tag-success">완료</span></td>
      </tr>
    `).join('');
  }

  generateSampleRecords() {
    const today = new Date();
    const sampleRecords = [];

    const weatherList = [
      { key: 'sunny', label: '맑음' },
      { key: 'cloudy', label: '흐림' },
      { key: 'rainy', label: '비' },
      { key: 'snowy', label: '눈' }
    ];
    const emotionList = [
      { key: 'happy', label: '기뻐요' },
      { key: 'excited', label: '신나요' },
      { key: 'happy', label: '기뻐요' },
      { key: 'sad', label: '슬퍼요' }
    ];
    const lunchList = ['소불고기', '수제등심돈가스', '돈육메추리알장조림', '오리불고기', '한우미역국'];
    const sentenceList = [
      '봄바람이 살랑살랑 불어요',
      '맑은 하늘이 참 예쁘다',
      '오늘도 참 잘했어요',
      '가는 말이 고와야 오는 말이 곱다',
      '나비야 나비야 이리 날아오너라'
    ];

    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = this.formatDate(d);

      sampleRecords.push({
        id: Date.now() - i * 100000,
        date: dateStr,
        weather: weatherList[i % 4].key,
        weatherLabel: weatherList[i % 4].label,
        emotion: emotionList[i % 4].key,
        emotionLabel: emotionList[i % 4].label,
        lunch: lunchList[i % lunchList.length],
        sentence: sentenceList[i % sentenceList.length],
        completedAt: d.toISOString(),
        isSuccess: true,
        memo: i === 0 ? '양산희망학교 식단 음성 안내 후 스스로 좋아하는 메뉴를 정확히 터치함.' : ''
      });
    }

    localStorage.setItem('daily_korean_records', JSON.stringify(sampleRecords));
    alert('체험용 학습 기록 5건이 생성되었습니다.');
    this.renderRecordsCalendar();
    this.renderRecordDetails(this.selectedDateStr);
    this.renderRecordsTable();
  }

  // ==========================================================================
  // [2] 양산희망학교 급식 메뉴 자동 동기화 & 관리
  // ==========================================================================
  initLunchManager() {
    const syncDateInput = document.getElementById('adminSyncDateInput');
    if (syncDateInput) {
      syncDateInput.value = this.formatDate(new Date());
    }

    // 양산희망학교 식단 실시간 동기화 버튼
    const btnAutoSync = document.getElementById('btnAdminAutoSyncDiet');
    if (btnAutoSync) {
      btnAutoSync.addEventListener('click', async () => {
        const targetDate = syncDateInput ? syncDateInput.value : this.formatDate(new Date());
        const badgeEl = document.getElementById('adminSyncResultBadge');
        if (badgeEl) badgeEl.textContent = '🔄 식단 동기화 중...';

        localStorage.removeItem('daily_korean_lunch_custom_override');
        if (window.YangsanDietService) {
          const result = await window.YangsanDietService.getDietForDate(targetDate, true);
          this.renderLunchList();
          if (badgeEl) badgeEl.textContent = `✅ ${targetDate} (${result.source}) 반영 완료!`;
        }
      });
    }

    // 양산희망학교 홈페이지 식단 텍스트 붙여넣기 자동 정제기
    const btnParseRaw = document.getElementById('btnParseRawDiet');
    if (btnParseRaw) {
      btnParseRaw.addEventListener('click', () => {
        const rawInput = document.getElementById('rawDietPasteInput');
        if (!rawInput || !rawInput.value.trim()) {
          alert('양산희망학교 식단표 페이지에서 복사한 식단 텍스트를 입력해주세요.');
          return;
        }

        const lines = rawInput.value.split(/[\n,\/]+/).map(s => s.trim()).filter(Boolean);
        if (window.YangsanDietService) {
          const parsedItems = window.YangsanDietService.parseRawDishLines(lines);
          if (parsedItems.length > 0) {
            localStorage.setItem('daily_korean_lunch_menu', JSON.stringify(parsedItems));
            localStorage.setItem('daily_korean_lunch_custom_override', 'true');
            rawInput.value = '';
            this.renderLunchList();
            alert(`총 ${parsedItems.length}개의 메뉴가 알레르기 번호 제거 및 아이콘 자동 매칭되어 반영되었습니다!`);
          } else {
            alert('유효한 메뉴 이름을 찾지 못했습니다.');
          }
        }
      });
    }

    const form = document.getElementById('addLunchForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('lunchNameInput');
        const iconSelect = document.getElementById('lunchIconSelect');

        const rawName = nameInput.value.trim();
        if (!rawName) return;

        const cleanName = window.YangsanDietService ? window.YangsanDietService.cleanDishName(rawName) : rawName;
        const icon = iconSelect.value || (window.YangsanDietService ? window.YangsanDietService.detectFoodIcon(cleanName) : '🍱');

        const menu = this.getLunchMenu();
        menu.push({ id: Date.now(), name: cleanName, icon });
        localStorage.setItem('daily_korean_lunch_menu', JSON.stringify(menu));
        localStorage.setItem('daily_korean_lunch_custom_override', 'true');

        nameInput.value = '';
        this.renderLunchList();
      });
    }

    document.querySelectorAll('.btn-preset-lunch').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-preset');
        this.applyLunchPreset(presetKey);
      });
    });

    // 초기 메뉴가 비어있다면 양산희망학교 오늘 식단 자동 로드
    if (this.getLunchMenu().length === 0 && window.YangsanDietService) {
      window.YangsanDietService.getDietForDate(this.formatDate(new Date()), false).then(() => {
        this.renderLunchList();
      });
    } else {
      this.renderLunchList();
    }
  }

  getLunchMenu() {
    try {
      return JSON.parse(localStorage.getItem('daily_korean_lunch_menu')) || [];
    } catch (e) {
      return [];
    }
  }

  renderLunchList() {
    const listEl = document.getElementById('lunchManageList');
    if (!listEl) return;

    const menu = this.getLunchMenu();
    if (menu.length === 0) {
      listEl.innerHTML = `<div class="empty-notice">등록된 급식 메뉴가 없습니다. 위 동기화 버튼을 누르거나 메뉴를 추가해주세요.</div>`;
      return;
    }

    listEl.innerHTML = '';
    menu.forEach(item => {
      const row = document.createElement('div');
      row.className = 'admin-lunch-item';
      row.innerHTML = `
        <span class="lunch-item-icon">${item.icon || '🍱'}</span>
        <span class="lunch-item-name">${item.name}</span>
        <button type="button" class="btn-delete-item">삭제</button>
      `;
      row.querySelector('.btn-delete-item').addEventListener('click', () => {
        this.deleteLunchItem(item.id);
      });
      listEl.appendChild(row);
    });
  }

  deleteLunchItem(id) {
    const menu = this.getLunchMenu().filter(m => m.id !== id);
    localStorage.setItem('daily_korean_lunch_menu', JSON.stringify(menu));
    localStorage.setItem('daily_korean_lunch_custom_override', 'true');
    this.renderLunchList();
  }

  applyLunchPreset(preset) {
    const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
    const dayIdx = dayMap[preset] || 1;
    const weeklyDB = window.YangsanDietService ? window.YangsanDietService.getWeeklySchoolMenus() : {};
    const selectedMenu = (weeklyDB[dayIdx] || []).map((item, idx) => ({
      id: Date.now() + idx,
      name: item.name,
      icon: item.icon
    }));

    if (selectedMenu.length > 0) {
      localStorage.setItem('daily_korean_lunch_menu', JSON.stringify(selectedMenu));
      localStorage.setItem('daily_korean_lunch_custom_override', 'true');
      this.renderLunchList();
      alert('선택한 요일의 양산희망학교 표준 식단이 적용되었습니다.');
    }
  }

  // ==========================================================================
  // [3] 오늘의 한 문장 데이터베이스 관리
  // ==========================================================================
  initSentenceManager() {
    const form = document.getElementById('addSentenceForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const catSelect = document.getElementById('sentenceCategorySelect');
        const textInput = document.getElementById('sentenceTextInput');

        const category = catSelect.value || '문장';
        const text = textInput.value.trim();

        if (!text) return;

        const list = this.getSentenceList();
        list.push({ id: Date.now(), category, text });
        localStorage.setItem('daily_korean_sentences', JSON.stringify(list));

        textInput.value = '';
        this.renderSentenceList();
      });
    }

    const btnResetRandom = document.getElementById('btnResetRandomSentence');
    if (btnResetRandom) {
      btnResetRandom.addEventListener('click', () => {
        localStorage.removeItem('daily_korean_selected_sentence');
        this.renderSentenceList();
        alert('무작위(랜덤) 문장 출제 모드로 전환되었습니다.');
      });
    }

    this.renderSentenceList();
  }

  getSentenceList() {
    try {
      return JSON.parse(localStorage.getItem('daily_korean_sentences')) || [];
    } catch (e) {
      return [];
    }
  }

  renderSentenceList() {
    const listEl = document.getElementById('sentenceManageList');
    const curSentenceEl = document.getElementById('adminCurrentSentenceDisplay');
    if (!listEl) return;

    const list = this.getSentenceList();
    const selected = localStorage.getItem('daily_korean_selected_sentence');

    if (curSentenceEl) {
      curSentenceEl.textContent = selected ? `"${selected}" (고정 출제 중)` : '(무작위 출제 모드)';
    }

    if (list.length === 0) {
      listEl.innerHTML = `<div class="empty-notice">등록된 문장이 없습니다. 위 폼에서 추가해주세요.</div>`;
      return;
    }

    listEl.innerHTML = '';
    list.forEach(item => {
      const isSelected = selected === item.text;
      const row = document.createElement('div');
      row.className = `admin-sentence-item ${isSelected ? 'is-selected' : ''}`;
      row.innerHTML = `
        <span class="sentence-category-tag">${item.category}</span>
        <span class="sentence-text">"${item.text}"</span>
        <div class="sentence-actions">
          <button type="button" class="btn-select-sentence">
            ${isSelected ? '✓ 출제 중' : '출제 문장으로 지정'}
          </button>
          <button type="button" class="btn-delete-item">삭제</button>
        </div>
      `;

      row.querySelector('.btn-select-sentence').addEventListener('click', () => {
        this.selectDailySentence(item.text);
      });
      row.querySelector('.btn-delete-item').addEventListener('click', () => {
        this.deleteSentenceItem(item.id);
      });

      listEl.appendChild(row);
    });
  }

  selectDailySentence(text) {
    localStorage.setItem('daily_korean_selected_sentence', text);
    this.renderSentenceList();
    alert(`"${text}" 문장이 오늘 출제 문장으로 고정되었습니다.`);
  }

  deleteSentenceItem(id) {
    const list = this.getSentenceList().filter(s => s.id !== id);
    localStorage.setItem('daily_korean_sentences', JSON.stringify(list));
    this.renderSentenceList();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.adminCtrl = new AdminController();
});
