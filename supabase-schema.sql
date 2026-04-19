-- ============================================
-- ShiftBoard - Supabase Schema
-- ============================================

-- ユーザープロフィール（認証ユーザーと連携）
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'employee')),
  email TEXT,                        -- 任意入力（未登録ならアプリ内通知のみ）
  -- 曜日ごとのシフト（JSON形式）
  -- 例: {"0":null,"1":{"start":"09:00","end":"17:00"},"2":{"start":"13:00","end":"21:00"},...}
  -- 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土
  -- 出勤しない曜日は null
  shift_schedule JSONB DEFAULT '{
    "0": null,
    "1": null,
    "2": null,
    "3": null,
    "4": null,
    "5": null,
    "6": null
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 休み申請
CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),   -- 承認・却下したホストのID
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- メール設定（1レコードのみ使用 = グローバル設定）
CREATE TABLE email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 承認メール設定
  approval_subject TEXT DEFAULT '【シフト申請】承認されました',
  approval_greeting TEXT DEFAULT '{名前} さん',
  approval_footer TEXT DEFAULT 'ご不明な点はホストまでお問い合わせください。',
  approval_fields JSONB DEFAULT '{
    "applicant_name": true,
    "period": true,
    "reason": true,
    "shift_info": true,
    "reviewer_name": true,
    "reviewed_at": true
  }',
  -- 却下メール設定
  rejection_subject TEXT DEFAULT '【シフト申請】却下されました',
  rejection_greeting TEXT DEFAULT '{名前} さん',
  rejection_footer TEXT DEFAULT 'ご不明な点はホストまでお問い合わせください。',
  rejection_fields JSONB DEFAULT '{
    "applicant_name": true,
    "period": true,
    "reason": true,
    "shift_info": false,
    "reviewer_name": true,
    "reviewed_at": true
  }',
  -- 申請受付メール設定（ホスト向け）
  request_subject TEXT DEFAULT '【シフト申請】新しい申請があります',
  request_greeting TEXT DEFAULT 'ホストの皆様',
  request_footer TEXT DEFAULT '承認管理画面からご確認ください。',
  request_fields JSONB DEFAULT '{
    "applicant_name": true,
    "period": true,
    "reason": true,
    "shift_info": true,
    "reviewer_name": false,
    "reviewed_at": false
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期メール設定レコードを挿入
INSERT INTO email_settings DEFAULT VALUES;

-- ============================================
-- Row Level Security (RLS) 設定
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

-- profiles: 自分のプロフィールは読み書き可、他人のも読める（シフト表表示のため）
CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ホストは全員のプロフィールを更新可（シフト設定のため）
CREATE POLICY "profiles_host_update_all" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'host'
    )
  );

-- requests: 自分の申請は読み書き可
CREATE POLICY "requests_select_own" ON requests
  FOR SELECT USING (
    employee_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'host')
  );

CREATE POLICY "requests_insert_own" ON requests
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY "requests_update_host" ON requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'host')
  );

-- email_settings: ホストのみ読み書き可
CREATE POLICY "email_settings_host_all" ON email_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'host')
  );

-- ============================================
-- 自動更新トリガー（updated_at）
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER email_settings_updated_at
  BEFORE UPDATE ON email_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 新規ユーザー登録時に profiles を自動作成
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', '名前未設定'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
