-- ==========================================
-- データベース初期化 (db/init.sql)
-- ==========================================

-- 1. 既存オブジェクトの削除（リセット）
-- ------------------------------------------
DROP VIEW IF EXISTS attendance_book_view CASCADE;
DROP TABLE IF EXISTS attendance_results CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;

-- (旧名称のテーブルも念のため削除)
DROP TABLE IF EXISTS classes CASCADE;

-- 2. テーブル作成
-- ------------------------------------------

-- ▼ 講師マスタ
CREATE TABLE teachers (
    teacher_id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL
);

-- ▼ 生徒マスタ
CREATE TABLE students (
    student_number TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    homeroom_class TEXT,  -- 所属クラス (例: R4A1)
    attendance_no INT     -- 出席番号 (例: 1)
);

-- ▼ 授業・科目マスタ
CREATE TABLE courses (
    course_id SERIAL PRIMARY KEY,
    course_name TEXT NOT NULL, -- 科目名 (例: 土肥ゼミ)
    teacher_id INT REFERENCES teachers(teacher_id)
);

-- ▼ 授業実施セッション
CREATE TABLE class_sessions (
    session_id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(course_id),
    date TEXT,
    sound_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ▼ 出席結果
CREATE TABLE attendance_results (
    result_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES class_sessions(session_id),
    student_number TEXT REFERENCES students(student_number),
    status TEXT,
    note TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 出席登録日時
);

-- 3. ビュー作成 (出席簿機能用)
-- ------------------------------------------
CREATE VIEW attendance_book_view AS
SELECT
    ar.result_id,
    ar.registered_at,
    ar.status,
    s.student_number,
    s.name AS student_name,
    s.homeroom_class,
    s.attendance_no,
    t.name AS teacher_name,
    c.course_name,
    cs.date AS class_date
FROM attendance_results ar
JOIN students s ON ar.student_number = s.student_number
JOIN class_sessions cs ON ar.session_id = cs.session_id
JOIN courses c ON cs.course_id = c.course_id
JOIN teachers t ON c.teacher_id = t.teacher_id;