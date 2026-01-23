document.addEventListener('DOMContentLoaded', () => {
    // 1. UI要素の取得
    const startBtn = document.getElementById('submit-btn');
    const otpNumberDisplay = document.getElementById('otp-number');
    const statusMessage = document.getElementById('status-message');

    // HTMLから探すのをやめる（エラー回避）
    // const classIdInput = document.getElementById('target-class-id'); 

    // 2. 音響設定
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

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            if (isPlaying) {
                stopAttendance();
                return;
            }

            // ★修正: デモ用にクラスIDを「1」で固定する
            // これにより、HTML側に何もなくてもエラーになりません
            const classId = 1; 

            try {
                await initAudio(); 

                startBtn.disabled = true;
                statusMessage.textContent = "OTP取得中...";

                const res = await fetch('/api/generate_otp', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ class_id: classId })
                });

                if (!res.ok) throw new Error("API Error");
                const data = await res.json();
                
                const otpDisplay = data.otp_display; 
                const otpBinary  = data.otp_binary;  

                otpNumberDisplay.textContent = otpDisplay;
                statusMessage.textContent = "信号送信中...";
                statusMessage.style.color = "#E74C3C";

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
        
        statusMessage.textContent = "待機中";
        statusMessage.style.color = "#666";
        otpNumberDisplay.textContent = "----";
    }
});