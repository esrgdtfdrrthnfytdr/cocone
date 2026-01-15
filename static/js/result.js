document.addEventListener('DOMContentLoaded', function() {
    
    // --- ページ遷移ボタン ---
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = 'attendanceFilter.html';
        });
    }

    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            alert('CSVファイルのダウンロードを開始します...');
        });
    }

    // --- モーダル制御 ---
    const modal = document.getElementById('change-status-modal');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    
    // モーダル内の表示要素
    const modalId = document.getElementById('modal-student-id');
    const modalName = document.getElementById('modal-student-name');
    const modalDate = document.getElementById('modal-date');
    const modalPeriod = document.getElementById('modal-period');
    const modalSelect = document.getElementById('modal-status-select');

    // 編集対象を保持する変数
    let currentTargetElement = null;

    // ステータスセル(.status)すべてにクリックイベントを設定
    const statusCells = document.querySelectorAll('.status');
    statusCells.forEach(function(cell) {
        cell.addEventListener('click', function() {
            currentTargetElement = cell;

            // 1. 親の行(tr)から出席番号と氏名を取得
            const row = cell.closest('tr');
            const studentId = row.querySelector('.student-id').textContent;
            const studentName = row.querySelector('.student-name').textContent;

            // 2. 列インデックスから日付を取得
            // .cell-stack の親 td のインデックスを探す
            const cellTd = cell.closest('td');
            const allTds = Array.from(row.children);
            const tdIndex = allTds.indexOf(cellTd);
            
            // ヘッダー行を取得して、同じインデックスのテキスト(日付)を取得
            const headerRow = document.querySelector('.result-table thead tr');
            const targetHeader = headerRow.children[tdIndex];
            const dateText = targetHeader ? targetHeader.textContent : '不明な日付';

            // 3. コマ数を取得 (data-period属性 または 親内でのインデックス)
            let periodText = cell.dataset.period ? cell.dataset.period + 'コマ目' : '不明';
            // data属性がない場合のフォールバック（インデックスから計算）
            if(periodText === '不明') {
                const stack = cell.closest('.cell-stack');
                const indexInStack = Array.from(stack.children).indexOf(cell);
                periodText = (indexInStack + 1) + 'コマ目';
            }

            // 4. モーダルに情報をセット
            modalId.textContent = studentId;
            modalName.textContent = studentName;
            modalDate.textContent = dateText;
            modalPeriod.textContent = periodText;

            // 5. 現在のクラスからセレクトボックスの初期値を推測してセット（簡易実装）
            if (cell.classList.contains('attend')) modalSelect.value = 'attend';
            else if (cell.classList.contains('absent')) modalSelect.value = 'absent';
            else if (cell.classList.contains('late')) modalSelect.value = 'late';
            else if (cell.classList.contains('early')) modalSelect.value = 'early';
            else if (cell.classList.contains('public-abs')) modalSelect.value = 'public-abs';
            else if (cell.classList.contains('special-abs')) modalSelect.value = 'special-abs';
            else modalSelect.value = 'no-data';

            // モーダル表示
            modal.classList.add('active');
        });
    });

    // モーダルを閉じる
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', function() {
            modal.classList.remove('active');
            currentTargetElement = null;
        });
    }

    // 変更を保存（シミュレーション）
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener('click', function() {
            if (currentTargetElement) {
                const selectedValue = modalSelect.value;
                const selectedText = modalSelect.options[modalSelect.selectedIndex].text;

                // クラスを全削除してリセット
                currentTargetElement.className = 'status'; 
                
                // 新しいクラスを追加
                currentTargetElement.classList.add(selectedValue);
                // テキストを変更
                currentTargetElement.textContent = selectedText;

                // モーダルを閉じる
                modal.classList.remove('active');
                
                console.log('ステータスを変更しました:', selectedText);
            }
        });
    }
});