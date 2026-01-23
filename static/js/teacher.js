document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. UI要素の取得
    // ==========================================
    const startBtn = document.getElementById('submit-btn');
    // HTMLにある "status-area" を取得します
    const statusArea = document.getElementById('status-area');

    // ==========================================
    // 2. 音響設定
    // ==========================================
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    const DURATION    = 0.5;   
    const TONE_LENGTH = 0.4;   

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;

    async function initAudio() {
        await Tone.start();
        if (!synth) {
            synth = new Tone.Synth({
                oscillator: { type: "sine" },
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.05 }
            }).toDestination();
            synth.volume.value = -5; 
        }
    }

    function playSoundPattern(binaryStr) {
        const totalDuration = (1 + 4) * DURATION + 2.0; 
        sequenceLoop = new Tone.Loop((time) => {
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, TONE_LENGTH, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;
    }

    // ★画面表示を更新する関数
    function updateDisplay(msg, otp = null, color = "#666") {
        if (!statusArea) return;

        // OTPがある場合は大きく表示、なければメッセージのみ
        if (otp !== null) {
            statusArea.innerHTML = `
                <div style="font-size: 3rem; font-weight: bold; color: #333; margin-bottom: 10px;">${otp}</div>
                <div style="font-size: 1.2rem; color: ${color};">${msg}</div>
            `;
        } else {
            statusArea.innerHTML = `<div style="font-size: 1.2rem; color: ${color};">${msg}</div>`;
        }
    }

    // ==========================================
    // 3. イベント処理
    // ==========================================
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            // 停止処理
            if (isPlaying) {
                stopAttendance();
                return;
            }

            // ★クラスID固定 (デモ用: 1)
            const classId = 1; 

            try {
                await initAudio(); 

                // ボタン無効化・準備中表示
                startBtn.disabled = true;
                updateDisplay("OTP取得中...");

                // APIコール
                const res = await fetch('/api/generate_otp', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ class_id: classId })
                });

                if (!res.ok) throw new Error("API Error");
                const data = await res.json();
                
                const otpDisplay = data.otp_display; // 表示用 (例: 10)
                const otpBinary  = data.otp_binary;  // 音響用 (例: 1010)

                // 送信中表示
                updateDisplay("信号送信中...", otpDisplay, "#E74C3C");

                // ボタンを「停止」に変更
                startBtn.textContent = "停止";
                startBtn.style.backgroundColor = "#ff6b6b"; 
                startBtn.disabled = false;
                
                console.log(`Sending: ${otpBinary}`);
                playSoundPattern(otpBinary);

            } catch (err) {
                console.error(err);
                alert("エラー: " + err.message);
                stopAttendance();
            }
        });
    } else {
        console.error("エラー: 'submit-btn' が見つかりません");
    }

    function stopAttendance() {
        if (sequenceLoop) {
            sequenceLoop.stop();
            sequenceLoop.dispose();
            sequenceLoop = null;
        }
        Tone.Transport.stop();
        isPlaying = false;

        if (startBtn) {
            startBtn.textContent = "出席確認";
            startBtn.style.backgroundColor = ""; 
            startBtn.disabled = false;
        }
        
        // 待機中表示に戻す
        updateDisplay("待機中");
    }
});