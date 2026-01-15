-- ==========================================
-- テストデータ投入 (クラス単位版)
-- ==========================================

-- 1. 講師データ
INSERT INTO teachers (email, password_hash, name) VALUES 
    ('teacher@hcs.ac.jp', 'pass', 'テスト担任'),
    ('doi@hcs.ac.jp', 'smoke', '土肥(先生)');

-- 2. 担当クラスデータ (ここが変わりました)
-- 先生がどのクラスで出席を取れるかを登録します
INSERT INTO classes (class_name, teacher_id) VALUES 
    -- 土肥先生は「R4A1」クラスを担当
    ('R4A1', (SELECT teacher_id FROM teachers WHERE email = 'doi@hcs.ac.jp')),
    
    -- テスト担任は「テスト組」を担当
    ('テスト組', (SELECT teacher_id FROM teachers WHERE email = 'teacher@hcs.ac.jp'));

-- 3. 生徒データ
-- 生徒の homeroom_class も合わせておきます
INSERT INTO students (student_number, email, password_hash, name, homeroom_class, attendance_no) VALUES 
    ('s20224033', '20224033-takahashiryo@hcs.ac.jp', 'password_dummy', '髙橋 亮', 'R4A1', 1),
    ('s99999999', 'student@hcs.ac.jp', 'pass', 'テスト学生', 'テスト組', 99);