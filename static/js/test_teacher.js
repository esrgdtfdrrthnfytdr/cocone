let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let bgmGainNode = null;
let osc = null;
let isScanning = false;
let nextSignalTimer = null;
let isBgmOn = true;

// 設定
const BGM_URL = '/static/sounds/bgm.wav'; 

// 周波数設定
const FREQ_START = 19000; 
const FREQ_1 = 18500;     
const FREQ_0 = 19500;     

const BIT_DURATION = 1.0;
const LOOP_GAP_SEC = 2.0;
const BGM_VOLUME = 0.4;


// UI要素
const submitBtn = document.getElementById('submit-btn');
// const courseSelect = document.getElementById('course-select');
const errorMessage = document.getElementById('error-message');
const volSlider = document.getElementById('signal-volume');
// const volDisplay = document.getElementById('vol-display');
const bgmToggleBtn = document.getElementById('bgm-toggle-btn');

// スライダーの表示更新
if (volSlider && volDisplay) {
    volSlider.addEventListener('input', (e) => {
        volDisplay.textContent = e.target.value;
    });
}

// BGM切り替えボタン
if (bgmToggleBtn) {
    bgmToggleBtn.addEventListener('click', () => {
        isBgmOn = !isBgmOn;
        if (isBgmOn) {
            bgmToggleBtn.textContent = "🎵 BGM: ON";
            bgmToggleBtn.style.backgroundColor = "#63D2B0";
            bgmToggleBtn.style.opacity = "1";
        } else {
            bgmToggleBtn.textContent = "🔇 BGM: OFF";
            bgmToggleBtn.style.backgroundColor = "#95A5A6";
        }
        if (bgmGainNode) {
            bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;
        }
    });
}

// BGM読み込み
window.addEventListener('load', async () => {
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        
        const response = await fetch(BGM_URL);
        const arrayBuffer = await response.arrayBuffer();
        bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        console.log("BGM Ready");
    } catch (e) {
        console.error("BGM Load Error:", e);
    }
});



if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        if (isScanning) {
            stopSound();
            return;
        }

//         // 科目が選択されているかチェック
//         const selectedValue = courseSelect ? courseSelect.value : null;
//         if (!selectedValue) {
//             if(errorMessage) {
//                 errorMessage.textContent = '科目を選択してください';
//                 errorMessage.classList.add('show');
//             }
//             return;
//         }

        if(errorMessage) {
            errorMessage.textContent = '';
            errorMessage.classList.remove('show');
        }

        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        try {
            // APIへPOST送信 (course_id を含める)
            const res = await fetch('/api/generate_otp', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})  //空データ
                // body: JSON.stringify({ course_id: parseInt(selectedValue) })コースID
            });
            
            if (!res.ok) {
                throw new Error("Server Response Error");
            }

            const data = await res.json();
            
            startScanningUI();
            playMixedSoundLoop(data.otp_binary);
        } catch(e) {
            console.error(e);
            alert("通信エラーが発生しました");
        }
    });
}

function playSoundPattern(binaryStr) {
    const totalDuration = (5 * DURATION) + 0.6; 

    sequenceLoop = new Tone.Loop((time) => {
        // 1. 開始マーカー再生
        synth.triggerAttackRelease(FREQ_MARKER, DURATION, time);

        // 2. データビット再生
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

function startScanningUI() {
    isScanning = true;
    submitBtn.textContent = '停止する';
    submitBtn.classList.add('is-processing');
    if(courseSelect) courseSelect.disabled = true;
}

function stopScanningUI() {
    isScanning = false;
    submitBtn.textContent = '出席確認';
    submitBtn.classList.remove('is-processing');
    if(courseSelect) courseSelect.disabled = false;
}

function playMixedSoundLoop(binaryStr) {
    if (!bgmBuffer) return;

    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;
    
    bgmSource.connect(bgmGainNode);
    bgmGainNode.connect(audioCtx.destination);
    bgmSource.start(0);

    playSignalRecursive(binaryStr);
}

function playSignalRecursive(binaryStr) {
    if (!isScanning) return;

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    
    const currentVol = volSlider ? parseFloat(volSlider.value) : 0.1;
    oscGain.gain.value = currentVol; 
    
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;



    osc.frequency.setValueAtTime(FREQ_START, startTime);
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        osc.frequency.setValueAtTime((bit === '1' ? FREQ_1 : FREQ_0), time);
    }


    const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
    const endTime = startTime + totalDuration;



    osc.start(startTime);
    osc.stop(endTime);
    
    osc.onended = () => {
        osc = null;
        if (isScanning) {
            nextSignalTimer = setTimeout(() => {
                playSignalRecursive(binaryStr);
            }, LOOP_GAP_SEC * 1000);
        }
    };
}

function stopSound() {
    isScanning = false;
    if (nextSignalTimer) {
        clearTimeout(nextSignalTimer);
        nextSignalTimer = null;



    }
    if(osc) { try{ osc.stop(); }catch(e){} osc = null; }
    if(bgmSource) { try{ bgmSource.stop(); }catch(e){} bgmSource = null; }
    
    bgmGainNode = null;
    stopScanningUI();
}