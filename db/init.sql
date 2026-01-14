-- ▼▼▼ 1. 既存のテーブル・ビューをすべて削除（リセット） ▼▼▼
DROP VIEW IF EXISTS attendance_summary_view CASCADE;
DROP TABLE IF EXISTS attendance_results CASCADE;
DROP TABLE IF EXISTS camera_detection CASCADE;
DROP TABLE IF EXISTS attend_requests CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS student_seat_map CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS students CASCADE;

-- ▼▼▼ 2. ここからテーブル作成 ▼▼▼

-- 学生マスタ
CREATE TABLE students (
    student_number TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    class_name TEXT,
    attendance_no INT,
    enrollment_year INT
);

-- 座席マスタ
CREATE TABLE seats (
    seat_id SERIAL PRIMARY KEY,
    room_id TEXT,
    seat_number INT,
    coord_x_min INT,
    coord_y_min INT,
    coord_x_max INT,
    coord_y_max INT
);

-- 学生座席割当
CREATE TABLE student_seat_map (
    map_id SERIAL PRIMARY KEY,
    academic_year TEXT,
    student_number TEXT REFERENCES students(student_number),
    seat_id INT REFERENCES seats(seat_id)
);

-- 授業実施データ
CREATE TABLE class_sessions (
    session_id SERIAL PRIMARY KEY,
    subject_name TEXT,
    room_id TEXT,
    date TEXT,
    period_slot INT,
    target_grade INT,
    sound_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- スマホ出席リクエスト
CREATE TABLE attend_requests (
    request_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES class_sessions(session_id),
    student_id TEXT,
    token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN
);

-- カメラ検知ログ
CREATE TABLE camera_detection (
    detection_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES class_sessions(session_id),
    seat_id INT,
    is_detected BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 最終出席結果
CREATE TABLE attendance_results (
    result_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES class_sessions(session_id),
    student_number TEXT REFERENCES students(student_number),
    status TEXT,
    note TEXT
);

-- ▼▼▼ 3. 最後にビューを作成 ▼▼▼
CREATE OR REPLACE VIEW attendance_summary_view AS 
SELECT 
    res.result_id, 
    sess.date, 
    sess.period_slot, 
    sess.subject_name, 
    stu.student_number, 
    stu.name, 
    stu.class_name, 
    res.status, 
    res.note 
FROM attendance_results res 
JOIN class_sessions sess ON res.session_id = sess.session_id 
JOIN students stu ON res.student_number = stu.student_number;