-- 1. テスト用の学生を作る (学籍番号: s20224033, パスワード: test)
INSERT INTO students (student_number, email, password_hash, name, class_name)
VALUES ('s20224033', 'test@example.com', 'hashed_pw_dummy', 'テスト太郎', '2年生');

-- 2. テスト用の授業を作る (今日の授業)
INSERT INTO class_sessions (subject_name, room_id, date, period_slot, target_grade)
VALUES ('IoT基礎', 'RoomA', '2026-01-14', 1, 2);

-- 3. 作ったデータを確認する
SELECT * FROM students;
SELECT * FROM class_sessions;