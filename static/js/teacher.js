let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let bgmGainNode = null; // ★追加: BGMの音量制御用ノード
let osc = null;
let isScanning = false;
let nextSignalTimer = null;
let isBgmOn = true; // ★追加: BGMの状態フラグ

// 設定
const BGM_URL = '/static/sounds/bgm.wav'; 

// 周波数はiPhone対策版のまま
const FREQ_START = 19000; 
const FREQ_1 = 18000;     
const FREQ_0 = 17000;     

const BIT_DURATION = 1.0;
const LOOP_GAP_SEC = 2.0;
const BGM_VOLUME = 0.4; // BGMの標準音量

// UI要素
const submitBtn = document.getElementById('submit-btn');
const classSelect = document.getElementById('class-select');
const errorMessage = document.getElementById('error-message');
const volSlider = document.getElementById('signal-volume');
const volDisplay = document.getElementById('vol-display');
const bgmToggleBtn = document.getElementById('bgm-toggle-btn'); // ★追加

// スライダーの表示更新
if (volSlider && volDisplay) {
    volSlider.addEventListener('input', (e) => {
        volDisplay.textContent = e.target.value;
    });
}

// ★追加: BGM切り替えボタンの動作
if (bgmToggleBtn) {
    bgmToggleBtn.addEventListener('click', () => {
        isBgmOn = !isBgmOn; // フラグ反転

        // ボタンの見た目更新
        if (isBgmOn) {
            bgmToggleBtn.textContent = "🎵 BGM: ON";
            bgmToggleBtn.style.backgroundColor = "#63D2B0"; // 緑
            bgmToggleBtn.style.opacity = "1";
        } else {
            bgmToggleBtn.textContent = "🔇 BGM: OFF";
            bgmToggleBtn.style.backgroundColor = "#95A5A6"; // グレー
        }

        // 再生中ならリアルタイムに音量を変更
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

        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        try {
            const res = await fetch('/api/generate_otp', { method: 'POST' });
            const data = await res.json();
            
            startScanningUI();
            playMixedSoundLoop(data.otp_binary);
        } catch(e) {
            alert("通信エラー");
        }
    });
}

function startScanningUI() {
    isScanning = true;
    submitBtn.textContent = '停止する';
    submitBtn.classList.add('is-processing');
    if(classSelect) classSelect.disabled = true;
}

function stopScanningUI() {
    isScanning = false;
    submitBtn.textContent = '出席確認';
    submitBtn.classList.remove('is-processing');
    if(classSelect) classSelect.disabled = false;
}

function playMixedSoundLoop(binaryStr) {
    if (!bgmBuffer) return;

    // BGM再生
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    
    // GainNodeを作成してグローバル変数に保存
    bgmGainNode = audioCtx.createGain();
    // 現在のON/OFF設定に合わせて音量をセット
    bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;
    
    bgmSource.connect(bgmGainNode);
    bgmGainNode.connect(audioCtx.destination);
    bgmSource.start(0);

    // 信号ループ開始
    playSignalRecursive(binaryStr);
}

function playSignalRecursive(binaryStr) {
    if (!isScanning) return;

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    
    // スライダーの値を取得して適用
    const currentVol = volSlider ? parseFloat(volSlider.value) : 0.1;
    oscGain.gain.value = currentVol; 
    
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;

    // 信号生成
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
    
    bgmGainNode = null; // リセット
    stopScanningUI();
}