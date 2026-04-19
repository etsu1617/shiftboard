// ============================================
// app.js - ShiftBoard メインロジック
// ============================================

// ---- Supabase クライアント初期化 ----
const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// ---- 定数 ----
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_KEYS  = ['0','1','2','3','4','5','6'];  // 0=日〜6=土

// ---- グローバル状態 ----
let currentUser   = null;   // ログイン中ユーザーの auth.user
let currentProfile = null;  // profiles テーブルのレコード
let allProfiles   = [];     // 全メンバー一覧
let allRequests   = [];     // 全申請一覧
let currentMonth  = new Date(); // カレンダー表示中の月
let emailSettings = null;   // メール設定

// ============================================
// 初期化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // 認証状態の監視
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await loadProfile();
      showApp();
    } else {
      currentUser = null;
      currentProfile = null;
      showAuth();
    }
  });

  // 現在のセッションを確認
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadProfile();
    showApp();
  } else {
    showAuth();
  }
});

// ============================================
// 認証関連
// ============================================

// ログイン画面を表示
function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display  = 'none';
}

// アプリ画面を表示
async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'flex';

  // ユーザー名・役割を表示
  document.getElementById('user-name').textContent = currentProfile?.name || '';
  document.getElementById('user-role').textContent = currentProfile?.role === 'host' ? '管理者' : 'スタッフ';

  // ホスト専用UI
  if (currentProfile?.role === 'host') {
    document.querySelectorAll('.host-only').forEach(el => el.style.display = '');
  } else {
    document.querySelectorAll('.host-only').forEach(el => el.style.display = 'none');
  }

  await loadAllData();
  switchTab('shift');
}

// ログイン
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('auth-error');

  errEl.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    errEl.textContent = 'メールアドレスまたはパスワードが違います';
  }
}

// ログアウト
async function logout() {
  await sb.auth.signOut();
}

// 新規登録フォームの切り替え
function toggleRegister() {
  const registerForm = document.getElementById('register-form');
  registerForm.style.display = registerForm.style.display === 'none' ? 'block' : 'none';
}

// 新規登録
async function register() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const role  = document.getElementById('reg-role').value;
  const errEl = document.getElementById('auth-error');

  if (!name || !email || !pass) {
    errEl.textContent = '全ての項目を入力してください';
    return;
  }

  const { error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name, role } }
  });

  if (error) {
    errEl.textContent = '登録に失敗しました: ' + error.message;
  } else {
    errEl.style.color = 'var(--success)';
    errEl.textContent = '登録完了！メールを確認してください';
  }
}

// ============================================
// データ取得
// ============================================

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  currentProfile = data;
}

async function loadAllData() {
  // 全メンバー
  const { data: profiles } = await sb.from('profiles').select('*').order('name');
  allProfiles = profiles || [];

  // 全申請
  const { data: requests } = await sb.from('requests').select('*').order('created_at', { ascending: false });
  allRequests = requests || [];

  // メール設定
  const { data: settings } = await sb.from('email_settings').select('*').single();
  emailSettings = settings;
}

// ============================================
// タブ切り替え
// ============================================

