document.addEventListener('DOMContentLoaded', () => {
    // 1. UI要素の取得
    const startBtn = document.getElementById('submit-btn');
    const classSelect = document.getElementById('class-select');
    const otpNumberDisplay = document.getElementById('otp-number');
    const statusMessage = document.getElementById('status-message');

    // 2. 音響設定 (テストで成功した確定設定)
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    const DURATION    = 0.5;   // 1ビットの枠
    const TONE_LENGTH = 0.4;   // 0.4秒鳴らして0.1秒休む(歯切れよく)

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;

    // 初期化
    async function initAudio() {
        await Tone.start();

        if (!synth) {
            synth = new Tone.Synth({
                oscillator: { type: "sine" }, // ノイズの少ない正弦波
                envelope: {
                    attack: 0.05,
                    decay: 0.1,
                    sustain: 0.8,
                    release: 0.05
                }
            }).toDestination();
            
            // 音量は固定 (少し大きめにしておく)
            synth.volume.value = -5; 
        }
    }

    // パターン再生
    function playSoundPattern(binaryStr) {
        const totalDuration = (1 + 4) * DURATION + 2.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // Start合図
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);

            // データビット
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

    // イベントリスナー
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            // 停止処理 (トグル動作)
            if (isPlaying) {
                stopAttendance();
                return;
            }

            const classId = classSelect.value;
            if (!classId) {
                alert("クラスを選択してください！");
                return;
            }

            try {
                await initAudio(); // AudioContext起動

                // UI変更
                startBtn.disabled = true;
                statusMessage.textContent = "OTP取得中...";

                // APIからOTPを取得
                const res = await fetch('/api/generate_otp', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ class_id: classId })
                });

                if (!res.ok) throw new Error("API Error");
                const data = await res.json();
                
                const otpDisplay = data.otp_display; // "10"
                const otpBinary  = data.otp_binary;  // "1010"

                otpNumberDisplay.textContent = otpDisplay;
                statusMessage.textContent = "信号送信中...";
                statusMessage.style.color = "#E74C3C";

                // ボタンを「停止」に変更
                startBtn.textContent = "停止";
                startBtn.style.backgroundColor = "#ff6b6b"; 
                startBtn.disabled = false;
                classSelect.disabled = true;

                console.log(`Sending: ${otpBinary}`);
                playSoundPattern(otpBinary);

            } catch (err) {
                console.error(err);
                alert("エラー: " + err.message);
                stopAttendance();
            }
        });
    }

    function stopAttendance() {
        if (sequenceLoop) {
            sequenceLoop.stop();
            sequenceLoop.dispose();
            sequenceLoop = null;
        }
        Tone.Transport.stop();
        isPlaying = false;

        startBtn.textContent = "出席確認";
        startBtn.style.backgroundColor = ""; 
        startBtn.disabled = false;
        classSelect.disabled = false;
        
        statusMessage.textContent = "待機中";
        statusMessage.style.color = "#666";
        otpNumberDisplay.textContent = "----";
    }
});