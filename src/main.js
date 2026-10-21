import './style.css';

// ================= API 連線封裝 =================
// 前端只呼叫同網域的 /api/gas（Vercel Serverless），Token 不再出現在前端程式碼中。
async function callBackend(action, data = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let res;
  try {
    res = await fetch('/api/gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data }),
      signal: ctrl.signal
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '連線逾時，請檢查網路後再試一次。' : '無法連線，請檢查網路後再試一次。');
  } finally { clearTimeout(timer); }
  let json;
  try { json = await res.json(); } catch (e) { throw new Error('系統目前較忙碌，請等 1 分鐘後再試。'); }
  if (json.success === false) {
    const err = new Error(json.message || '發生錯誤');
    err.payload = json;
    throw err;
  }
  return json.data !== undefined ? json.data : json;
}

// ---- 檔案處理：圖片自動壓縮（手機照片常超過 5MB）----
function readB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('讀取檔案失敗'));
    r.readAsDataURL(file);
  });
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('無法讀取這張圖片，請改用拍照或轉成 JPG 後再上傳。')); };
    img.src = url;
  });
}
async function prepareFile(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 2.5 * 1024 * 1024) throw new Error('PDF 請小於 2.5MB，或改用拍照上傳。');
    return { base64: await readB64(file), name: file.name, type: file.type };
  }
  if (!file.type.startsWith('image/')) throw new Error('僅支援圖片或 PDF 檔案。');
  const img = await loadImage(file);
  const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * ratio); c.height = Math.round(img.height * ratio);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.72);
  return { base64: dataUrl.split(',')[1], name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg' };
}

// 供原本程式碼做全域綁定
window.showPage = showPage;
window.handleAdminLogin = handleAdminLogin;
window.closeAdminPanel = closeAdminPanel;
window.showAdminTab = showAdminTab;
window.addClassRow = addClassRow;
window.updateStatus = updateStatus;
window.loadLotteryParticipants = loadLotteryParticipants;
window.runLottery = runLottery;
window.downloadLotteryResult = downloadLotteryResult;
window.closeDocPreview = closeDocPreview;
window.hideModal = hideModal;
window.toggleSound = toggleSound;
window.showDocPreview = showDocPreview;
let lotteryAlreadyDrawn = false;
let lastQueryPhone = '';

let settings = {};
let classSettings = { grades: [], classes: {} };
let previewData = [];
let countdownInterval;
let messageModalTimeout;
let adminPassword = '';
let pendingUpdateAction = null;
let currentResubmitData = null;
let loadingInterval;
let soundEnabled = true;
let hasLoadedInitialData = false; 

const systemTitle = document.getElementById('system-title');
const deadlineDisplay = document.getElementById('deadline-display');
const countdownElement = document.getElementById('countdown');
const registrationStatusMessageDiv = document.getElementById('registrationStatusMessage');
const statusTextElement = document.getElementById('statusText');
const timeInfoElement = document.getElementById('timeInfo');
const registrationFormContainerDiv = document.getElementById('registrationFormContainer');
const registrationPage = document.getElementById('registration-page');
const queryPage = document.getElementById('query-page');
const tabButtons = document.querySelectorAll('.tab-button');
const parentPhoneInput = document.getElementById('parent-phone');
const parentPhoneError = document.getElementById('parent-phone-error');
const studentNameInput = document.getElementById('student-name');
const studentNameError = document.getElementById('student-name-error');
const studentGradeSelect = document.getElementById('student-grade');
const studentClassSelect = document.getElementById('student-class');
const studentClassError = document.getElementById('student-class-error');
const studentGenderSelect = document.getElementById('student-gender');
const studentGenderError = document.getElementById('student-gender-error');
const priorityDescriptionDiv = document.getElementById('priority-description');
const studentPrioritySelect = document.getElementById('student-priority');
const studentPriorityError = document.getElementById('student-priority-error');
const fileUploadArea = document.getElementById('file-upload-area');
const priorityDocumentInput = document.getElementById('priority-document');
const fileUploadText = document.getElementById('file-upload-text');
const announcementADiv = document.getElementById('announcement-a');
const announcementBDiv = document.getElementById('announcement-b');
const addToPreviewButton = document.getElementById('add-to-preview-button');
const previewArea = document.getElementById('preview-area');
const addAnotherButton = document.getElementById('add-another-button');
const submitRegistrationButton = document.getElementById('submit-registration-button');
const buttonGroup = document.querySelector('.button-group');
const queryPhoneInput = document.getElementById('query-phone');
const queryPhoneError = document.getElementById('query-phone-error');
const queryNameGroup = document.getElementById('query-name-group');
const queryNameInput = document.getElementById('query-name');
const queryNameError = document.getElementById('query-name-error');
const queryButton = document.getElementById('query-button');
const queryResultsArea = document.getElementById('query-results-area');
const messageModal = document.getElementById('message-modal');
const modalMessage = document.getElementById('modal-message');
const adminLoginBtn = document.getElementById('admin-login-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const saveClassesBtn = document.getElementById('save-classes-btn');
const refreshReviewBtn = document.getElementById('refresh-review-btn');
const clearAllDataBtn = document.getElementById('clear-all-data-btn');
const confirmModal = document.getElementById('confirm-modal');
const confirmMessage = document.getElementById('confirm-message');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmNoBtn = document.getElementById('confirm-no-btn');
const resubmitModal = document.getElementById('resubmit-modal');
const resubmitFile = document.getElementById('resubmit-file');
const resubmitFileText = document.getElementById('resubmit-file-text');
const submitResubmitBtn = document.getElementById('submit-resubmit-btn');

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-icon').innerText = soundEnabled ? '🔈' : '🔇';
  document.getElementById('sound-text').innerText = soundEnabled ? '音效開啟' : '靜音中';
}

function playTickSound() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch(e) {}
}

function playCheerSound() {
  if (!soundEnabled) return;
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
    audio.volume = 0.6;
    audio.play().catch(e => {});
  } catch(e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  // 先用上次的設定畫面，背景再向伺服器更新（減少等待空白）
  try {
    const c = JSON.parse(localStorage.getItem('as_cfg') || 'null');
    if (c) { loadSettings(c.settings); loadClassSettings(c.classSettings); }
  } catch (e) {}
  callBackend('getInitialData')
    .then(initPageData)
    .catch(showError);
  setupEventListeners();
  renderPreview();
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['message-modal', 'admin-login-modal', 'resubmit-modal', 'confirm-modal'].forEach(id => {
      const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });
    closeDocPreview();
  });
});

function initPageData(data) {
  if (!data) return;
  hasLoadedInitialData = true;
  try { localStorage.setItem('as_cfg', JSON.stringify({ settings: data.settings, classSettings: data.classSettings })); } catch (e) {}
  handleStatus(data.status);
  loadSettings(data.settings);
  loadClassSettings(data.classSettings);
}

