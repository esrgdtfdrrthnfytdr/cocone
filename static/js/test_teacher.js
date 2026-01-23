document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    const otpNumberDisplay = document.getElementById('otp-number');
    const statusMessage = document.getElementById('status-message');

    // ==========================================
    // 1. 音響設定 (無音挿入・波形改善版)
    // ==========================================
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    
    // ★ここがポイント: 枠は0.5秒だが、音は0.4秒しか鳴らさない
    const DURATION    = 0.5;   // 1ビットの持ち時間
    const TONE_LENGTH = 0.4;   // 実際に音が鳴る時間 (0.1秒は無音)

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;

    // 固定OTP設定
    const FIXED_OTP_BINARY = "1111"; 
    const FIXED_OTP_DISPLAY = "15";

    async function initAudio() {
        await Tone.start();
        if (!synth) {
            // ★音色を「正弦波(sine)」にしてノイズを減らす
            synth = new Tone.Synth({
                oscillator: { type: "sine" },
                envelope: {
                    attack: 0.05,  // 少し柔らかく入る
                    decay: 0.1,
                    sustain: 0.8,  // 音量キープ
                    release: 0.05  // すっと消える（無音を作りやすくする）
                }
            }).toDestination();
            synth.volume.value = -5; 
        }
    }

    function playSoundPattern(binaryStr) {
        // 全体の長さ: マーカー + 4ビット + 2.0秒の休止(前回調整分)
        const totalDuration = (1 + 4) * DURATION + 2.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // 1. 開始合図
            // DURATION(0.5)ではなく TONE_LENGTH(0.4) だけ鳴らす
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);

            // 2. データビット
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                
                // 開始時間は DURATION 刻みだが...
                const noteTime = time + ((i + 1) * DURATION);
                
                // 鳴らす長さは TONE_LENGTH (0.4秒) に留める
                synth.triggerAttackRelease(freq, TONE_LENGTH, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;
    }

    // --- 以下、ボタン操作等は変更なし ---
    startBtn.addEventListener('click', async () => {
        await initAudio();
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        otpNumberDisplay.textContent = FIXED_OTP_DISPLAY + " (Fixed)";
        statusMessage.textContent = `テスト送信中: ${FIXED_OTP_BINARY}`;
        statusMessage.style.color = "blue";

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