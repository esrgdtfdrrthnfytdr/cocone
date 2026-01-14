import os
import sys
import random
import datetime
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from dotenv import load_dotenv

# Windowsでの文字化け対策
sys.stdout.reconfigure(encoding='utf-8')

# .envファイルを読み込む
load_dotenv()

app = Flask(__name__)

# データベース設定 (Windows用にUTF-8オプションを追加)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "connect_args": {"options": "-c client_encoding=utf8"}
}

db = SQLAlchemy(app)

# トップページ
@app.route('/')
def index():
    return "Cocone Attendance V3 (DB Connected)"

# 先生用ページ
@app.route('/teacher')
def teacher_page():
    return render_template('teacher.html')

# 学生用ページ
@app.route('/student')
def student_page():
    return render_template('student.html')

# API: OTP生成 (先生が実行) -> DBに授業を作成
@app.route('/api/generate_otp', methods=['POST'])
def generate_otp():
    # 1. ランダムな4ビット(0-15)の値を生成
    val = random.randint(0, 15)
    binary_str = format(val, '04b')
    
    # 2. データベースに「授業セッション」を保存
    # 本来は科目名などを画面で選びますが、今回は「IoT演習」で固定します
    sql = text("""
        INSERT INTO class_sessions (subject_name, room_id, date, sound_token)
        VALUES (:subj, :room, :date, :token)
        RETURNING session_id
    """)
    
    current_date = datetime.date.today().strftime('%Y-%m-%d')
    
    try:
        result = db.session.execute(sql, {
            "subj": "IoT演習",
            "room": "Room101",
            "date": current_date,
            "token": str(val) # 正解の数値を文字として保存
        })
        db.session.commit()
        
        # 保存したセッションIDを取得 (ログ出力用)
        new_id = result.fetchone()[0]
        print(f"✅ DB保存完了: Session ID={new_id}, 正解={val} ({binary_str})")
        
        return jsonify({"otp_binary": binary_str, "otp_display": val})
        
    except Exception as e:
        print(f"❌ DBエラー: {e}")
        return jsonify({"error": "Database error"}), 500

# API: 出席確認 (学生が実行) -> DBと照合して保存
@app.route('/api/check_attend', methods=['POST'])
def check_attend():
    data = request.json
    student_otp = data.get('otp_value') # 生徒が解読した値 (数値)
    
    # テスト用：今のアプリには学生ID入力欄がないので、さっき作った「test」さんとして扱います
    student_id = 's99999999' 
    
    print(f"📝 受信: 生徒OTP={student_otp} (Student: {student_id})")

    # 1. 最新の授業セッションを探す
    # (一番IDが大きい＝最新 とみなします)
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
    correct_otp = int(session_row[1]) # DBから正解を取得
    
    # 2. 正解判定
    if student_otp == correct_otp:
        # 正解なら「出席結果」テーブルに書き込む
        sql_insert_result = text("""
            INSERT INTO attendance_results (session_id, student_number, status, note)
            VALUES (:sess_id, :stu_num, '出席', 'アプリから登録')
        """)
        
        try:
            db.session.execute(sql_insert_result, {
                "sess_id": current_session_id,
                "stu_num": student_id
            })
            db.session.commit()
            print("🎉 出席データをDBに書き込みました！")
            return jsonify({"status": "success", "message": "出席完了！DBに登録しました"})
            
        except Exception as e:
            print(f"❌ 書き込みエラー: {e}")
            return jsonify({"status": "error", "message": "すでに登録済みか、エラーが発生しました"})
            
    else:
        return jsonify({"status": "error", "message": f"コードが違います (正解は {correct_otp})"})

if __name__ == '__main__':
    # 外部(スマホ)から接続できるように '0.0.0.0' で起動
    app.run(debug=True, host='0.0.0.0', port=5000)