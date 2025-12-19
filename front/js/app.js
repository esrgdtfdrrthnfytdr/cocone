document.addEventListener('DOMContentLoaded', function() {
    
    // ============================================
    // 1. 【教員用】出席確認ボタンの処理
    // ============================================
    const submitBtn = document.getElementById('submit-btn');
    const classSelect = document.getElementById('class-select');
    const errorMessage = document.getElementById('error-message');
    
    let isScanning = false;

    if(submitBtn) {
        // --- 教員用ロジック ---
        submitBtn.addEventListener('click', function() {
            if (isScanning) {
                stopScanning();
                return;
            }
            const selectedValue = classSelect.value;
            if (!selectedValue) {
                showError('クラスを選択してください');
                return;
            }
            clearError();
            startScanning(selectedValue);
        });
    }

    function startScanning(className) {
        isScanning = true;
        submitBtn.textContent = '確認中...';
        submitBtn.classList.add('is-processing'); // 外側に広がる波 (teacher.cssで定義)
        classSelect.disabled = true;
        console.log(`「${className}」の出席確認を開始しました`);
    }

    function stopScanning() {
        isScanning = false;
        submitBtn.textContent = '出席確認';
        submitBtn.classList.remove('is-processing');
        classSelect.disabled = false;
        console.log('出席確認を停止しました');
    }

    function showError(msg) {
        if(errorMessage) {
            errorMessage.textContent = msg;
            errorMessage.classList.add('show');
        }
    }

    function clearError() {
        if(errorMessage) {
            errorMessage.textContent = '';
            errorMessage.classList.remove('show');
        }
    }


    // ============================================
    // 2. 【学生用】出席登録ボタンの処理
    // ============================================
    const registerBtn = document.getElementById('register-btn');
    const modal = document.getElementById('completion-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    if (registerBtn) {
        // --- 学生用ロジック ---
        registerBtn.addEventListener('click', function() {
            // 既に処理中なら何もしない
            if (registerBtn.classList.contains('is-processing')) return;

            // 1. ボタンを「受信中」状態にする
            const originalText = registerBtn.textContent;
            registerBtn.textContent = '登録中...';
            registerBtn.classList.add('is-processing'); // 内側に収束する波 (student.cssで定義)

            // 2. サーバー通信のシミュレーション (2秒待機)
            setTimeout(function() {
                
                // 3. モーダルを表示
                modal.classList.add('active');

                // 4. ボタンの状態を元に戻す
                registerBtn.textContent = originalText;
                registerBtn.classList.remove('is-processing');

            }, 2000);
        });
    }

    // モーダルを閉じる処理
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', function() {
            modal.classList.remove('active');
        });
    }
});