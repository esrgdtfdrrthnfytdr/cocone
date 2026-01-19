document.addEventListener('DOMContentLoaded', function() {
    
    // HTMLのIDに合わせて要素を取得
    const submitBtn = document.getElementById('submit-btn');
    const statusArea = document.getElementById('status-area');
    
    // 状態管理
    let isRunning = false;

    // --- コマ自動判定ロジック ---
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

        return null; 
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', async function() {
            
            // 既に実行中ならリロードしてリセット（簡易的な終了処理）
            if (isRunning) {
                location.reload();
                return;
            }

            // 時刻からコマを判定
            const autoPeriod = getCurrentPeriod();

            // 時間外のチェック
            // ※動作確認のために制限を外したい場合は、このif文をコメントアウトしてください
            if (!autoPeriod) {
                alert("現在は授業時間外のため、自動判定できませんでした。");
                return;
            }

            try {
                if(statusArea) statusArea.textContent = "接続中...";
                
                // サーバーへ送信 (class_idは送らない)
                const response = await fetch('/api/generate_otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        period: autoPeriod 
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    isRunning = true;
                    submitBtn.textContent = "終了";
                    submitBtn.style.backgroundColor = "#E57373"; // 終了時は赤っぽく
                    
                    if(statusArea) {
                        statusArea.innerHTML = `
                            授業中 (${autoPeriod}コマ目)<br>
                            OTP: <span style="font-size:1.5em; font-weight:bold;">${data.otp_display}</span>
                        `;
                    }

                } else {
                    alert("開始に失敗しました");
                    if(statusArea) statusArea.textContent = "エラー";
                }

            } catch (error) {
                console.error('Error:', error);
                alert("通信エラー");
                if(statusArea) statusArea.textContent = "通信エラー";
            }
        });
    }
});