function switchTab(tab) {
  document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

  document.querySelector(`.main-tab-btn[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'shift') {
    document.getElementById('tab-shift').style.display = 'block';
    renderCalendar();
  } else if (tab === 'request') {
    document.getElementById('tab-request').style.display = 'block';
    switchSubTab('apply');
  } else if (tab === 'settings') {
    document.getElementById('tab-settings').style.display = 'block';
    renderEmailSettings();
  }
}

function switchSubTab(sub) {
  document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.sub-content').forEach(el => el.style.display = 'none');

  document.querySelector(`.sub-tab-btn[data-sub="${sub}"]`)?.classList.add('active');

  if (sub === 'apply') {
    document.getElementById('sub-apply').style.display = 'block';
    renderApplyForm();
  } else if (sub === 'history') {
    document.getElementById('sub-history').style.display = 'block';
    renderHistory();
  } else if (sub === 'manage') {
    document.getElementById('sub-manage').style.display = 'block';
    renderManage();
  }
}

// ============================================
// シフト表（カレンダー）
// ============================================

function renderCalendar() {
  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  document.getElementById('cal-title').textContent = `${year}年 ${month + 1}月`;

  const firstDay = new Date(year, month, 1).getDay(); // 0=日
  const lastDate = new Date(year, month + 1, 0).getDate();

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // 曜日ヘッダー
  DAY_NAMES.forEach((name, i) => {
    const el = document.createElement('div');
    el.className = 'cal-header' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '');
    el.textContent = name;
    grid.appendChild(el);
  });

  // 空白セル（月初のオフセット）
  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(document.createElement('div'));
  }

  // 日付セル
  const today = new Date();
  for (let d = 1; d <= lastDate; d++) {
    const date    = new Date(year, month, d);
    const dateStr = formatDate(date);
    const dayOfWeek = date.getDay(); // 0=日

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (dayOfWeek === 0 ? ' sun' : dayOfWeek === 6 ? ' sat' : '');
    if (date.toDateString() === today.toDateString()) cell.classList.add('today');

    // 日付
    const dateEl = document.createElement('div');
    dateEl.className = 'cal-date';
    dateEl.textContent = d;
    cell.appendChild(dateEl);

    // その日に出勤するメンバーを表示
    const dayKey = String(dayOfWeek);
    allProfiles.forEach(profile => {
      if (!profile.shift_schedule) return;
      const shift = profile.shift_schedule[dayKey];
      if (!shift) return; // その曜日は休み

      // 休み申請があるか確認
      const req = getRequestForDate(profile.id, dateStr);

      const badge = document.createElement('div');
      if (req?.status === 'approved') {
        badge.className = 'shift-badge off';
        badge.textContent = `${profile.name} 休`;
      } else if (req?.status === 'pending') {
        badge.className = 'shift-badge pending';
        badge.textContent = `${profile.name} 申請中`;
      } else {
        badge.className = 'shift-badge on';
        badge.textContent = `${profile.name} ${shift.start}〜${shift.end}`;
      }
      cell.appendChild(badge);
    });

    // ホストはシフト設定ボタン
    if (currentProfile?.role === 'host') {
      const editBtn = document.createElement('button');
      editBtn.className = 'cal-edit-btn host-only';
      editBtn.textContent = '✏️';
      editBtn.onclick = () => openShiftModal();
      cell.appendChild(editBtn);
    }

    grid.appendChild(cell);
  }
}

// 指定ユーザー・日付の申請を取得
function getRequestForDate(userId, dateStr) {
  return allRequests.find(r =>
    r.employee_id === userId &&
    r.start_date <= dateStr &&
    r.end_date   >= dateStr
  );
}

// 月切り替え
function prevMonth() {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
}
function nextMonth() {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
}

// ============================================
// シフト設定モーダル（ホスト用）
// ============================================

function openShiftModal(profileId) {
  const modal = document.getElementById('shift-modal');
  const target = profileId
    ? allProfiles.find(p => p.id === profileId)
    : null;

  // メンバー選択リストを生成
  const select = document.getElementById('shift-member-select');
  select.innerHTML = allProfiles.map(p =>
    `<option value="${p.id}" ${p.id === (target?.id || currentProfile?.id) ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  onShiftMemberChange();
  modal.style.display = 'flex';
}

function closeShiftModal() {
  document.getElementById('shift-modal').style.display = 'none';
}

function onShiftMemberChange() {
  const select  = document.getElementById('shift-member-select');
  const profile = allProfiles.find(p => p.id === select.value);
  if (!profile) return;

  const schedule = profile.shift_schedule || {};
  DAY_KEYS.forEach(key => {
    const shift   = schedule[key];
    const enabled = document.getElementById(`shift-day-${key}-enabled`);
    const start   = document.getElementById(`shift-day-${key}-start`);
    const end     = document.getElementById(`shift-day-${key}-end`);

    if (enabled) enabled.checked = !!shift;
    if (start)   start.value = shift?.start || '09:00';
    if (end)     end.value   = shift?.end   || '17:00';
    updateShiftInputState(key);
  });
}

function updateShiftInputState(key) {
  const enabled = document.getElementById(`shift-day-${key}-enabled`);
  const start   = document.getElementById(`shift-day-${key}-start`);
  const end     = document.getElementById(`shift-day-${key}-end`);
  if (!enabled) return;
  const isOn = enabled.checked;
  if (start) start.disabled = !isOn;
  if (end)   end.disabled   = !isOn;
}

async function saveShift() {
  const select    = document.getElementById('shift-member-select');
  const profileId = select.value;

  const schedule = {};
  DAY_KEYS.forEach(key => {
    const enabled = document.getElementById(`shift-day-${key}-enabled`);
    const start   = document.getElementById(`shift-day-${key}-start`);
    const end     = document.getElementById(`shift-day-${key}-end`);
    if (enabled?.checked) {
      schedule[key] = { start: start.value, end: end.value };
    } else {
      schedule[key] = null;
    }
  });

  const { error } = await sb.from('profiles')
    .update({ shift_schedule: schedule })
    .eq('id', profileId);

  if (error) {
    alert('保存に失敗しました: ' + error.message);
    return;
  }

  // ローカルも更新
  const idx = allProfiles.findIndex(p => p.id === profileId);
  if (idx >= 0) allProfiles[idx].shift_schedule = schedule;

  closeShiftModal();
  renderCalendar();
  showToast('シフトを保存しました ✅');
}

// ============================================
// 休み申請フォーム
// ============================================

function renderApplyForm() {
  const container = document.getElementById('sub-apply');

  // 自分のシフト表示
  const schedule = currentProfile?.shift_schedule || {};
  const shiftText = DAY_KEYS.map(key => {
    const s = schedule[key];
    if (!s) return null;
    return `${DAY_NAMES[key]}曜 ${s.start}〜${s.end}`;
  }).filter(Boolean).join(' / ');

  document.getElementById('my-shift-display').textContent =
    shiftText || '固定シフト未設定';
}

async function submitRequest() {
  const start  = document.getElementById('req-start').value;
  const end    = document.getElementById('req-end').value;
  const reason = document.getElementById('req-reason').value.trim();

  if (!start || !end) {
    showToast('期間を選択してください', 'error');
    return;
  }
  if (start > end) {
    showToast('終了日は開始日以降を選択してください', 'error');
    return;
  }

  const { data, error } = await sb.from('requests').insert({
    employee_id: currentUser.id,
    start_date:  start,
    end_date:    end,
    reason:      reason || null,
    status:      'pending'
  }).select().single();

  if (error) {
    showToast('申請に失敗しました', 'error');
    return;
  }

  allRequests.unshift(data);

  // メール通知（ホスト全員へ）
  await sendEmailNotification('request', data);

  document.getElementById('req-start').value  = '';
  document.getElementById('req-end').value    = '';
  document.getElementById('req-reason').value = '';

  showToast('申請しました ✅');
  switchSubTab('history');
}

// ============================================
// 申請履歴
// ============================================

function renderHistory() {
  const list = document.getElementById('history-list');
  const myRequests = allRequests.filter(r => r.employee_id === currentUser.id);

  if (myRequests.length === 0) {
    list.innerHTML = '<p class="empty-msg">申請はありません</p>';
    return;
  }

  list.innerHTML = myRequests.map(r => `
    <div class="request-card status-${r.status}">
      <div class="req-period">${r.start_date} 〜 ${r.end_date}</div>
      <div class="req-reason">${r.reason || '（理由なし）'}</div>
      <div class="req-status">
        <span class="status-badge ${r.status}">${statusLabel(r.status)}</span>
        <span class="req-date">${formatDateTime(r.created_at)}</span>
      </div>
    </div>
  `).join('');
}

// ============================================
// 承認管理（ホスト用）
// ============================================

function renderManage() {
  const list = document.getElementById('manage-list');
  const pending = allRequests.filter(r => r.status === 'pending');

  if (pending.length === 0) {
    list.innerHTML = '<p class="empty-msg">承認待ちの申請はありません</p>';
    return;
  }

  list.innerHTML = pending.map(r => {
    const emp = allProfiles.find(p => p.id === r.employee_id);
    return `
      <div class="request-card status-pending">
        <div class="req-name">👤 ${emp?.name || '不明'}</div>
        <div class="req-period">${r.start_date} 〜 ${r.end_date}</div>
        <div class="req-reason">${r.reason || '（理由なし）'}</div>
        <div class="req-actions">
          <button class="btn btn-approve" onclick="reviewRequest('${r.id}', 'approved')">✅ 承認</button>
          <button class="btn btn-reject"  onclick="reviewRequest('${r.id}', 'rejected')">❌ 却下</button>
        </div>
      </div>
    `;
  }).join('');
}

async function reviewRequest(requestId, newStatus) {
  const { error } = await sb.from('requests').update({
    status:      newStatus,
    reviewed_by: currentUser.id,
    reviewed_at: new Date().toISOString()
  }).eq('id', requestId);

  if (error) {
    showToast('更新に失敗しました', 'error');
    return;
  }

  const idx = allRequests.findIndex(r => r.id === requestId);
  if (idx >= 0) {
    allRequests[idx].status      = newStatus;
    allRequests[idx].reviewed_by = currentUser.id;
    allRequests[idx].reviewed_at = new Date().toISOString();
  }

  // メール通知（申請者 + ホスト全員へ）
  const req = allRequests.find(r => r.id === requestId);
  await sendEmailNotification(newStatus, req);

  showToast(newStatus === 'approved' ? '承認しました ✅' : '却下しました');
  renderManage();
  renderCalendar();
}

// ============================================
// メール通知
// ============================================

async function sendEmailNotification(type, request) {
  try {
    const emp     = allProfiles.find(p => p.id === request.employee_id);
    const reviewer = request.reviewed_by
      ? allProfiles.find(p => p.id === request.reviewed_by)
      : null;
    const hosts = allProfiles.filter(p => p.role === 'host' && p.email);

    const payload = {
      type,        // 'request' | 'approved' | 'rejected'
      request,
      employee:  emp,
      reviewer,
      hosts,
      settings:  emailSettings
    };

    await fetch(`${CONFIG.BACKEND_URL}/send-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('メール送信スキップ（バックエンド未接続）:', e.message);
  }
}

// ============================================
// メール設定画面
// ============================================

function renderEmailSettings() {
  if (!emailSettings) return;

  // 各フォームに設定値を反映
  ['approval', 'rejection', 'request'].forEach(type => {
    document.getElementById(`${type}-subject`).value   = emailSettings[`${type}_subject`]   || '';
    document.getElementById(`${type}-greeting`).value  = emailSettings[`${type}_greeting`]  || '';
    document.getElementById(`${type}-footer`).value    = emailSettings[`${type}_footer`]    || '';

    const fields = emailSettings[`${type}_fields`] || {};
    Object.entries(fields).forEach(([key, val]) => {
      const el = document.getElementById(`${type}-field-${key}`);
      if (el) el.checked = val;
    });
  });
}

async function saveEmailSettings() {
  const updates = {};

  ['approval', 'rejection', 'request'].forEach(type => {
    updates[`${type}_subject`]  = document.getElementById(`${type}-subject`).value;
    updates[`${type}_greeting`] = document.getElementById(`${type}-greeting`).value;
    updates[`${type}_footer`]   = document.getElementById(`${type}-footer`).value;

    const fields = {};
    ['applicant_name','period','reason','shift_info','reviewer_name','reviewed_at'].forEach(key => {
      const el = document.getElementById(`${type}-field-${key}`);
      if (el) fields[key] = el.checked;
    });
    updates[`${type}_fields`] = fields;
  });

  const { error } = await sb.from('email_settings')
    .update(updates)
    .eq('id', emailSettings.id);

  if (error) {
    showToast('保存に失敗しました', 'error');
    return;
  }

  emailSettings = { ...emailSettings, ...updates };
  showToast('メール設定を保存しました ✅');
}

function previewEmail(type) {
  const subject  = document.getElementById(`${type}-subject`).value;
  const greeting = document.getElementById(`${type}-greeting`).value;
  const footer   = document.getElementById(`${type}-footer`).value;

  const fields = {};
  ['applicant_name','period','reason','shift_info','reviewer_name','reviewed_at'].forEach(key => {
    const el = document.getElementById(`${type}-field-${key}`);
    if (el) fields[key] = el?.checked;
  });

  // サンプルデータで差し込み
  let body = greeting.replace('{名前}', '山田 太郎').replace('{期間}', '2024/04/10〜2024/04/12').replace('{理由}', '私用');
  body += '\n\n';
  if (fields.applicant_name) body += '申請者: 山田 太郎\n';
  if (fields.period)         body += '期間: 2024/04/10 〜 2024/04/12\n';
  if (fields.reason)         body += '理由: 私用\n';
  if (fields.shift_info)     body += 'シフト: 月 09:00〜17:00\n';
  if (fields.reviewer_name)  body += '承認者: 管理者A\n';
  if (fields.reviewed_at)    body += '日時: 2024/04/08 14:30\n';
  body += '\n' + footer;

  document.getElementById('preview-subject').textContent = subject;
  document.getElementById('preview-body').textContent    = body;
  document.getElementById('email-preview-modal').style.display = 'flex';
}

function closePreviewModal() {
  document.getElementById('email-preview-modal').style.display = 'none';
}

// ============================================
// ユーティリティ
// ============================================

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function statusLabel(status) {
  return { pending: '申請中', approved: '承認済', rejected: '却下' }[status] || status;
}

// トースト通知
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// メンバー管理モーダル（ホスト用）
function openMemberModal() {
  const modal = document.getElementById('member-modal');
  const list  = document.getElementById('member-list');

  list.innerHTML = allProfiles.map(p => `
    <div class="member-row">
      <span>${p.name}</span>
      <span class="role-badge ${p.role}">${p.role === 'host' ? '管理者' : 'スタッフ'}</span>
      <button class="btn btn-sm" onclick="openShiftModal('${p.id}')">シフト設定</button>
    </div>
  `).join('');

  modal.style.display = 'flex';
}

function closeMemberModal() {
  document.getElementById('member-modal').style.display = 'none';
}
