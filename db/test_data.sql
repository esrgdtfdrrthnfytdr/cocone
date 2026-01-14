-- ==========================================
-- テストデータの投入
-- ==========================================

-- ------------------------------------------
-- 1. 講師データの登録
-- ------------------------------------------
INSERT INTO teachers (email, password_hash, name)
VALUES 
    ('teacher@hcs.ac.jp', 'password_dummy', 'テスト講師'),
    ('doi@hcs.ac.jp', 'password_dummy', '土肥(講師)');

-- ------------------------------------------
-- 2. 授業（科目）データの登録
-- ------------------------------------------
-- courses テーブルへ登録します
INSERT INTO courses (course_name, teacher_id)
VALUES 
    ('土肥ゼミ', (SELECT teacher_id FROM teachers WHERE email = 'doi@hcs.ac.jp')),
    ('テスト',   (SELECT teacher_id FROM teachers WHERE email = 'teacher@hcs.ac.jp'));

    
-- ------------------------------------------
-- 3. 生徒データの登録
-- ------------------------------------------
-- homeroom_class (所属クラス) に R4A1 などを入れます
INSERT INTO students (student_number, email, password_hash, name, homeroom_class, attendance_no)
VALUES 
    -- 髙橋さんのアカウント
    ('s20224033', '20224033-takahashiryo@hcs.ac.jp', 'password_dummy', '髙橋 亮', 'R4A1', 1),
    -- テスト用アカウント
    ('s99999999', 'student@hcs.ac.jp', 'password_dummy', 'テスト学生', 'R4A1', 99);

-- ==========================================
-- 確認用
-- ==========================================
SELECT * FROM teachers;
SELECT * FROM courses;
SELECT * FROM students;