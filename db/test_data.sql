-- ==========================================
-- テストデータ投入 (db/test_data.sql)
-- ==========================================

-- 1. 講師データ
-- teacher@hcs.ac.jp : pass
-- doi@hcs.ac.jp : smoke
INSERT INTO teachers (email, password_hash, name)
VALUES 
    ('teacher@hcs.ac.jp', 'pass', 'テスト講師'),
    ('doi@hcs.ac.jp', 'smoke', '土肥(講師)');

-- 2. 授業（科目）データ
INSERT INTO courses (course_name, teacher_id)
VALUES 
    -- 土肥先生の担当
    ('土肥ゼミ', (SELECT teacher_id FROM teachers WHERE email = 'doi@hcs.ac.jp')),
    -- テスト講師の担当
    ('テスト',   (SELECT teacher_id FROM teachers WHERE email = 'teacher@hcs.ac.jp'));

-- 3. 生徒データ
-- s20224033 : password_dummy
-- s99999999 : pass
INSERT INTO students (student_number, email, password_hash, name, homeroom_class, attendance_no)
VALUES 
    ('s20224033', '20224033-takahashiryo@hcs.ac.jp', 'password_dummy', '髙橋 亮', 'R4A1', 1),
    ('s99999999', 'student@hcs.ac.jp', 'pass', 'テスト学生', 'R4A1', 99);