document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. HTMLの要素を取得
    // ==========================================
    const startBtn = document.getElementById('submit-btn');      
    const volSlider = document.getElementById('signal-volume');  
    const volDisplay = document.getElementById('vol-display');   
    const bgmBtn = document.getElementById('bgm-toggle-btn');    
    const statusArea = document.getElementById('status-area');   

    // ==========================================
    // 2. 音響設定 (Tone.js)
    // ==========================================
    const FREQ_MARKER = 17000; 
    const FREQ_BIT_0  = 18000; 
    const FREQ_BIT_1  = 19000; 
    const DURATION    = 0.5;   
    const TONE_LENGTH = 0.4;   

    // ★変更点: 送信パターンを "0000" に変更
    const FIXED_OTP_BINARY = "0000"; 

    let isPlaying = false;
    let sequenceLoop = null;
    let synth = null;
    let bgmPlayer = null;
    let isBgmOn = true; 

    // 音響初期化
    async function initAudio() {
        await Tone.start();

        if (!synth) {
            synth = new Tone.Synth({
                oscillator: { type: "sine" }, 
                envelope: {
                    attack: 0.05,
                    decay: 0.1,
                    sustain: 0.8,
                    release: 0.05
                }
            }).toDestination();
            
            updateVolume(volSlider.value);
        }

        if (!bgmPlayer) {
            bgmPlayer = new Tone.Player({
                url: "/static/sounds/bgm.wav", 
                loop: true,
                volume: -15, 
                onload: () => { console.log("BGM Loaded"); }
            }).toDestination();
        }
    }

    function updateVolume(val) {
        if (!synth) return;
        if (val <= 0) {
            synth.volume.value = -100; 
        } else {
            const db = 20 * Math.log10(val);
            synth.volume.rampTo(db, 0.1);
        }
        if (volDisplay) volDisplay.textContent = val;
    }

    function playSoundPattern(binaryStr) {
        const totalDuration = (1 + 4) * DURATION + 2.0; 

        sequenceLoop = new Tone.Loop((time) => {
            // 1. 開始合図
            synth.triggerAttackRelease(FREQ_MARKER, TONE_LENGTH, time);

            // 2. データビット
            for (let i = 0; i < 4; i++) {
                const bit = binaryStr[i];
                const freq = (bit === '1') ? FREQ_BIT_1 : FREQ_BIT_0;
                const noteTime = time + ((i + 1) * DURATION);
                synth.triggerAttackRelease(freq, TONE_LENGTH, noteTime);
            }
        }, totalDuration).start(0);

        Tone.Transport.start();
        isPlaying = true;

        if (isBgmOn && bgmPlayer && bgmPlayer.loaded) {
            bgmPlayer.start();
        }
    }

    // ==========================================
    // 3. イベント設定
    // ==========================================
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
                console.log(`Test Playing: ${FIXED_OTP_BINARY}`);
                playSoundPattern(FIXED_OTP_BINARY);
            } catch (e) {
                alert("オーディオエラー: " + e);
            }
        });
    }

    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
            updateVolume(e.target.value);
        });
    }

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
        if (sequenceLoop) {
            sequenceLoop.stop();
            sequenceLoop.dispose();
            sequenceLoop = null;
        }
        if (bgmPlayer) {
            bgmPlayer.stop();
        }
        Tone.Transport.stop();
        isPlaying = false;

        startBtn.textContent = "出席確認";
        startBtn.style.backgroundColor = ""; 
        if (statusArea) statusArea.textContent = "待機中";
    }
});