function setupEventListeners() {
  if(studentGradeSelect) studentGradeSelect.addEventListener('change', updateClassOptions);
  if(studentPrioritySelect) studentPrioritySelect.addEventListener('change', toggleFileUpload);
  if(parentPhoneInput) {
    parentPhoneInput.addEventListener('input', validatePhoneNumberInput);
    parentPhoneInput.addEventListener('blur', sanitizePhoneNumber);
  }
  if(queryPhoneInput) {
    queryPhoneInput.addEventListener('input', validatePhoneNumberInput);
    queryPhoneInput.addEventListener('blur', sanitizePhoneNumber);
  }
  if(priorityDocumentInput) {
    priorityDocumentInput.addEventListener('change', function() {
      if (this.files && this.files.length > 0) {
        fileUploadText.innerHTML = `<span style="color:#2F855A;">✅ 已選擇: ${escapeHTML(this.files[0].name)}</span>`;
      } else {
        fileUploadText.innerHTML = `點擊或拖曳上傳證明文件<br><span style="font-size:0.8em; color:#6B7788; font-weight:normal;">(支援圖片/PDF, 5MB內)</span>`;
      }
    });
  }
  if(resubmitFile) {
    resubmitFile.addEventListener('change', function() {
      if (this.files && this.files.length > 0) {
        resubmitFileText.innerHTML = `<span style="color:#2F855A;">✅ 已選擇: ${escapeHTML(this.files[0].name)}</span>`;
      } else {
        resubmitFileText.innerHTML = `點擊或拖曳上傳補件資料<br><span style="font-size:0.8em; color:#6B7788; font-weight:normal;">(支援圖片/PDF, 5MB內)</span>`;
      }
    });
  }
  if(addToPreviewButton) addToPreviewButton.addEventListener('click', handleAddToPreview);
  if(addAnotherButton) addAnotherButton.addEventListener('click', handleAddAnother);
  if(submitRegistrationButton) submitRegistrationButton.addEventListener('click', handleSubmitRegistration);
  if(queryButton) queryButton.addEventListener('click', handleQuery);
  if(adminLoginBtn) adminLoginBtn.addEventListener('click', handleAdminLogin);
  if(saveSettingsBtn) saveSettingsBtn.addEventListener('click', handleSaveSettings);
  if(saveClassesBtn) saveClassesBtn.addEventListener('click', handleSaveClasses);
  if(refreshReviewBtn) refreshReviewBtn.addEventListener('click', loadReviewData);
  if(clearAllDataBtn) clearAllDataBtn.addEventListener('click', handleClearAllData);
  if(confirmYesBtn) confirmYesBtn.addEventListener('click', () => {
    if (pendingUpdateAction) pendingUpdateAction();
    confirmModal.classList.add('hidden');
  });
  if(confirmNoBtn) confirmNoBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    pendingUpdateAction = null;
  });
  if(submitResubmitBtn) submitResubmitBtn.addEventListener('click', submitResubmission);
  if(queryResultsArea) queryResultsArea.addEventListener('click', (e) => {
    const b = e.target.closest('.resubmit-btn');
    if (b) handleResubmitClick(b.dataset.phone, b.dataset.id);
  });
  const copyEl = document.getElementById('consent-checkbox');
  if (copyEl) copyEl.addEventListener('change', () => { document.getElementById('consent-error').textContent = ''; });
}

function handleStatus(result) {
  if (!registrationStatusMessageDiv || !registrationFormContainerDiv) return;
  registrationStatusMessageDiv.classList.add('hidden');
  registrationFormContainerDiv.classList.add('hidden');
  if(deadlineDisplay) deadlineDisplay.parentNode.classList.add('hidden');
  if (result.status === 'open') {
    registrationFormContainerDiv.classList.remove('hidden');
    if(deadlineDisplay) deadlineDisplay.parentNode.classList.remove('hidden');
    enableRegistrationForm();
  } else {
    registrationStatusMessageDiv.classList.remove('hidden');
    statusTextElement.innerText = result.message || '無法報名';
    timeInfoElement.innerText = result.status === 'closed_before' ? `預計開放時間：${result.startTime}` : `已於 ${result.endTime} 截止`;
    disableRegistrationForm();
  }
}

