document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    const otpNumberDisplay = document.getElementById('otp-number');
    const statusMessage = document.getElementById('status-message');

    // 音響設定 (修正版プロトコル)
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    const DURATION    = 0.5;   // 0.5秒/bit

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;

    // 固定OTP設定
    const FIXED_OTP_BINARY = "1111"; // テスト用固定値
    const FIXED_OTP_DISPLAY = "15";  // 1111(2進数) = 15(10進数)

    async function initAudio() {
        await Tone.start();
        if (!synth) {
            synth = new Tone.Synth().toDestination();
            synth.volume.value = -5; // テスト用に少し大きめ
        }
    }

    function playSoundPattern(binaryStr) {
        // パターン: マーカー + 4ビット + 休止
        const totalDuration = (1 + 4) * DURATION + 1.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // 1. 開始合図
            synth.triggerAttackRelease(FREQ_MARKER, DURATION, time);

            // 2. データビット (1111なので全部19000Hzになるはず)
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, DURATION, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;
    }

    startBtn.addEventListener('click', async () => {
        await initAudio();

        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // 画面表示
        otpNumberDisplay.textContent = FIXED_OTP_DISPLAY + " (Fixed)";
        statusMessage.textContent = `テスト送信中: ${FIXED_OTP_BINARY}`;
        statusMessage.style.color = "blue";

        // 音再生 (APIを呼ばずに即再生)
        console.log(`Test Playing: ${FIXED_OTP_BINARY}`);
        playSoundPattern(FIXED_OTP_BINARY);
    });

    stopBtn.addEventListener('click', () => {
        if (sequenceLoop) {
            sequenceLoop.stop();
            sequenceLoop.dispose();
            sequenceLoop = null;
        }
        Tone.Transport.stop();
        isPlaying = false;

        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusMessage.textContent = "待機中";
        otpNumberDisplay.textContent = "----";
    });
});