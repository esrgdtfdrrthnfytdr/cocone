document.addEventListener('DOMContentLoaded', function() {
    
    // --- フィルタリング機能 ---
    const classFilter = document.getElementById('class-filter');
    const yearFilter = document.getElementById('year-filter');
    const tableRows = document.querySelectorAll('.user-table tbody tr');

    function filterTable() {
        const selectedClass = classFilter ? classFilter.value : '';
        const selectedYear = yearFilter ? yearFilter.value : '';

        tableRows.forEach(row => {
            const rowClass = row.children[4].textContent.trim();
            const rowYear = row.children[6].textContent.trim();
            const isClassMatch = (selectedClass === '') || (rowClass === selectedClass);
            const isYearMatch = (selectedYear === '') || (rowYear === selectedYear);

            if (isClassMatch && isYearMatch) {
                row.style.display = ''; 
            } else {
                row.style.display = 'none'; 
            }
        });
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        
        clearPageError(); // フィルタ変更時もエラークリア
    }
    if (classFilter) classFilter.addEventListener('change', filterTable);
    if (yearFilter) yearFilter.addEventListener('change', filterTable);

    // --- チェックボックス制御 ---
    const selectAllCheckbox = document.getElementById('select-all');
    const userCheckboxes = document.querySelectorAll('.user-checkbox');

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            userCheckboxes.forEach(function(checkbox) {
                const row = checkbox.closest('tr');
                if (row.style.display !== 'none') checkbox.checked = isChecked;
            });
            clearPageError();
        });
    }

    userCheckboxes.forEach(function(checkbox) {
        checkbox.addEventListener('change', function() {
            clearPageError();
            if (!this.checked) {
                selectAllCheckbox.checked = false;
            } else {
                const visibleCheckboxes = Array.from(userCheckboxes).filter(cb => cb.closest('tr').style.display !== 'none');
                const allVisibleChecked = visibleCheckboxes.every(cb => cb.checked);
                if (allVisibleChecked && visibleCheckboxes.length > 0) selectAllCheckbox.checked = true;
            }
        });
    });

    // --- ページ全体のエラー表示 ---
    const pageErrorArea = document.getElementById('management-error-msg');
    function showPageError(msg) {
        if (pageErrorArea) pageErrorArea.textContent = msg;
    }
    function clearPageError() {
        if (pageErrorArea) pageErrorArea.textContent = '';
    }

    // --- 削除ボタン ---
    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            clearPageError();

            const checkedBoxes = Array.from(document.querySelectorAll('.user-checkbox:checked'))
                                      .filter(cb => cb.closest('tr').style.display !== 'none');
            
            const targetCount = checkedBoxes.length;

            if (targetCount === 0) {
                showPageError('※ 削除するユーザーを選択してください');
                return;
            }
            
            if (confirm(`${targetCount} 件のユーザーを削除しますか？\n(デモ機能)`)) {
                checkedBoxes.forEach(cb => {
                    cb.closest('tr').remove();
                });
                alert('削除しました。(デモ)');
                if (selectAllCheckbox) selectAllCheckbox.checked = false;
            }
        });
    }

    // =========================================
    // ユーザー追加モーダル制御 (正規表現チェック追加)
    // =========================================
    const addBtn = document.getElementById('add-btn');
    const addModal = document.getElementById('add-user-modal');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalAddBtn = document.getElementById('modal-add-btn');
    const autoPassBtn = document.getElementById('auto-pass-btn');
    const modalErrorArea = document.getElementById('modal-error-msg');

    // 入力フォーム要素
    const inputStudentId = document.getElementById('new-student-id');
    const inputName = document.getElementById('new-name');
    const inputEmail = document.getElementById('new-email');
    const inputPassword = document.getElementById('new-password');

    // モーダル表示
    if (addBtn && addModal) {
        addBtn.addEventListener('click', function() {
            addModal.classList.add('active');
            clearModalError();
            clearInputs();
        });
    }
    // モーダル非表示
    if (modalCancelBtn && addModal) {
        modalCancelBtn.addEventListener('click', function() {
            addModal.classList.remove('active');
        });
    }

    // 追加実行
    if (modalAddBtn && addModal) {
        modalAddBtn.addEventListener('click', function() {
            clearModalError();

            // 値の取得
            const idVal = inputStudentId.value.trim();
            const nameVal = inputName.value.trim();
            const emailVal = inputEmail.value.trim();
            const passVal = inputPassword.value.trim();

            let hasEmptyError = false;
            let regexErrorMessage = '';

            // 1. 未入力チェック (最優先)
            if (!idVal) { inputStudentId.classList.add('input-error'); hasEmptyError = true; }
            if (!nameVal) { inputName.classList.add('input-error'); hasEmptyError = true; }
            if (!emailVal) { inputEmail.classList.add('input-error'); hasEmptyError = true; }
            if (!passVal) { inputPassword.classList.add('input-error'); hasEmptyError = true; }

            if (hasEmptyError) {
                modalErrorArea.textContent = '※ 必須項目を入力してください';
                return;
            }

            // 2. 正規表現チェック (入力がある場合のみ)
            
            // 学籍番号: 8桁の半角数字 (^\d{8}$)
            const idRegex = /^\d{8}$/;
            if (!idRegex.test(idVal)) {
                inputStudentId.classList.add('input-error');
                regexErrorMessage = '※ 学籍番号は8桁の半角数字で入力してください';
            }
            
            // メールアドレス: 簡易的な形式チェック (例: 文字@文字.文字)
            // より厳密なRegex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(emailVal) && !regexErrorMessage) {
                inputEmail.classList.add('input-error');
                // 学籍番号エラーがなければメールエラーを表示
                regexErrorMessage = '※ 正しいメールアドレスの形式で入力してください';
            }

            if (regexErrorMessage) {
                modalErrorArea.textContent = regexErrorMessage;
                return;
            }

            // 成功時
            alert(`${nameVal} を追加しました。\n(デモ機能)`);
            addModal.classList.remove('active');
        });
    }

    // 自動パスワード
    if (autoPassBtn && inputPassword) {
        autoPassBtn.addEventListener('click', function() {
            inputPassword.value = Math.random().toString(36).slice(-8);
            inputPassword.classList.remove('input-error');
        });
    }

    // 入力時にエラー解除
    const modalInputs = [inputStudentId, inputName, inputEmail, inputPassword];
    modalInputs.forEach(input => {
        if(input) {
            input.addEventListener('input', function() {
                this.classList.remove('input-error');
                if (modalErrorArea) modalErrorArea.textContent = '';
            });
        }
    });

    function clearModalError() {
        if (modalErrorArea) modalErrorArea.textContent = '';
        modalInputs.forEach(input => {
            if(input) input.classList.remove('input-error');
        });
    }
    function clearInputs() {
        modalInputs.forEach(input => { if(input) input.value = ''; });
    }
});