document.addEventListener('DOMContentLoaded', function() {
    
    // IDでの取得に変更はありませんが、念のため確認
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const classSelect = document.getElementById('class-select');
    
    const formArea = document.querySelector('.form-area');
    const activeStatus = document.getElementById('active-status');
    const errorMsgArea = document.getElementById('register-error-msg');

    function showError(msg) {
        if (errorMsgArea) {
            errorMsgArea.textContent = msg;
            errorMsgArea.style.display = 'block';
        }
    }

    function clearError() {
        if (errorMsgArea) {
            errorMsgArea.textContent = '';
            errorMsgArea.style.display = 'none';
        }
    }

    if (classSelect) {
        classSelect.addEventListener('change', clearError);
    }

    // --- 出席開始ボタン ---
    if (startBtn) {
        startBtn.addEventListener('click', function() {
            clearError();

            const selectedClass = classSelect ? classSelect.value : '';

            // 科目バリデーションは削除済み。クラスのみチェック。
            if (!selectedClass) {
                showError('※ クラスを選択してください');
                return;
            }

            // 発信開始処理（デモ）
            // フォームを隠して、発信中ステータスを表示
            formArea.style.display = 'none';
            activeStatus.style.display = 'flex';
        });
    }

    // --- 終了ボタン ---
    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            if (confirm('出席登録を終了しますか？')) {
                // 元に戻す
                activeStatus.style.display = 'none';
                formArea.style.display = 'flex';
                
                alert('出席登録を終了しました。');
            }
        });
    }
});