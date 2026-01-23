document.addEventListener('DOMContentLoaded', () => {
    // UI要素
    const startBtn = document.getElementById('submit-btn');      
    const volSlider = document.getElementById('signal-volume');  
    const volDisplay = document.getElementById('vol-display');   
    const bgmBtn = document.getElementById('bgm-toggle-btn');    
    const statusArea = document.getElementById('status-area');   

    // === 音響設定 ===
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    
    // 1ビットの時間枠(0.5s)に対し、発音は0.4s、休止0.1s (RZ方式)
    const DURATION    = 0.5;   
    const TONE_LENGTH = 0.4;   

    // テスト用固定値 (0000を送る設定のまま)
    const FIXED_OTP_BINARY = "0000"; 

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;
    let bgmPlayer = null;
    let isBgmOn = true; 

    async function initAudio() {
        await Tone.start();

        if (!synth) {
            synth = new Tone.Synth({
                oscillator: { type: "sine" }, // ノイズの少ない正弦波
                envelope: {
                    attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.05
                }
            }).toDestination();
            updateVolume(volSlider.value);
        }

        if (!bgmPlayer) {
            bgmPlayer = new Tone.Player({
                url: "/static/sounds/bgm.wav", 
                loop: true, volume: -15
            }).toDestination();
        }
    }

    function updateVolume(val) {
        if (!synth) return;
        if (val <= 0) synth.volume.value = -100; 
        else synth.volume.rampTo(20 * Math.log10(val), 0.1);
        if (volDisplay) volDisplay.textContent = val;
    }

    function playSoundPattern(binaryStr) {
        const totalDuration = (1 + 4) * DURATION + 2.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // Start
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);

            // Bits
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, TONE_LENGTH, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;
        if (isBgmOn && bgmPlayer && bgmPlayer.loaded) bgmPlayer.start();
    }

    // イベントリスナー
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            if (isPlaying) {
                stopAttendance();
                return;
            }
            try {
                await initAudio();
                startBtn.textContent = "停止";
                startBtn.style.backgroundColor = "#ff6b6b"; 
                if (statusArea) statusArea.textContent = `送信中: ${FIXED_OTP_BINARY}`;
                playSoundPattern(FIXED_OTP_BINARY);
            } catch (e) {
                alert("Audio Error: " + e);
            }
        });
    }

    if (volSlider) volSlider.addEventListener('input', (e) => updateVolume(e.target.value));
    
    if (bgmBtn) {
        bgmBtn.addEventListener('click', async () => {
            await initAudio(); 
            isBgmOn = !isBgmOn;
            if (isBgmOn) {
                bgmBtn.textContent = "🎵 BGM: ON";
                bgmBtn.style.backgroundColor = "#63D2B0";
                if (isPlaying && bgmPlayer && bgmPlayer.loaded) bgmPlayer.start();
            } else {
                bgmBtn.textContent = "🎵 BGM: OFF";
                bgmBtn.style.backgroundColor = "#95A5A6"; 
                if (bgmPlayer) bgmPlayer.stop();
            }
        });
    }

    function stopAttendance() {
        if (sequenceLoop) { sequenceLoop.stop(); sequenceLoop.dispose(); sequenceLoop = null; }
        if (bgmPlayer) bgmPlayer.stop();
        Tone.Transport.stop();
        isPlaying = false;
        startBtn.textContent = "出席確認";
        startBtn.style.backgroundColor = ""; 
        if (statusArea) statusArea.textContent = "待機中";
    }
});