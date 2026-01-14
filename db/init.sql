-- ==========================================
-- 1. 既存テーブルの削除（リセット）
-- ==========================================

-- 名前変更前のテーブルも含めて削除
-- DROP TABLE IF EXISTS classes CASCADE;
-- DROP TABLE IF EXISTS courses CASCADE;
-- DROP TABLE IF EXISTS teachers CASCADE;
-- DROP TABLE IF EXISTS students CASCADE;

-- -- 関連テーブルも整合性のため削除
-- DROP TABLE IF EXISTS attendance_results CASCADE;
-- DROP TABLE IF EXISTS attend_requests CASCADE;
-- DROP TABLE IF EXISTS student_seat_map CASCADE;
-- DROP TABLE IF EXISTS class_sessions CASCADE;


-- ==========================================
-- 2. 新規テーブルの作成
-- ==========================================

-- ▼ (A) 生徒マスタ
CREATE TABLE students (
    student_number TEXT PRIMARY KEY,   -- 学籍番号
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    homeroom_class TEXT,               -- ★変更: 所属クラス (例: R4A1)
    attendance_no INT                  -- 出席番号 (例: 1)
);

-- ▼ (B) 講師マスタ
CREATE TABLE teachers (
    teacher_id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL
);

-- ▼ (C) 授業（科目）マスタ
-- ★変更: テーブル名を classes から courses に変更
CREATE TABLE courses (
    course_id SERIAL PRIMARY KEY,
    course_name TEXT NOT NULL,         -- ★変更: 科目名 (例: 土肥ゼミ)
    teacher_id INT REFERENCES teachers(teacher_id)
);

-- ==========================================
-- 3. アプリ動作に必要なその他のテーブル
-- ==========================================

-- 授業実施セッション（実際に授業が行われた日時の記録）
CREATE TABLE class_sessions (
    session_id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(course_id), -- ★変更: 科目IDと紐付け
    date TEXT,
    sound_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 出席結果
CREATE TABLE attendance_results (
    result_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES class_sessions(session_id),
    student_number TEXT REFERENCES students(student_number),
    status TEXT,
    note TEXT
);