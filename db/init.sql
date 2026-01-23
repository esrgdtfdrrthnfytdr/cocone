-- ==========================================
-- 初期化用スクリプト (修正・完全版)
-- ==========================================

-- 1. リセット (依存関係があるため順序に注意)
DROP VIEW IF EXISTS attendance_book_view CASCADE;
DROP TABLE IF EXISTS attendance_results CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;
-- 古いテーブルが残っている場合のために念のため削除
DROP TABLE IF EXISTS courses CASCADE;

-- 2. テーブル作成

-- ▼ 講師マスタ
CREATE TABLE teachers (
    teacher_id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL
);

-- ▼ 担当クラスマスタ
CREATE TABLE classes (
    class_id SERIAL PRIMARY KEY,
    class_name TEXT NOT NULL,
    teacher_id INT REFERENCES teachers(teacher_id)
);

-- ▼ 生徒マスタ
CREATE TABLE students (
    student_number TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    homeroom_class TEXT,
    attendance_no INT
);

-- ▼ 授業セッションテーブル (ここを修正しました)
-- class_name を廃止し、class_id で紐付け
-- sound_token (OTP) を追加
CREATE TABLE class_sessions (
    session_id SERIAL PRIMARY KEY,
    class_id INT REFERENCES classes(class_id), -- ★修正: クラスIDで紐付け
    date DATE NOT NULL,
    period INT,
    sound_token TEXT,                      -- ★追加: OTP保存用
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ▼ 出席結果テーブル
CREATE TABLE attendance_results (
    result_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES class_sessions(session_id),
    student_number TEXT REFERENCES students(student_number),
    status TEXT NOT NULL,
    note TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. ビュー作成 (出席簿)
-- テーブル定義に合わせて結合条件を整理
CREATE VIEW attendance_book_view AS
SELECT
    ar.result_id,
    ar.registered_at,
    ar.status,
    s.student_number,
    s.name AS student_name,
    s.homeroom_class AS student_homeroom,
    t.name AS teacher_name,
    c.class_name AS target_class,
    cs.date AS session_date
FROM attendance_results ar
JOIN students s ON ar.student_number = s.student_number
JOIN class_sessions cs ON ar.session_id = cs.session_id
JOIN classes c ON cs.class_id = c.class_id
JOIN teachers t ON c.teacher_id = t.teacher_id;