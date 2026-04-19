// ============================================
// gmail-server.js - メール送信バックエンド
// Node.js + Express + Gmail API
// ============================================

const express    = require('express');
const cors       = require('cors');
const { google } = require('googleapis');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ---- Gmail OAuth2 クライアント設定 ----
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// ============================================
// メール送信エンドポイント
// POST /send-email
// ============================================
app.post('/send-email', async (req, res) => {
  try {
    const { type, request, employee, reviewer, hosts, settings } = req.body;

    const emails = buildEmails({ type, request, employee, reviewer, hosts, settings });

    // 全メールを並列送信
    await Promise.all(emails.map(sendMail));

    res.json({ success: true, sent: emails.length });
  } catch (err) {
    console.error('メール送信エラー:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// メール内容を組み立てる
// ============================================
function buildEmails({ type, request, employee, reviewer, hosts, settings }) {
  if (!settings) return [];

  const emails = [];

  if (type === 'request') {
    // 申請受付：ホスト全員へ
    const s       = settings;
    const subject = replaceTags(s.request_subject, employee, request, reviewer);
    const body    = buildBody({
      greeting: s.request_greeting,
      fields:   s.request_fields,
      footer:   s.request_footer,
      employee, request, reviewer,
      eventType: '休み申請が届きました'
    });

    hosts.forEach(host => {
      if (host.email) {
        emails.push({ to: host.email, subject, body });
      }
    });

  } else if (type === 'approved' || type === 'rejected') {
    const key = type === 'approved' ? 'approval' : 'rejection';
    const s   = settings;
    const subject = replaceTags(s[`${key}_subject`], employee, request, reviewer);
    const body    = buildBody({
      greeting:  s[`${key}_greeting`],
      fields:    s[`${key}_fields`],
      footer:    s[`${key}_footer`],
      employee, request, reviewer,
      eventType: type === 'approved' ? '申請が承認されました' : '申請が却下されました'
    });

    // 申請者へ
    if (employee?.email) {
      emails.push({ to: employee.email, subject, body });
    }
    // ホスト全員へも
    hosts.forEach(host => {
      if (host.email) {
        emails.push({ to: host.email, subject, body });
      }
    });
  }

  return emails;
}

// メール本文を組み立てる
function buildBody({ greeting, fields, footer, employee, request, reviewer, eventType }) {
  let lines = [];

  lines.push(replaceTags(greeting, employee, request, reviewer));
  lines.push('');
  lines.push(eventType);
  lines.push('');

  if (fields?.applicant_name) lines.push(`申請者：${employee?.name || '不明'}`);
  if (fields?.period)         lines.push(`期間：${request.start_date} 〜 ${request.end_date}`);
  if (fields?.reason)         lines.push(`理由：${request.reason || 'なし'}`);
  if (fields?.shift_info && employee?.shift_schedule) {
    const shiftText = buildShiftText(employee.shift_schedule);
    if (shiftText) lines.push(`シフト：${shiftText}`);
  }
  if (fields?.reviewer_name && reviewer) lines.push(`担当者：${reviewer.name}`);
  if (fields?.reviewed_at && request.reviewed_at) {
    lines.push(`処理日時：${new Date(request.reviewed_at).toLocaleString('ja-JP')}`);
  }

  lines.push('');
  lines.push(footer || '');

  return lines.join('\n');
}

// タグを実際の値に置換
function replaceTags(template, employee, request, reviewer) {
  if (!template) return '';
  return template
    .replace(/\{名前\}/g, employee?.name || '')
    .replace(/\{期間\}/g, `${request?.start_date}〜${request?.end_date}`)
    .replace(/\{理由\}/g, request?.reason || 'なし');
}

// シフトJSONをテキストに変換
function buildShiftText(schedule) {
  const DAY_NAMES = ['日','月','火','水','木','金','土'];
  return Object.entries(schedule)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${DAY_NAMES[k]}曜 ${v.start}〜${v.end}`)
    .join('、');
}

// ============================================
// Gmail API でメール送信
// ============================================
async function sendMail({ to, subject, body }) {
  // RFC 2822 形式のメールを Base64 エンコード
  const from    = process.env.GMAIL_FROM_ADDRESS || 'no-reply@shiftboard.app';
  const raw     = [
    `From: ShiftBoard <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64')
  ].join('\r\n');

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId:      'me',
    requestBody: { raw: encoded }
  });
}

// ============================================
// サーバー起動
// ============================================
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`✅ ShiftBoard バックエンドサーバー起動: port ${PORT}`);
});
