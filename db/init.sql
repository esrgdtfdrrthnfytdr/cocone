-- ==========================================
-- 初期化用スクリプト (クラス単位出席版)
-- ==========================================

-- 1. リセット
DROP VIEW IF EXISTS attendance_book_view CASCADE;
DROP TABLE IF EXISTS attendance_results CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS courses CASCADE; -- 科目テーブルは廃止
DROP TABLE IF EXISTS classes CASCADE; -- 新しく作るため一旦削除
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;

-- 2. テーブル作成

-- ▼ 講師マスタ
CREATE TABLE teachers (
    teacher_id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL
);

-- ▼ 担当クラスマスタ (旧coursesから変更)
-- 先生が担任・担当しているクラスを管理します
CREATE TABLE classes (
    class_id SERIAL PRIMARY KEY,
    class_name TEXT NOT NULL,      -- クラス名 (例: R4A1, Aクラス)
    teacher_id INT REFERENCES teachers(teacher_id)
);

-- ▼ 生徒マスタ
-- 1. 生徒テーブル（既存のまま）
CREATE TABLE students (
    student_number TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    homeroom_class TEXT,           -- 生徒の所属クラス (例: R4A1)
    attendance_no INT
);

-- 2. 授業セッションテーブル（授業の「1コマ」を管理）
-- 日付や時限、どのクラスの授業かなどを記録します
CREATE TABLE class_sessions (
    session_id SERIAL PRIMARY KEY,
    class_name TEXT NOT NULL,      -- クラス名 (students.homeroom_classと対応)
    date DATE NOT NULL,            -- 授業日 (例: 2025-11-16)
    period INT,                    -- 何コマ目か (例: 1)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 出席結果テーブル（「誰が」「どの授業に」「どうだったか」を記録）
CREATE TABLE attendance_results (
    result_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES class_sessions(session_id),    -- どの授業回か
    student_number TEXT REFERENCES students(student_number), -- どの生徒か
    status TEXT NOT NULL,          -- '出席', '欠席', '遅刻' など
    note TEXT,                     -- 備考 (例: '電車遅延')
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. ビュー作成 (出席簿)
CREATE VIEW attendance_book_view AS
SELECT
    ar.result_id,
    ar.registered_at,
    ar.status,
    s.student_number,
    s.name AS student_name,
    s.homeroom_class AS student_homeroom,
    t.name AS teacher_name,
    c.class_name AS target_class, -- 出席を取ったクラス名
    cs.date AS session_date
FROM attendance_results ar
JOIN students s ON ar.student_number = s.student_number
JOIN class_sessions cs ON ar.session_id = cs.session_id
JOIN classes c ON cs.class_id = c.class_id
JOIN teachers t ON c.teacher_id = t.teacher_id;