from flask import Flask, render_template, request, jsonify
import random

app = Flask(__name__)

# 現在のセッション情報
current_session = {
    "otp_value": None,   # 0〜15の整数 (例: 10 -> Binary '1010')
    "otp_binary": ""     # '1010' のような文字列
}

@app.route('/')
def index():
    return "Cocone Attendance V2"

@app.route('/teacher')
def teacher_page():
    return render_template('teacher.html')

@app.route('/student')
def student_page():
    return render_template('student.html')

@app.route('/api/generate_otp', methods=['POST'])
def generate_otp():
    # 4ビット(0-15)の値を生成
    val = random.randint(0, 15)
    # 2進数文字列に変換 (例: 5 -> '0101')
    binary_str = format(val, '04b')
    
    current_session["otp_value"] = val
    current_session["otp_binary"] = binary_str
    
    print(f"🔑 新しいOTP生成: {val} (Binary: {binary_str})")
    return jsonify({"otp_binary": binary_str, "otp_display": val})

@app.route('/api/check_attend', methods=['POST'])
def check_attend():
    data = request.json
    student_otp = data.get('otp_value') # 生徒が解読した値
    
    print(f"📝 照合: 生徒={student_otp} vs 正解={current_session['otp_value']}")

    if student_otp == current_session["otp_value"]:
        return jsonify({"status": "success", "message": "出席完了！"})
    else:
        return jsonify({"status": "error", "message": "コードが違います"})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)