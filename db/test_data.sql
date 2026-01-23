-- ==========================================
-- テストデータ投入 (30名追加版)
-- ==========================================

-- 1. 先生データの作成
-- 指定: doi@hcs.ac.jp / smoke / 土肥 先生
INSERT INTO teachers (email, password_hash, name) VALUES
('doi@hcs.ac.jp', 'smoke', '土肥 先生');

-- 2. クラスデータの作成
INSERT INTO classes (class_name, teacher_id) VALUES
('R4A1', 1),  -- class_id: 1
('R4A2', 1);  -- class_id: 2

-- 3. 生徒データの作成
-- 指定形式: s2025xxxx, 数字-fullname@hcs.ac.jp
-- ※1人目は開発用アカウント(student@hcs.ac.jp)として固定しています
INSERT INTO students (student_number, email, password_hash, name, homeroom_class, attendance_no) VALUES

-- ▼ 開発用アカウント (ID: s20250001)
('s20250001', 'student@hcs.ac.jp', 'pass', '開発 太郎', 'R4A1', 1),

-- ▼ テスト用生徒 (R4A1クラス 15名)
('s20250002', '20250002-hanakosato@hcs.ac.jp', 'pass', '佐藤 花子', 'R4A1', 2),
('s20250003', '20250003-kenjitanaka@hcs.ac.jp', 'pass', '田中 健二', 'R4A1', 3),
('s20250004', '20250004-yutakahashi@hcs.ac.jp', 'pass', '高橋 優', 'R4A1', 4),
('s20250005', '20250005-sakurawatanabe@hcs.ac.jp', 'pass', '渡辺 さくら', 'R4A1', 5),
('s20250006', '20250006-daisukeito@hcs.ac.jp', 'pass', '伊藤 大輔', 'R4A1', 6),
('s20250007', '20250007-aiko_yamamoto@hcs.ac.jp', 'pass', '山本 愛子', 'R4A1', 7),
('s20250008', '20250008-hiroshinakamura@hcs.ac.jp', 'pass', '中村 博', 'R4A1', 8),
('s20250009', '20250009-mayumikobayashi@hcs.ac.jp', 'pass', '小林 真由美', 'R4A1', 9),
('s20250010', '20250010-tatsuya_kato@hcs.ac.jp', 'pass', '加藤 達也', 'R4A1', 10),
('s20250011', '20250011-yoshidayuko@hcs.ac.jp', 'pass', '吉田 裕子', 'R4A1', 11),
('s20250012', '20250012-takumiyamada@hcs.ac.jp', 'pass', '山田 拓海', 'R4A1', 12),
('s20250013', '20250013-nanamisasaki@hcs.ac.jp', 'pass', '佐々木 七海', 'R4A1', 13),
('s20250014', '20250014-kotayamaguchi@hcs.ac.jp', 'pass', '山口 琥太', 'R4A1', 14),
('s20250015', '20250015-rinasaito@hcs.ac.jp', 'pass', '斎藤 莉奈', 'R4A1', 15),
('s20250016', '20250016-shotamatsumoto@hcs.ac.jp', 'pass', '松本 翔太', 'R4A1', 16),

-- ▼ テスト用生徒 (R4A2クラス 15名)
('s20250017', '20250017-ichirosuzuki@hcs.ac.jp', 'pass', '鈴木 一郎', 'R4A2', 1),
('s20250018', '20250018-kaoriinoue@hcs.ac.jp', 'pass', '井上 香織', 'R4A2', 2),
('s20250019', '20250019-takashikimura@hcs.ac.jp', 'pass', '木村 隆', 'R4A2', 3),
('s20250020', '20250020-emikoabayashi@hcs.ac.jp', 'pass', '林 恵美子', 'R4A2', 4),
('s20250021', '20250021-kentosimizu@hcs.ac.jp', 'pass', '清水 健人', 'R4A2', 5),
('s20250022', '20250022-yuiyamazaki@hcs.ac.jp', 'pass', '山崎 結衣', 'R4A2', 6),
('s20250023', '20250023-ryoikeda@hcs.ac.jp', 'pass', '池田 亮', 'R4A2', 7),
('s20250024', '20250024-misakihashimoto@hcs.ac.jp', 'pass', '橋本 美咲', 'R4A2', 8),
('s20250025', '20250025-kazukiabe@hcs.ac.jp', 'pass', '阿部 一樹', 'R4A2', 9),
('s20250026', '20250026-tomokimori@hcs.ac.jp', 'pass', '森 智子', 'R4A2', 10),
('s20250027', '20250027-masatoishikawa@hcs.ac.jp', 'pass', '石川 雅人', 'R4A2', 11),
('s20250028', '20250028-ayumiogawa@hcs.ac.jp', 'pass', '小川 歩美', 'R4A2', 12),
('s20250029', '20250029-naokifujita@hcs.ac.jp', 'pass', '藤田 直樹', 'R4A2', 13),
('s20250030', '20250030-hinaokada@hcs.ac.jp', 'pass', '岡田 陽菜', 'R4A2', 14),
('s20250031', '20250031-keisukegoto@hcs.ac.jp', 'pass', '後藤 圭介', 'R4A2', 15);

-- 4. 授業セッションデータの作成
-- R4A1 (class_id: 1) 用のテストセッション (OTP: 0000)
INSERT INTO class_sessions (class_id, date, period, sound_token) VALUES
(1, CURRENT_DATE, 1, '0000');