import os
import sys
import random
import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from dotenv import load_dotenv

# Windowsでの文字化け対策
sys.stdout.reconfigure(encoding='utf-8')

# .envファイルを読み込む
load_dotenv()

app = Flask(__name__)

# セッション情報（ログイン状態）を管理するための秘密鍵
app.secret_key = 'secret_key_cocone_dummy' 

# データベース設定
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "connect_args": {"options": "-c client_encoding=utf8"}
}

db = SQLAlchemy(app)

# ==================================================
# ルーティング (画面遷移)
# ==================================================

# 1. ログイン画面 (トップページ)
@app.route('/', methods=['GET', 'POST'])
def index():
    message = ""
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        # --- A. 先生テーブルを検索 ---
        sql_teacher = text("SELECT * FROM teachers WHERE email = :e")
        teacher = db.session.execute(sql_teacher, {"e": email}).fetchone()

        if teacher:
            # パスワードチェック (テスト用なので平文チェックにしています)
            # if check_password_hash(teacher.password_hash, password):
            if teacher.password_hash == password: 
                session['user_role'] = 'teacher'
                session['user_id'] = teacher.teacher_id
                session['user_name'] = teacher.name
                return redirect(url_for('teacher_page'))
        
        # --- B. 生徒テーブルを検索 ---
        sql_student = text("SELECT * FROM students WHERE email = :e")
        student = db.session.execute(sql_student, {"e": email}).fetchone()

        if student:
            if student.password_hash == password:
                session['user_role'] = 'student'
                session['user_id'] = student.student_number
                session['user_name'] = student.name
                session['homeroom'] = student.homeroom_class
                return redirect(url_for('student_page'))

        message = "ログイン失敗: メールアドレスかパスワードが違います"

    # 簡易ログインフォームを表示
    login_html = f"""
    <html>
    <head><title>ログイン</title></head>
    <body style="text-align:center; padding-top:50px; font-family:sans-serif;">
        <h1>Cocone ログイン</h1>
        <p style="color:red;">{message}</p>
        <form method="POST">
            <input type="text" name="email" placeholder="メールアドレス" style="padding:10px; width:300px;"><br><br>
            <input type="password" name="password" placeholder="パスワード" style="padding:10px; width:300px;"><br><br>
            <button type="submit" style="padding:10px 30px;">ログイン</button>
        </form>
        <p>【テストアカウント】<br>
           先生: doi@hcs.ac.jp / smoke <br>
           生徒: student@hcs.ac.jp / pass
        </p>
    </body>
    </html>
    """
    return login_html

# 2. 先生用ページ (RollCall)
@app.route('/teacher')
def teacher_page():
    # ログインチェック
    if session.get('user_role') != 'teacher':
        return redirect(url_for('index'))

    teacher_id = session['user_id']
    
    # ★修正箇所: courses ではなく classes テーブルから担当クラスを取得
    sql = text("SELECT * FROM classes WHERE teacher_id = :tid")
    my_classes = db.session.execute(sql, {"tid": teacher_id}).fetchall()

    # HTMLにクラスリスト(classes)を渡す
    return render_template('rollCall.html', teacher_name=session['user_name'], classes=my_classes)

# 3. 生徒用ページ (Register)
@app.route('/student')
def student_page():
    # ログインチェック
    if session.get('user_role') != 'student':
        return redirect(url_for('index'))

    return render_template('register.html', student_name=session['user_name'], homeroom=session['homeroom'])

# 4. ログアウト
@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))


# ==================================================
# API (非同期通信)
# ==================================================

# OTP生成 API (先生が実行)
@app.route('/api/generate_otp', methods=['POST'])
def generate_otp():
    if session.get('user_role') != 'teacher':
        return jsonify({"error": "Unauthorized"}), 401
        
    val = random.randint(0, 15)
    binary_str = format(val, '04b')
    
    # ★修正箇所: リクエストから class_id を取得
    data = request.json
    class_id = data.get('class_id') if data else None

    # ★修正箇所: DB保存も class_sessions テーブルへ (class_idを使用)
    sql = text("""
        INSERT INTO class_sessions (class_id, date, sound_token)
        VALUES (:cid, :date, :token)
        RETURNING session_id
    """)
    
    current_date = datetime.date.today().strftime('%Y-%m-%d')
    
    try:
        result = db.session.execute(sql, {
            "cid": class_id, 
            "date": current_date,
            "token": str(val)
        })
        db.session.commit()
        return jsonify({"otp_binary": binary_str, "otp_display": val})
        
    except Exception as e:
        print(f"❌ DBエラー: {e}")
        return jsonify({"error": str(e)}), 500

# 出席確認 API (学生が実行)
@app.route('/api/check_attend', methods=['POST'])
def check_attend():
    if session.get('user_role') != 'student':
        return jsonify({"status": "error", "message": "ログインしてください"}), 401

    data = request.json
    student_otp = data.get('otp_value')
    student_id = session['user_id'] # セッションから学籍番号を取得

    print(f"📝 受信: 生徒OTP={student_otp} (Student: {student_id})")

    # 最新の授業セッションを取得
    sql_get_session = text("""
        SELECT session_id, sound_token 
        FROM class_sessions 
        ORDER BY session_id DESC 
        LIMIT 1
    """)
    
    session_row = db.session.execute(sql_get_session).fetchone()
    
    if not session_row:
        return jsonify({"status": "error", "message": "授業が開催されていません"})
    
    current_session_id = session_row[0]
    correct_otp = int(session_row[1])
    
    if student_otp == correct_otp:
        # 重複チェックなしで登録
        sql_insert = text("""
            INSERT INTO attendance_results (session_id, student_number, status, note)
            VALUES (:sess_id, :stu_num, '出席', 'アプリ登録')
        """)
        try:
            db.session.execute(sql_insert, {
                "sess_id": current_session_id,
                "stu_num": student_id
            })
            db.session.commit()
            return jsonify({"status": "success", "message": "出席完了"})
        except Exception as e:
            return jsonify({"status": "error", "message": "DBエラー"})
    else:
        return jsonify({"status": "error", "message": "コード不一致"})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)