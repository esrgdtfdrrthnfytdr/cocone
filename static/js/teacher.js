document.addEventListener('DOMContentLoaded', function() {
    
    // 要素の取得
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const statusText = document.getElementById('status-text');
    const otpDisplay = document.getElementById('otp-display');
    const volumeSlider = document.getElementById('volume-slider');
    
    // 音声ファイルの読み込み (BGM用: 既存の実装を維持)
    let bgm = new Audio('/static/sounds/bgm1.wav');
    bgm.loop = true;

    // --- コマ判定ロジック ---
    function getCurrentPeriod() {
        const now = new Date();
        const totalMinutes = now.getHours() * 60 + now.getMinutes();

        // 1コマ目: 09:15(555) ~ 10:45(645)
        if (totalMinutes >= 555 && totalMinutes <= 645) return 1;
        
        // 2コマ目: 11:00(660) ~ 12:30(750)
        if (totalMinutes >= 660 && totalMinutes <= 750) return 2;
        
        // 3コマ目: 13:30(810) ~ 15:00(900)
        if (totalMinutes >= 810 && totalMinutes <= 900) return 3;
        
        // 4コマ目: 15:15(915) ~ 16:45(1005)
        if (totalMinutes >= 915 && totalMinutes <= 1005) return 4;

        return null; // 範囲外
    }

    // 音量調整
    if (volumeSlider) {
        volumeSlider.addEventListener('input', function() {
            bgm.volume = this.value;
        });
    }

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            const classId = document.getElementById('course-select').value;
            
            // コマ自動判定
            const periodVal = getCurrentPeriod();

            if (!classId) {
                if(statusText) {
                    statusText.textContent = "クラスを選択してください";
                    statusText.style.color = "red";
                }
                return;
            }

            // 授業時間外のチェック
            // ※動作確認時に時間外でも動かしたい場合は、このifブロックをコメントアウトしてください
            if (!periodVal) {
                alert("現在は授業時間外のため、コマを自動判定できませんでした。\n(9:15-10:45, 11:00-12:30, 13:30-15:00, 15:15-16:45)");
                return;
            }

            try {
                if(statusText) {
                    statusText.textContent = "接続中...";
                    statusText.style.color = "#333";
                }
                
                // APIにリクエスト送信
                const response = await fetch('/api/generate_otp', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        class_id: classId,
                        period: periodVal // 自動判定した値を送信
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    // OTP表示
                    if(otpDisplay) {
                        otpDisplay.textContent = data.otp_display;
                        otpDisplay.classList.add('active');
                    }
                    
                    if(statusText) statusText.textContent = `授業中 (${periodVal}コマ目) - コード発信中...`;
                    
                    // ボタン制御
                    startBtn.disabled = true;
                    startBtn.classList.add('disabled');
                    
                    if(stopBtn) {
                        stopBtn.disabled = false;
                        stopBtn.classList.remove('disabled');
                    }

                    // 音再生
                    bgm.volume = volumeSlider ? volumeSlider.value : 0.5;
                    bgm.play().catch(e => console.log("Audio play error:", e));

                } else {
                    alert("授業の開始に失敗しました");
                    if(statusText) statusText.textContent = "開始エラー";
                }

            } catch (error) {
                console.error('Error:', error);
                alert("サーバー通信エラーが発生しました");
                if(statusText) statusText.textContent = "通信エラー";
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            // 停止処理
            bgm.pause();
            bgm.currentTime = 0;
            
            if(otpDisplay) {
                otpDisplay.textContent = "----";
                otpDisplay.classList.remove('active');
            }
            if(statusText) statusText.textContent = "授業終了";

            startBtn.disabled = false;
            startBtn.classList.remove('disabled');
            
            stopBtn.disabled = true;
            stopBtn.classList.add('disabled');
        });
    }
});