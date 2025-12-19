let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let osc = null;
let isScanning = false;
let nextSignalTimer = null; // ループ待機用のタイマー

// 設定
const BGM_URL = '/static/sounds/bgm.wav'; 
const FREQ_START = 21000;
const FREQ_1 = 20000;
const FREQ_0 = 19000;
const BIT_DURATION = 1.0;
const LOOP_GAP_SEC = 2.0; // 信号と信号の間の休憩時間(秒)

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

const submitBtn = document.getElementById('submit-btn');
const classSelect = document.getElementById('class-select');
const errorMessage = document.getElementById('error-message');

if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        // 送信中なら停止処理へ
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
            
            // 2. UI更新 & ループ再生開始
            startScanningUI();
            playMixedSoundLoop(data.otp_binary); // ループ再生関数へ
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

// BGMを流し始め、信号ループを開始する関数
function playMixedSoundLoop(binaryStr) {
    if (!bgmBuffer) return;

    // --- A. BGM再生 (流しっぱなし) ---
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true; // BGMはずっとループ
    const bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.4;
    bgmSource.connect(bgmGain);
    bgmGain.connect(audioCtx.destination);
    bgmSource.start(0);

    // --- B. 信号ループ開始 ---
    playSignalRecursive(binaryStr);
}

// 信号を1回再生し、終わったら次を予約する関数 (再帰)
function playSignalRecursive(binaryStr) {
    // 停止ボタンが押されていたら何もしないで終了
    if (!isScanning) return;

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    oscGain.gain.value = 0.1;
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;

    // 1. スタート信号 (21kHz)
    osc.frequency.setValueAtTime(FREQ_START, startTime);

    // 2. データ信号 (20kHz / 19kHz)
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        osc.frequency.setValueAtTime((bit === '1' ? FREQ_1 : FREQ_0), time);
    }

    // 終了時間を計算
    const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
    const endTime = startTime + totalDuration;

    osc.start(startTime);
    osc.stop(endTime);
    
    // 再生が終わったら...
    osc.onended = () => {
        osc = null; // クリア
        if (isScanning) {
            // まだ送信中なら、2秒待ってから自分自身をもう一度呼ぶ
            console.log(`Loop: Waiting ${LOOP_GAP_SEC}s...`);
            nextSignalTimer = setTimeout(() => {
                playSignalRecursive(binaryStr);
            }, LOOP_GAP_SEC * 1000);
        }
    };
}

// 完全停止処理
function stopSound() {
    isScanning = false; // フラグを下ろす

    // 1. 次回の予約があればキャンセル
    if (nextSignalTimer) {
        clearTimeout(nextSignalTimer);
        nextSignalTimer = null;
    }

    // 2. 現在鳴っている超音波を停止
    if(osc) { 
        try{ osc.stop(); }catch(e){} 
        osc = null; 
    }

    // 3. BGMを停止
    if(bgmSource) { 
        try{ bgmSource.stop(); }catch(e){} 
        bgmSource = null; 
    }

    stopScanningUI();
}