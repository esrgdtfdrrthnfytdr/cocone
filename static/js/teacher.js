let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let osc = null;
let isScanning = false;

// 設定
const BGM_URL = '/static/sounds/bgm.wav'; 
const FREQ_START = 21000;
const FREQ_1 = 20000;
const FREQ_0 = 19000;
const BIT_DURATION = 1.0;

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

// 新しいUIのID (submit-btn) を使用
const submitBtn = document.getElementById('submit-btn');
const classSelect = document.getElementById('class-select');
const errorMessage = document.getElementById('error-message');

if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        if (isScanning) {
            stopSound();
            return;
        }
        
        const selectedValue = classSelect.value;
        if (!selectedValue) {
            if(errorMessage) {
                errorMessage.textContent = 'クラスを選択してください';
                errorMessage.classList.add('show');
            }
            return;
        }
        if(errorMessage) {
            errorMessage.textContent = '';
            errorMessage.classList.remove('show');
        }

        // iOS対策: ユーザー操作でAudioContext再開
        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        // 1. OTP取得
        try {
            const res = await fetch('/api/generate_otp', { method: 'POST' });
            const data = await res.json();
            
            // 2. UI更新 & 再生
            startScanningUI();
            playMixedSound(data.otp_binary);
        } catch(e) {
            alert("通信エラー");
        }
    });
}

function startScanningUI() {
    isScanning = true;
    submitBtn.textContent = '停止する';
    submitBtn.classList.add('is-processing'); // 波紋アニメーション開始
    if(classSelect) classSelect.disabled = true;
}

function stopScanningUI() {
    isScanning = false;
    submitBtn.textContent = '出席確認';
    submitBtn.classList.remove('is-processing');
    if(classSelect) classSelect.disabled = false;
}

function playMixedSound(binaryStr) {
    if (!bgmBuffer) return;

    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    const bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.4;
    bgmSource.connect(bgmGain);
    bgmGain.connect(audioCtx.destination);

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    oscGain.gain.value = 0.1;
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

    bgmSource.start(startTime);
    osc.start(startTime);

    osc.stop(endTime);
    bgmSource.stop(endTime + 5.0);
    
    osc.onended = () => {
        setTimeout(() => stopSound(), 5000);
    };
}

function stopSound() {
    if(osc) { try{ osc.stop(); }catch(e){} osc = null; }
    if(bgmSource) { try{ bgmSource.stop(); }catch(e){} bgmSource = null; }
    stopScanningUI();
}