function showPage(page) {
  if (page === 'registration') {
    registrationPage.classList.add('active');
    queryPage.classList.remove('active');
    if (tabButtons[0]) tabButtons[0].classList.add('active');
    if (tabButtons[1]) tabButtons[1].classList.remove('active');
    
    // 效能優化：不再重複打 API
    if (!hasLoadedInitialData) {
      callBackend('getRegistrationStatusAndTimes').then(handleStatus).catch(showError);
    }
  } else {
    registrationPage.classList.remove('active');
    queryPage.classList.add('active');
    if (tabButtons[0]) tabButtons[0].classList.remove('active');
    if (tabButtons[1]) tabButtons[1].classList.add('active');
    if(queryResultsArea) {
      queryResultsArea.innerHTML = '';
      queryResultsArea.classList.add('hidden');
      queryResultsArea.classList.remove('has-content');
    }
    if(queryPhoneInput) queryPhoneInput.value = '';
    if(queryPhoneError) queryPhoneError.textContent = '';
    if(queryNameInput) queryNameInput.value = '';
    if(queryNameError) queryNameError.textContent = '';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    const topElement = document.querySelector('.container');
    if (topElement) topElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function loadSettings(loadedSettings) {
  if (!loadedSettings || loadedSettings.error) {
    if (loadedSettings && loadedSettings.error) showError(loadedSettings.error);
    return;
  }
  settings = loadedSettings;
  if(systemTitle) systemTitle.textContent = settings.title || '報名系統';
  if(priorityDescriptionDiv) {
    priorityDescriptionDiv.innerHTML = settings.priorityDescription || '';
    priorityDescriptionDiv.classList.toggle('hidden', !settings.priorityDescription);
  }
  populateSelect(studentGenderSelect, settings.genderOptions);
  populateSelect(studentPrioritySelect, settings.priorityOptions);
  if (announcementADiv) {
    announcementADiv.innerHTML = settings.announcementA || '';
    announcementADiv.classList.toggle('hidden', !settings.announcementA);
  }
  if (announcementBDiv) {
    announcementBDiv.innerHTML = settings.announcementB || '';
    announcementBDiv.classList.toggle('hidden', !settings.announcementB);
  }
  if (settings.deadline) startCountdown(settings.deadline);
  if (queryNameGroup) {
    if (settings.requireNameForQuery === false) {
      queryNameGroup.classList.remove('hidden');
    } else {
      queryNameGroup.classList.remove('hidden');
    }
  }
}

function loadClassSettings(loadedClassSettings) {
  if (!loadedClassSettings || loadedClassSettings.error) return;
  classSettings = loadedClassSettings;
  populateSelect(studentGradeSelect, classSettings.grades);
}

function populateSelect(selectElement, options) {
  if (!selectElement || !Array.isArray(options)) return;
  while (selectElement.options.length > 1) selectElement.remove(1);
  options.forEach(opt => selectElement.add(new Option(opt, opt)));
}

function updateClassOptions() {
  if (!studentGradeSelect || !studentClassSelect) return;
  const selectedGrade = studentGradeSelect.value;
  const classes = classSettings.classes[selectedGrade] || [];
  populateSelect(studentClassSelect, classes);
  studentClassSelect.classList.toggle('hidden', classes.length === 0);
}

function toggleFileUpload() {
  if (!studentPrioritySelect || !fileUploadArea) return;
  const selectedValue = studentPrioritySelect.value;
  const hasPriorityOption = (settings.priorityOptions || []).find(opt => opt === '有');
  if (selectedValue === hasPriorityOption && selectedValue !== "") {
    fileUploadArea.classList.remove('hidden');
  } else {
    fileUploadArea.classList.add('hidden');
    if(priorityDocumentInput) {
      priorityDocumentInput.value = '';
      fileUploadText.innerHTML = `點擊或拖曳上傳證明文件<br><span style="font-size:0.8em; color:#6B7788; font-weight:normal;">(支援圖片/PDF, 5MB內)</span>`;
    }
  }
}

function validatePhoneNumberInput(event) {
  const input = event.target;
  const errorElement = input.id === 'parent-phone' ? parentPhoneError : queryPhoneError;
  if (/\D/.test(input.value)) {
    if(errorElement) errorElement.textContent = '手機號碼僅能包含數字';
  } else if (input.value && input.value.length !== 10) {
    if(errorElement) errorElement.textContent = '請輸入完整的 10 碼手機號碼';
  } else {
    if(errorElement) errorElement.textContent = '';
  }
}

function sanitizePhoneNumber(event) {
  const input = event.target;
  const newValue = input.value.replace(/\D/g, '');
  if (input.value !== newValue) {
    input.value = newValue;
    validatePhoneNumberInput(event);
  }
}

async function handleAddToPreview() {
  resetErrorMessages();
  const phone = parentPhoneInput.value.replace(/\D/g, '').trim();
  const name = studentNameInput.value.trim();
  const grade = studentGradeSelect.value;
  const needClass = !studentClassSelect.classList.contains('hidden');
  const classVal = needClass ? studentClassSelect.value : '';
  const gender = studentGenderSelect.value;
  const priority = studentPrioritySelect.value;

  const checks = [
    [!/^09\d{8}$/.test(phone), parentPhoneError, '請輸入 09 開頭的 10 碼手機號碼', parentPhoneInput],
    [!name, studentNameError, '請輸入學生姓名', studentNameInput],
    [!gender, studentGenderError, '請選擇性別', studentGenderSelect],
    [!grade, studentClassError, '請選擇年級', studentGradeSelect],
    [!!grade && needClass && !classVal, studentClassError, '請選擇班級', studentClassSelect],
    [!priority, studentPriorityError, '請選擇是否具優先錄取資格', studentPrioritySelect]
  ];
  let firstBad = null;
  checks.forEach(([bad, errEl, msg, inputEl]) => {
    if (bad) { if (errEl && !errEl.textContent) errEl.textContent = msg; if (!firstBad) firstBad = inputEl; }
  });
  const hasPriorityOption = (settings.priorityOptions || []).find(opt => opt === '有');
  const needsFile = priority !== '' && priority === hasPriorityOption;
  const rawFile = (priorityDocumentInput && priorityDocumentInput.files.length > 0) ? priorityDocumentInput.files[0] : null;
  const fileErr = document.getElementById('priority-document-error');
  if (!firstBad && needsFile && !rawFile) {
    if (fileErr) fileErr.textContent = '請上傳證明文件（可直接拍照）';
    firstBad = priorityDocumentInput;
  }
  if (firstBad) { firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' }); firstBad.focus(); return; }

  const studentClass = classVal ? `${grade}${classVal}` : grade;
  if (previewData.some(s => s.name === name && s.class === studentClass)) {
    studentNameError.textContent = `「${name}」已在待送出的名單中`;
    studentNameInput.focus();
    return;
  }

  addToPreviewButton.disabled = true;
  try {
    const file = needsFile ? await prepareFile(rawFile) : null;
    previewData.push({ phone, name, grade, classVal, class: studentClass, gender, priority, file });
    finishAddPreview();
  } catch (e) {
    if (fileErr) fileErr.textContent = e.message;
    addToPreviewButton.disabled = false;
  }
}

function finishAddPreview() {
  addToPreviewButton.disabled = false;
  renderPreview();
  if(studentNameInput) studentNameInput.value = '';
  if(studentGradeSelect) studentGradeSelect.value = '';
  if(studentClassSelect) { studentClassSelect.value = ''; studentClassSelect.classList.add('hidden'); }
  if(studentGenderSelect) studentGenderSelect.value = '';
  if(studentPrioritySelect) studentPrioritySelect.value = '';
  if(fileUploadArea) fileUploadArea.classList.add('hidden');
  if(priorityDocumentInput) {
    priorityDocumentInput.value = '';
    fileUploadText.innerHTML = `點擊或拖曳上傳證明文件<br><span style="font-size:0.8em; color:#6B7788; font-weight:normal;">(支援圖片/PDF, 5MB內)</span>`;
  }
  setTimeout(() => {
    const previewEl = document.getElementById('preview-area');
    if (previewEl) previewEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function renderPreview() {
  if (!previewArea) return;
  previewArea.innerHTML = '';
  const title = document.createElement('h3'); title.textContent = '待送出的名單';
  const placeholder = document.createElement('p'); placeholder.classList.add('placeholder-text'); placeholder.textContent = '請填寫上方資料並點擊加入預覽';
  previewArea.appendChild(title);
  previewArea.appendChild(placeholder);
 
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  if (previewData.length === 0) {
    previewArea.classList.remove('has-content');
    if (buttonGroup) buttonGroup.classList.add('hidden');
    if (submitRegistrationButton) submitRegistrationButton.classList.remove('sticky-mobile');
    return;
  }
 
  previewArea.classList.add('has-content');
  if (buttonGroup) buttonGroup.classList.remove('hidden');
 
  if (!isDesktop && submitRegistrationButton) {
    submitRegistrationButton.classList.add('sticky-mobile');
  } else {
    submitRegistrationButton.classList.remove('sticky-mobile');
  }
  if (isDesktop) {
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>姓名</th><th>班級</th><th>性別</th><th>資格</th><th>操作</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    previewData.forEach((s, i) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${escapeHTML(s.name)}</td><td>${escapeHTML(s.class)}</td><td>${escapeHTML(s.gender)}</td><td>${escapeHTML(s.priority)}</td><td class="delete-cell"><div class="delete-button" data-index="${i}">&times;</div></td>`;
      tbody.appendChild(row);
    });
    previewArea.appendChild(table);
  } else {
    previewData.forEach((s, i) => {
      const card = document.createElement('div'); card.classList.add('preview-card');
      card.innerHTML = `<div class="data-row"><span class="label">姓名</span><span class="value">${escapeHTML(s.name)}</span></div>
      <div class="data-row"><span class="label">班級</span><span class="value">${escapeHTML(s.class)}</span></div>
      <div class="data-row"><span class="label">資格</span><span class="value">${escapeHTML(s.priority)}</span></div>
      <div class="delete-button" data-index="${i}">&times;</div>`;
      previewArea.appendChild(card);
    });
  }
  previewArea.querySelectorAll('.delete-button').forEach(btn => btn.addEventListener('click', handleDeletePreviewItem));
}

function handleDeletePreviewItem(e) {
  const idx = parseInt(e.target.dataset.index, 10);
  if (!isNaN(idx)) {
    previewData.splice(idx, 1);
    renderPreview();
  }
}

function handleAddAnother() {
  resetErrorMessages();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleSubmitRegistration() {
  if (previewData.length === 0) { showModal('請先加入學生'); return; }
  const consent = document.getElementById('consent-checkbox');
  if (consent && !consent.checked) {
    document.getElementById('consent-error').textContent = '請先勾選同意上方說明';
    consent.focus();
    return;
  }
  const students = previewData.map(s => ({ phone: s.phone, name: s.name, grade: s.grade, classVal: s.classVal, gender: s.gender, priority: s.priority, file: s.file }));
  if (JSON.stringify(students).length > 4.2 * 1024 * 1024) {
    showModal('附件總量過大，請分次送出（每次先送 1～2 位有附件的孩子）。');
    return;
  }
  submitRegistrationButton.disabled = true;
  showLoadingModal(students.some(s => s.file) ? '正在送出報名並上傳文件<br><span style="font-size:0.8em;font-weight:normal;color:#5A6678;">請勿關閉視窗</span>' : '正在送出報名');
  try {
    handleRegistrationResponse(await callBackend('processRegistration', { students }));
  } catch (e) {
    submitRegistrationButton.disabled = false;
    if (e.payload) { handleRegistrationResponse(e.payload); return; }
    const unsure = /逾時|無法連線/.test(e.message) ? '<br><br><span style="font-size:0.9em;">若不確定是否已送出，請先到「查詢」確認，避免重複報名。</span>' : '';
    showModal('<h3 style="color:#D14343">無法送出</h3>' + escapeHTML(e.message) + unsure);
  }
}

function handleRegistrationResponse(response) {
  submitRegistrationButton.disabled = false;
  if (loadingInterval) clearInterval(loadingInterval);
  if (response.success) {
    const phone = previewData.length ? previewData[0].phone : '';
    previewData = [];
    renderPreview();
    if (parentPhoneInput) parentPhoneInput.value = '';
    const consent = document.getElementById('consent-checkbox');
    if (consent) consent.checked = false;
    showReceipt(response.receipts || [], phone);
    return;
  }
  if (response.failedStudents && response.failedStudents.length > 0) {
    previewData = previewData.filter(s => !response.failedStudents.some(f => f.name === s.name && f.class === s.class && f.phone === s.phone));
    renderPreview();
  }
  showModal('<h3 style="color:#D14343">無法送出</h3>' + escapeHTML(response.message || '發生錯誤'));
}

// 報名成功憑證：不要求家長背編號，可截圖/存圖，之後用「手機+孩子姓名」也能查到
function showReceipt(receipts, phone) {
  const rows = receipts.map(r => `<div class="receipt-row"><span>${escapeHTML(r.name)}（${escapeHTML(r.class)}）</span><strong class="receipt-id">${escapeHTML(r.id)}</strong></div>`).join('');
  const time = new Date().toLocaleString('zh-TW', { hour12: false });
  modalMessage.innerHTML = `
    <div id="receipt-card" class="receipt-card">
      <h3>報名成功</h3>
      <p class="receipt-sub">${escapeHTML(settings.title || '')}</p>
      <div class="receipt-label">報名編號</div>
      ${rows}
      <p class="receipt-time">${escapeHTML(time)}</p>
    </div>
    <p class="receipt-tip">編號不用刻意背：之後到「查詢」輸入手機號碼與孩子姓名，就能看到編號與結果。建議先把這張憑證存成圖片。</p>
    <div class="receipt-actions">
      <button type="button" class="button secondary" id="receipt-save">存成圖片</button>
      <button type="button" class="button primary" id="receipt-go">前往查詢</button>
    </div>`;
  messageModal.classList.remove('hidden');
  document.getElementById('receipt-save').onclick = () => {
    const card = document.getElementById('receipt-card');
    if (!window.html2canvas || !card) { alert('請直接截圖保存此畫面'); return; }
    html2canvas(card, { scale: 2, backgroundColor: '#ffffff' }).then(c => {
      const a = document.createElement('a');
      a.download = '課後班報名憑證.png'; a.href = c.toDataURL('image/png'); a.click();
    }).catch(() => alert('存圖失敗，請直接截圖保存此畫面'));
  };
  document.getElementById('receipt-go').onclick = () => {
    hideModal(); showPage('query');
    if (queryPhoneInput && phone) queryPhoneInput.value = phone;
  };
}

function handleQuery() {
  if (queryResultsArea) { queryResultsArea.innerHTML = ''; queryResultsArea.classList.add('hidden'); }
  const phone = queryPhoneInput.value.replace(/\D/g, '').trim();
  const keyword = queryNameInput.value.trim();
  const requireName = settings.requireNameForQuery !== false;
  let ok = true;
  queryPhoneError.textContent = ''; queryNameError.textContent = '';
  if (phone.length !== 10) { queryPhoneError.textContent = '請輸入完整的 10 碼手機號碼'; ok = false; }
  if (requireName && !keyword) { queryNameError.textContent = '請輸入孩子姓名（或報名編號）'; ok = false; }
  if (!ok) return;

  queryButton.disabled = true;
  lastQueryPhone = phone;
  showLoadingModal('查詢中');
  callBackend('queryRegistration', { phone, keyword })
    .then((results) => { queryButton.disabled = false; displayQueryResults(results); })
    .catch((e) => { queryButton.disabled = false; showError(e); });
}

function handleResubmitClick(phone, id) {
  currentResubmitData = { phone, id };
  resubmitFile.value = '';
  resubmitFileText.innerHTML = `點擊拍照或選擇檔案<br><span style="font-size:0.8em; color:#6B7788; font-weight:normal;">(圖片會自動縮小；PDF 請小於 2.5MB)</span>`;
  resubmitModal.classList.remove('hidden');
}

async function submitResubmission() {
  const file = resubmitFile.files[0];
  if (!file) { showModal('請先選擇檔案'); return; }
  submitResubmitBtn.disabled = true;
  resubmitModal.classList.add('hidden');
  showLoadingModal('正在上傳補件');
  try {
    const fileData = await prepareFile(file);
    const res = await callBackend('processResubmission', { studentInfo: currentResubmitData, fileData });
    submitResubmitBtn.disabled = false;
    showModal('<h3 style="color:#2F855A;">補件成功</h3>系統將重新審查。', 2500);
    handleQuery();
  } catch (e) {
    submitResubmitBtn.disabled = false;
    showError(e);
  }
}

function statusInfo(s) {
  if (s.lotteryResult) {
    const cls = s.lotteryResult.startsWith('備取') ? 'status-wait' : 'status-pass';
    const sub = s.status === '不符合' ? '（優先資格不符，以一般生參加抽籤）' : '';
    return { text: s.lotteryResult, cls, sub, action: false };
  }
  switch (s.status) {
    case '不符合': return { text: '資格不符，轉為一般生', cls: 'status-fail', sub: '', action: false };
    case '待審查': case '已補件': return { text: '審查中', cls: 'status-pending', sub: '', action: false };
    case '請補件': return { text: '需補件', cls: 'status-resubmit', sub: '', action: true };
    case '通過': return { text: '資格通過，優先錄取', cls: 'status-pass', sub: '', action: false };
    default: return { text: '報名完成，等待抽籤', cls: 'status-pass', sub: '', action: false };
  }
}

function displayQueryResults(results) {
  hideModal();
  if (results.error) { showError({ message: results.error }); return; }
  if (!queryResultsArea) return;
  queryResultsArea.innerHTML = '<h3>查詢結果</h3>';
  queryResultsArea.classList.remove('hidden');
  queryResultsArea.classList.add('has-content');
  if (results.length === 0) {
    queryResultsArea.innerHTML += '<p class="placeholder-text">查無資料，請確認手機號碼與孩子姓名是否與報名時相同。</p>';
    return;
  }
  results.forEach(s => {
    const st = statusInfo(s);
    const card = document.createElement('div');
    card.className = 'query-result-card';
    card.innerHTML = `
      <div class="data-row"><span class="label">姓名</span><span class="value">${escapeHTML(s.name)}</span></div>
      <div class="data-row"><span class="label">班級</span><span class="value">${escapeHTML(s.class)}</span></div>
      <div class="data-row"><span class="label">編號</span><span class="value"><strong class="receipt-id">${escapeHTML(s.id || '-')}</strong></span></div>
      <div class="data-row"><span class="label">時間</span><span class="value" style="font-size:0.9em; color:#6B7788;">${escapeHTML(String(s.registrationTime))}</span></div>
      <div class="data-row" style="margin-top:6px;"><span class="label">狀態</span><span class="value"><span class="status-badge ${st.cls}">${escapeHTML(st.text)}</span><span class="status-sub">${escapeHTML(st.sub)}</span></span></div>
      ${s.note && (s.status === '請補件' || s.status === '不符合') ? `<div class="note-text">審查說明：${escapeHTML(s.note)}</div>` : ''}
      ${st.action ? `<button type="button" class="resubmit-btn" style="margin-top:10px;width:100%;" data-id="${escapeHTML(s.id)}" data-phone="${escapeHTML(lastQueryPhone)}">上傳補件文件</button>` : ''}`;
    queryResultsArea.appendChild(card);
  });
  setTimeout(() => {
    const top = document.querySelector('.container');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function startCountdown(deadlineStr) {
  const deadline = new Date(deadlineStr).getTime();
  if (isNaN(deadline)) return;
  if(deadlineDisplay) deadlineDisplay.textContent = '距離報名截止還有';
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const now = new Date().getTime();
    const dist = deadline - now;
    if (dist < 0) {
      clearInterval(countdownInterval);
      if(countdownElement) countdownElement.textContent = '報名已截止';
      disableRegistrationForm();
      return;
    }
    const d = Math.floor(dist / (1000 * 60 * 60 * 24));
    const h = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((dist % (1000 * 60)) / 1000);
    if(countdownElement) countdownElement.textContent = d > 0 ? `${d}天 ${h}小時 ${m}分` : `${h}小時 ${m}分 ${s}秒`;
  }, 1000);
}

function disableRegistrationForm() {
  const inputs = document.querySelectorAll('#registrationFormContainer input, #registrationFormContainer select, #registrationFormContainer button');
  inputs.forEach(el => el.disabled = true);
}
function enableRegistrationForm() {
  const inputs = document.querySelectorAll('#registrationFormContainer input, #registrationFormContainer select, #registrationFormContainer button');
  inputs.forEach(el => el.disabled = false);
}

function showModal(msg, delay = 0) {
  clearTimeout(messageModalTimeout);
  if(loadingInterval) clearInterval(loadingInterval);
  if(modalMessage) modalMessage.innerHTML = msg;
  if(messageModal) messageModal.classList.remove('hidden');
  if (delay > 0) messageModalTimeout = setTimeout(hideModal, delay);
}

function showLoadingModal(initialText) {
  clearTimeout(messageModalTimeout);
  if(loadingInterval) clearInterval(loadingInterval);
  const msgs = ['資料傳輸中', '處理中，請稍候', '即將完成'];
  let i = 0;
  const content = `
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <div class="loading-text">${initialText}</div>
    <div class="loading-subtext" id="dynamic-loading-text">請稍候</div>
  </div>
  `;
  if(modalMessage) modalMessage.innerHTML = content;
  if(messageModal) messageModal.classList.remove('hidden');
  loadingInterval = setInterval(() => {
    const el = document.getElementById('dynamic-loading-text');
    if(el) { el.textContent = msgs[i % msgs.length]; i++; }
  }, 1500);
}

function hideModal() {
  if(messageModal) messageModal.classList.add('hidden');
  if(loadingInterval) clearInterval(loadingInterval);
}

function showConfirmModal(message, onConfirm) {
  if(confirmMessage) confirmMessage.innerHTML = message;
  pendingUpdateAction = onConfirm;
  if(confirmModal) confirmModal.classList.remove('hidden');
}

function showDocPreview(url) {
  if (!url) return;
  let previewUrl = url;
  if (url.includes('drive.google.com') && url.includes('/view')) {
    previewUrl = url.replace('/view', '/preview');
  }
  const frame = document.getElementById('doc-preview-frame');
  if(frame) frame.src = previewUrl;
  const fallbackBtn = document.getElementById('doc-fallback-link');
  if(fallbackBtn) fallbackBtn.href = url;
  const docModal = document.getElementById('doc-preview-modal');
  if(docModal) docModal.classList.remove('hidden');
}

function closeDocPreview() {
  const docModal = document.getElementById('doc-preview-modal');
  if(docModal) docModal.classList.add('hidden');
  const frame = document.getElementById('doc-preview-frame');
  if(frame) frame.src = '';
}

function showError(e) {
  showModal('<h3 style="color:#D14343">Oops</h3>' + escapeHTML(e.message || e));
}

function resetErrorMessages() {
  document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function handleAdminLogin() {
  const pwd = document.getElementById('admin-password').value;
  if (!pwd) return;
  adminLoginBtn.disabled = true;
  showLoadingModal('登入驗證中...');
 
  callBackend('adminLogin', { password: pwd })
    .then((data) => {
      adminLoginBtn.disabled = false;
      onAdminLoginSuccess(data);
    })
    .catch((e) => {
      adminLoginBtn.disabled = false;
      onAdminLoginFail(e);
    });
}

function onAdminLoginSuccess(data) {
  hideModal();
  adminPassword = document.getElementById('admin-password').value;
  document.getElementById('admin-login-modal').classList.add('hidden');
  document.getElementById('admin-panel').style.display = 'block';
  const s = data.settings;
  document.getElementById('adm-title').value = s.title;
  document.getElementById('adm-start').value = s.startTime;
  document.getElementById('adm-end').value = s.endTime;
  document.getElementById('adm-gender').value = s.genderOptions;
  document.getElementById('adm-prio-opt').value = s.priorityOptions;
  document.getElementById('adm-prio-desc').value = s.priorityDesc;
  document.getElementById('adm-ann-a').value = s.announcementA;
  document.getElementById('adm-ann-b').value = s.announcementB;
  document.getElementById('adm-drive').value = s.driveId || '';
  document.getElementById('adm-lottery-drive').value = s.lotteryDriveId || '';
 
  const pubSel = document.getElementById('adm-publish');
  if (pubSel) pubSel.value = s.publishResults ? 'true' : 'false';
  const reqNameSelect = document.getElementById('adm-req-name');
  if (reqNameSelect) reqNameSelect.value = s.requireNameForQuery !== false ? "true" : "false";
  renderClassTable(data.classes);
}

function onAdminLoginFail(e) {
  showModal('驗證失敗: ' + escapeHTML(e.message), 2000);
}

function closeAdminPanel() {
  document.getElementById('admin-panel').style.display = 'none';
  adminPassword = '';
}

function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const tabs = document.querySelectorAll('.admin-tab');
  if (tab === 'general') {
    tabs[0].classList.add('active');
    document.getElementById('admin-general').classList.add('active');
  } else if (tab === 'class') {
    tabs[1].classList.add('active');
    document.getElementById('admin-class').classList.add('active');
  } else if (tab === 'review') {
    tabs[2].classList.add('active');
    document.getElementById('admin-review').classList.add('active');
    loadReviewData();
  } else if (tab === 'lottery') {
    tabs[3].classList.add('active');
    document.getElementById('admin-lottery').classList.add('active');
    initLotteryTab();
  } else if (tab === 'data') {
    tabs[4].classList.add('active');
    document.getElementById('admin-data').classList.add('active');
  }
}

function renderClassTable(classes) {
  const tbody = document.getElementById('class-table-body');
  tbody.innerHTML = '';
  if (classes.length === 0) {
    const defaults = ['一年', '二年', '三年', '四年', '五年', '六年'];
    classes = defaults.map(g => ({grade: g, classes: '', active: false}));
  }
  classes.forEach((c, i) => {
    const row = document.createElement('tr');
    const checked = c.active ? 'checked' : '';
    row.innerHTML = `
    <td style="text-align:center;"><input type="checkbox" class="active-cb" ${checked} style="width:20px; height:20px; cursor:pointer; accent-color:#3A7CB8;"></td>
    <td><input type="text" value="${escapeHTML(c.grade)}" class="gr-input"></td>
    <td><input type="text" value="${escapeHTML(c.classes)}" class="cl-input"></td>
    <td class="admin-row-action"><span class="icon-btn delete" onclick="this.closest('tr').remove()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span></td>
    `;
    tbody.appendChild(row);
  });
}

function addClassRow() {
  const tbody = document.getElementById('class-table-body');
  const row = document.createElement('tr');
  row.innerHTML = `
  <td style="text-align:center;"><input type="checkbox" class="active-cb" checked style="width:20px; height:20px; cursor:pointer; accent-color:#3A7CB8;"></td>
  <td><input type="text" placeholder="年級" class="gr-input"></td>
  <td><input type="text" placeholder="班級 (逗號分隔)" class="cl-input"></td>
  <td class="admin-row-action"><span class="icon-btn delete" onclick="this.closest('tr').remove()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span></td>
  `;
  tbody.appendChild(row);
}

function loadReviewData() {
  if (!adminPassword) return;
  const tbody = document.getElementById('review-table-body');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">載入中...</td></tr>';
  refreshReviewBtn.disabled = true;
 
  callBackend('getPriorityCandidates', { password: adminPassword })
    .then((candidates) => {
      refreshReviewBtn.disabled = false;
      renderReviewTable(candidates);
    })
    .catch((e) => {
      refreshReviewBtn.disabled = false;
      tbody.innerHTML = `<tr><td colspan="5" style="color:#D14343;">錯誤: ${escapeHTML(e.message)}</td></tr>`;
    });
}

function renderReviewTable(candidates) {
  const tbody = document.getElementById('review-table-body');
  tbody.innerHTML = '';
  if (candidates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#6B7788;">目前沒有待審查的資料</td></tr>';
    return;
  }
  candidates.forEach(c => {
    const row = document.createElement('tr');
    let badgeClass = 'status-pending';
    if (c.status === '通過') badgeClass = 'status-pass';
    if (c.status === '不符合') badgeClass = 'status-fail';
    if (c.status === '請補件') badgeClass = 'status-resubmit';
    if (c.status === '已補件') badgeClass = 'status-resubmitted';
    const fileLink = c.fileLink
      ? `<span class="doc-link" onclick="showDocPreview('${escapeHTML(String(c.fileLink))}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg> 檢視</span>`
      : '<span style="color:#c7c7cc;">無文件</span>';
    row.innerHTML = `
    <td class="mobile-vertical"><strong>${escapeHTML(c.name)}</strong></td>
    <td class="mobile-vertical">${escapeHTML(c.class)}</td>
    <td class="mobile-vertical">${fileLink}</td>
    <td class="mobile-vertical"><span class="status-badge ${badgeClass}">${c.status}</span></td>
    <td class="action-cell">
      <div class="action-buttons">
        <button class="button" style="width:auto; padding:6px 12px; font-size:0.85em; background:rgba(122,213,146,0.15); color:#2F855A; margin:0;" onclick="updateStatus(this, ${c.rowIndex}, '通過')">通過</button>
        <button class="button" style="width:auto; padding:6px 12px; font-size:0.85em; background:rgba(108,166,217,0.15); color:#3A7CB8; margin:0;" onclick="updateStatus(this, ${c.rowIndex}, '請補件')">補件</button>
        <button class="button" style="width:auto; padding:6px 12px; font-size:0.85em; background:rgba(255,139,139,0.15); color:#D14343; margin:0;" onclick="updateStatus(this, ${c.rowIndex}, '不符合')">退件</button>
      </div>
    </td>
    `;
    tbody.appendChild(row);
  });
}

function updateStatus(btnElement, rowIndex, newStatus) {
  const needNote = newStatus !== '通過';
  const noteHtml = needNote ? '<textarea id="reason-input" placeholder="請填寫原因（家長會在查詢頁看到）" style="margin-top:12px;"></textarea>' : '';
  showConfirmModal(`將此學生狀態修改為<br><strong style="font-size:1.2em; color:#3A7CB8;">「${newStatus}」</strong>${noteHtml}`, () => {
    const note = needNote ? (document.getElementById('reason-input').value || '').trim() : '';
    if (newStatus === '請補件' && !note) { showModal('選擇「補件」時請填寫原因，家長才知道要補什麼。'); return; }
    const row = btnElement.closest('tr');
    const buttons = row.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);

    callBackend('updateCandidateStatus', { password: adminPassword, rowIndex, newStatus, note })
      .then(() => {
        buttons.forEach(b => b.disabled = false);
        const badge = row.cells[3].querySelector('.status-badge');
        const map = { '通過': 'status-pass', '不符合': 'status-fail', '請補件': 'status-resubmit', '已補件': 'status-resubmitted' };
        if (badge) { badge.className = `status-badge ${map[newStatus] || 'status-pending'}`; badge.textContent = newStatus; }
      })
      .catch((e) => { buttons.forEach(b => b.disabled = false); showError(e); });
  });
}

function handleClearAllData() {
  showConfirmModal('<span style="color:#D14343; font-size:1.5em; display:block; margin-bottom:10px;">嚴重警告</span>這將永久刪除所有報名資料與雲端檔案！（系統會先自動備份整份試算表）<br><br>請輸入「清空」兩個字確認：<input type="text" id="clear-confirm-input" style="margin-top:10px;">', () => {
    if ((document.getElementById('clear-confirm-input').value || '').trim() !== '清空') { showModal('未輸入「清空」，已取消。', 2500); return; }
    clearAllDataBtn.disabled = true;
    showLoadingModal('正在執行資料抹除...');
   
    callBackend('clearAllData', { password: adminPassword })
      .then(() => {
        clearAllDataBtn.disabled = false;
        showModal('✅ 系統已重置完畢', 2000);
      })
      .catch((e) => {
        clearAllDataBtn.disabled = false;
        showError(e);
      });
  });
}

function initLotteryTab() {
  if (!adminPassword) return;
  const select = document.getElementById('lottery-grade-select');
  select.innerHTML = '<option>載入中...</option>';
 
  callBackend('getLotteryGrades', { password: adminPassword })
    .then((grades) => {
      select.innerHTML = '<option value="">請選擇開獎年級</option>';
      grades.forEach(g => { select.add(new Option(g, g)); });
    })
    .catch((e) => showModal('載入年級失敗: ' + escapeHTML(e.message)));
}

function renderOfficialCardHtml(contentHtml, grade, isPreview) {
  const timeStr = new Date().toLocaleString('zh-TW', { hour12: false });
  const titleText = "課後班抽籤錄取與備取結果公告";
  const timeLabel = isPreview ? "抽籤時間" : "抽籤時間";
  const cardBg = "#ffffff";
  const headerBg = "#F7FAFC";
  const accentColor = "#3A7CB8";
  const shadowStyle = "box-shadow: 0 4px 15px rgba(0,0,0,0.05);";
  return `
  <div id="official-capture-card" style="
    background-color: ${cardBg};
    border-radius: 24px;
    padding: 40px;
    max-width: 850px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif;
    box-shadow: 0 10px 40px rgba(0,0,0,0.08);
    box-sizing: border-box;
  ">
    <div style="
      background-color: ${headerBg};
      ${shadowStyle}
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 30px;
      text-align: center;
    ">
      <h2 style="margin: 0; font-size: 1.8em; font-weight: 800; color: #2D3748; letter-spacing: 1px;">${titleText}</h2>
      <div style="display: inline-block; background: rgba(108, 166, 217, 0.1); color: ${accentColor}; padding: 6px 20px; border-radius: 20px; margin-top: 15px; font-weight: 700; font-size: 1.1em;">
        年級班別：${grade}
      </div>
      <div style="text-align: right; margin-top: 15px; font-size: 0.85em; color: #5A6678; font-weight: 600;">
        ${timeLabel}：${timeStr}
      </div>
    </div>
    <div style="margin-top: 20px;">
      ${contentHtml}
    </div>
  </div>
  `;
}

function loadLotteryParticipants() {
  const grade = document.getElementById('lottery-grade-select').value;
  const btnRun = document.getElementById('lottery-run-btn');
  const summary = document.getElementById('lottery-summary');
  const resultArea = document.getElementById('lottery-result-area');
  
  if (!grade) {
    btnRun.disabled = true;
    summary.innerHTML = '請選擇年級以載入報名數據...';
    return;
  }
  summary.innerHTML = '即時數據計算中...';
  btnRun.disabled = true;
 
  callBackend('getLotteryParticipants', { password: adminPassword, selectedGrade: grade })
    .then((data) => {
      lotteryAlreadyDrawn = !!data.alreadyDrawn;
      summary.innerHTML = (lotteryAlreadyDrawn ? '<div style="font-weight:700;margin-bottom:6px;">此年級已完成抽籤，下方為已存檔的結果。</div>' : '') + `
        <span class="lottery-summary-item">總報名：<strong>${data.totalCount}</strong> 人</span>
        <span class="lottery-summary-item">優先資格：<strong>${data.priorityCount}</strong> 人</span>
        <span class="lottery-summary-item">系統關聯 (雙胞胎)：<strong>${data.twinStudentsCount}</strong> 人</span>
      `;
      let tablesHtml = '';
      if (data.displayPriorityApplicants && data.displayPriorityApplicants.length > 0) {
        tablesHtml += buildLotteryTableHtml(data.displayPriorityApplicants, '優先資格名單（免抽籤）', 'header-priority');
      }
      if (data.displayParticipants && data.displayParticipants.length > 0) {
        tablesHtml += buildLotteryTableHtml(data.displayParticipants, '參與抽籤名單（匿名預覽）', 'header-waitlist');
      }
      if (!tablesHtml) {
        tablesHtml = '<div style="text-align:center; color:#6B7788; padding: 40px 0; font-weight:bold;">該年級目前無報名資料</div>';
      }
      resultArea.innerHTML = renderOfficialCardHtml(tablesHtml, grade, true);
      btnRun.disabled = false;
      document.getElementById('lottery-download-btn').disabled = true;
      if (lotteryAlreadyDrawn) {
        return callBackend('getLotteryResult', { password: adminPassword, selectedGrade: grade })
          .then((saved) => { if (saved) renderLotteryResults(saved, grade); });
      }
    })
    .catch((e) => {
      summary.innerHTML = '<span style="color:#D14343;">數據讀取失敗</span>';
      showModal(e.message);
    });
}

function runLottery() {
  const grade = document.getElementById('lottery-grade-select').value;
  const count = document.getElementById('lottery-count-input').value;
  const resultArea = document.getElementById('lottery-result-area');
  const btnRun = document.getElementById('lottery-run-btn');
  
  showConfirmModal(`確定要為<strong style="color:#3A7CB8; font-size:1.2em;">「${grade}」</strong>執行亂數抽籤嗎？<br><br><span style="color:#5A6678; font-size:0.9em;">預定正取：${count} 人</span>${lotteryAlreadyDrawn ? '<br><br><strong style="color:#D14343;">此年級已有抽籤結果，重抽會覆蓋舊結果。</strong>' : ''}`, () => {
    btnRun.disabled = true;
    resultArea.innerHTML = `
      <div class="lottery-anim-container">
        <h3 style="color:#5A6678; font-size:1.3em; margin-bottom: 5px;">即將開獎...</h3>
        <div class="lottery-countdown-text" id="lottery-countdown">3</div>
      </div>
    `;
    document.getElementById('lottery-download-btn').disabled = true;
    let countNum = 3;
    playTickSound();
    
    const countTimer = setInterval(() => {
      countNum--;
      if (countNum > 0) {
        document.getElementById('lottery-countdown').innerText = countNum;
        playTickSound();
      } else {
        clearInterval(countTimer);
        resultArea.innerHTML = `
          <div class="lottery-anim-container">
            <div class="lottery-spinner"></div>
            <h3 style="color:#3A7CB8; margin-bottom: 5px;">亂數演算法極速配對中...</h3>
            <div class="lottery-flash-name" id="lottery-flash-name">讀取名單</div>
          </div>
        `;
        const dummyNames = ['王Ｏ明', '李Ｏ華', '陳Ｏ宇', '林Ｏ婷', '張Ｏ豪', '劉Ｏ軒', '吳Ｏ萱', '黃Ｏ傑', '周Ｏ倫', '蔡Ｏ依'];
        let flashIndex = 0;
        const flashInterval = setInterval(() => {
          const flashEl = document.getElementById('lottery-flash-name');
          if(flashEl) flashEl.innerText = dummyNames[flashIndex % dummyNames.length];
          playTickSound();
          flashIndex++;
        }, 100);
       
        callBackend('performLottery', { password: adminPassword, selectedGrade: grade, studentsPerClass: count, overwrite: lotteryAlreadyDrawn })
          .then((results) => {
            setTimeout(() => {
              clearInterval(flashInterval);
              playCheerSound();
              renderLotteryResults(results, grade);
              lotteryAlreadyDrawn = true;
              btnRun.disabled = false;
              showModal('<h3 style="color:#2F855A;">🎉 抽籤完成！</h3>名單已產生。', 2000);
            }, 2500);
          })
          .catch((e) => {
            clearInterval(flashInterval);
            btnRun.disabled = false;
            resultArea.innerHTML = '<div style="text-align:center; padding:50px; color:#D14343;">抽籤運算發生錯誤</div>';
            showModal(e.message);
          });
      }
    }, 800);
  });
}

function renderLotteryResults(results, grade) {
  const area = document.getElementById('lottery-result-area');
  let t = '';
  t += buildLotteryTableHtml(results.priorityWinners, '優先錄取名單（資格符合免抽）', 'header-priority');
  t += buildLotteryTableHtml(results.regularWinners, '正取名單', 'header-regular');
  t += buildLotteryTableHtml(results.waitlist, '備取名單', 'header-waitlist');
  area.innerHTML = renderOfficialCardHtml(t, grade, false);
  document.getElementById('lottery-download-btn').disabled = false;
  if (results.warning) showModal(escapeHTML(results.warning));
}

function buildLotteryTableHtml(list, title, headerClass) {
  if (!list || list.length === 0) return '';
  let headerBgColor = headerClass === 'header-priority' ? '#38A169' : (headerClass === 'header-regular' ? '#3182CE' : '#5A6678');
  let h = `<div style="background-color:${headerBgColor}; color:#ffffff; padding:8px 20px; font-weight:bold; border-radius:8px 8px 0 0; display:inline-block; font-size:1.05em; margin-top:20px;">${title}</div>`;
  h += `<div style="border:2px solid #E2E8F0; border-radius:0 8px 8px 8px; margin-bottom:10px; overflow:hidden;">
    <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.95em;">
      <thead>
        <tr style="background-color:#F7FAFC; border-bottom:2px solid #CBD5E0; color:#4A5568;">
          <th style="padding:12px 15px; width:10%;">序號</th>
          <th style="padding:12px 15px; width:25%;">報名編號</th>
          <th style="padding:12px 15px; width:20%;">班級</th>
          <th style="padding:12px 15px; width:30%;">姓名 (隱碼)</th>
          <th style="padding:12px 15px; width:15%;">性別</th>
        </tr>
      </thead>
      <tbody>`;
  list.forEach((p, index) => {
    const rowBgColor = index % 2 === 0 ? '#ffffff' : '#F8FAFC';
    h += `<tr style="background-color:${rowBgColor}; border-bottom:1px solid #EDF2F7; color:#2D3748;">
      <td style="padding:12px 15px; font-weight:bold;">${escapeHTML(String(p.sequence))}</td>
      <td style="padding:12px 15px; font-family:monospace; color:#5A6678;">${escapeHTML(String(p.id || '-'))}</td>
      <td style="padding:12px 15px;">${escapeHTML(String(p.classInfo))}</td>
      <td style="padding:12px 15px; font-weight:bold;">${escapeHTML(String(p.studentName))}</td>
      <td style="padding:12px 15px;">${escapeHTML(String(p.gender))}</td>
    </tr>`;
  });
  h += `</tbody></table></div>`;
  return h;
}

function downloadLotteryResult() {
  const element = document.getElementById('official-capture-card');
  if (!element) {
    showModal('找不到可下載的圖檔內容');
    return;
  }
  const grade = document.getElementById('lottery-grade-select').value;
  const btn = document.getElementById('lottery-download-btn');
  btn.disabled = true;
  btn.innerText = "正在處理並備份中...";
  showLoadingModal("正在產製精美公告圖檔...");
  
  html2canvas(element, {
    backgroundColor: null,
    scale: 2,
    useCORS: true,
    windowWidth: element.scrollWidth
  }).then(canvas => {
    const dataUrl = canvas.toDataURL('image/png');
    const fileName = `【公告】${grade}_${new Date().getTime()}.png`;
    try {
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch(e) {}
   
    callBackend('saveLotteryImageToDrive', { password: adminPassword, base64Data: dataUrl, fileName })
      .then((res) => {
        hideModal();
        btn.disabled = false;
        btn.innerText = "下載/雲端備份圖檔";
        showModal(`✅ <strong style="color:#3A824E;">圖檔已成功保存！</strong><br>檔案已同步備份至雲端資料夾。`, 3000);
      })
      .catch((e) => {
        hideModal();
        btn.disabled = false;
        btn.innerText = "下載/雲端備份圖檔";
        showModal(`⚠️ 備份警告：${escapeHTML(e.message)}`, 3000);
      });
  });
}

function handleSaveSettings() {
  if (!adminPassword) return alert('連線逾時，請重新登入');
  saveSettingsBtn.disabled = true;
  const formData = {
    settings: {
      title: document.getElementById('adm-title').value,
      startTime: document.getElementById('adm-start').value,
      endTime: document.getElementById('adm-end').value,
      genderOptions: document.getElementById('adm-gender').value,
      priorityOptions: document.getElementById('adm-prio-opt').value,
      priorityDesc: document.getElementById('adm-prio-desc').value,
      announcementA: document.getElementById('adm-ann-a').value,
      announcementB: document.getElementById('adm-ann-b').value,
      driveId: document.getElementById('adm-drive').value,
      lotteryDriveId: document.getElementById('adm-lottery-drive').value,
      requireNameForQuery: document.getElementById('adm-req-name').value,
      publishResults: document.getElementById('adm-publish').value
    }
  };
  saveAdminDataGeneric(formData);
}

function handleSaveClasses() {
  if (!adminPassword) return alert('連線逾時，請重新登入');
  saveClassesBtn.disabled = true;
  handleSaveSettings();
}

function saveAdminDataGeneric(formData) {
  showLoadingModal('正在寫入伺服器...');
  const rows = document.querySelectorAll('#class-table-body tr');
  const classes = [];
  rows.forEach(r => {
    const cb = r.querySelector('.active-cb');
    const isActive = cb ? cb.checked : true;
    const g = r.querySelector('.gr-input').value.trim();
    const c = r.querySelector('.cl-input').value.trim();
    if (g) classes.push({ grade: g, classes: c, active: isActive });
  });
 
  formData.classes = classes;
 
  callBackend('saveAdminData', { password: adminPassword, formData })
    .then(() => {
      saveSettingsBtn.disabled = false;
      saveClassesBtn.disabled = false;
      showModal('✅ 儲存成功！正在刷新系統...', 1000);
      setTimeout(() => {
        closeAdminPanel();
        callBackend('getInitialData')
          .then((data) => { initPageData(data); hideModal(); })
          .catch(showError);
      }, 1000);
    })
    .catch((e) => {
      saveSettingsBtn.disabled = false;
      saveClassesBtn.disabled = false;
      showModal('儲存失敗: ' + escapeHTML(e.message));
    });
}
