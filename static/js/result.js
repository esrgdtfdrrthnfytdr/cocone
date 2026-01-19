document.addEventListener('DOMContentLoaded', function() {
    
    // --- ページ遷移ボタン ---
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '/attendanceFilter';
        });
    }

    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            alert('CSVファイルのダウンロードを開始します...');
            // ここにダウンロード処理を実装
        });
    }

    // --- モーダル制御 ---
    const modal = document.getElementById('change-status-modal');
    // 閉じるボタンのIDを変更
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    
    // モーダル内の表示要素
    const modalName = document.getElementById('modal-student-name');
    const modalDate = document.getElementById('modal-date');
    const modalPeriod = document.getElementById('modal-period');
    const modalSelect = document.getElementById('modal-status-select');
    // 備考欄を追加
    const modalNote = document.getElementById('modal-note');

    // 編集対象を保持する変数
    let currentTargetElement = null;

    // ステータスセル(.status)すべてにクリックイベントを設定
    const statusCells = document.querySelectorAll('.status');
    statusCells.forEach(function(cell) {
        cell.addEventListener('click', function() {
            currentTargetElement = cell;

            // 1. 親の行(tr)から氏名を取得
            const row = cell.closest('tr');
            const studentNameEl = row.querySelector('.student-name');
            const studentName = studentNameEl ? studentNameEl.textContent : '';

            // 2. 列インデックスから日付を取得
            const cellTd = cell.closest('td');
            const allTds = Array.from(row.children);
            const tdIndex = allTds.indexOf(cellTd);
            
            // ヘッダー行を取得して、同じインデックスのテキスト(日付)を取得
            const headerRow = document.querySelector('.result-table thead tr');
            // 固定列が2つある前提のインデックス指定
            const targetHeader = headerRow ? headerRow.children[tdIndex] : null;
            const dateText = targetHeader ? targetHeader.textContent : '不明な日付';

            // 3. コマ数を取得
            const periodText = cell.dataset.period ? cell.dataset.period + '限' : '不明';

            // 4. モーダルに情報をセット
            if (modalName) modalName.textContent = studentName;
            if (modalDate) modalDate.textContent = dateText;
            if (modalPeriod) modalPeriod.textContent = periodText;
            // 備考欄をクリア（現状データを持っていないため）
            if (modalNote) modalNote.value = '';

            // 5. 現在のクラスからセレクトボックスの初期値を推測してセット
            if (modalSelect) {
                const statusClasses = ['attend', 'absent', 'late', 'early', 'public-abs', 'special-abs', 'no-data'];
                let currentStatus = 'no-data';
                // クラスリストから該当するステータスを探す
                statusClasses.forEach(cls => {
                    if (cell.classList.contains(cls)) {
                        currentStatus = cls;
                    }
                });
                modalSelect.value = currentStatus;
            }

            // モーダル表示
            if (modal) modal.classList.add('active');
        });
    });

    // モーダルを閉じる関数
    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            currentTargetElement = null;
        }
    }

    // 閉じるボタンで閉じる
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }

    // 背景クリックで閉じる
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // 変更を保存（画面表示のみ更新）
    if (modalSaveBtn && modal) {
        modalSaveBtn.addEventListener('click', function() {
            if (currentTargetElement && modalSelect) {
                const selectedValue = modalSelect.value;
                const selectedText = modalSelect.options[modalSelect.selectedIndex].text;
                const noteValue = modalNote ? modalNote.value : ''; // 備考の値を取得

                // クラスを全削除してリセット
                currentTargetElement.className = 'status'; 
                
                // 新しいクラスを追加
                currentTargetElement.classList.add(selectedValue);
                // テキストを変更
                currentTargetElement.textContent = selectedText;
                
                // 備考は現状画面には反映しませんが、取得はできています
                console.log(`保存: ステータス=${selectedText}, 備考=${noteValue}`);

                // ここでサーバーに保存する処理を実装する想定

                // モーダルを閉じる
                closeModal();
            }
        });
    }
});