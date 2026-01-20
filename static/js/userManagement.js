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
        deleteBtn.addEventListener('click', async function() {
            clearPageError();

            const checkedBoxes = Array.from(document.querySelectorAll('.user-checkbox:checked'))
                                      .filter(cb => cb.closest('tr').style.display !== 'none');
            
            const targetCount = checkedBoxes.length;

            if (targetCount === 0) {
                showPageError('※ 削除するユーザーを選択してください');
                return;
            }
            
            if (!confirm(`${targetCount} 件のユーザーを削除しますか？`)) return;

            try {
                const studentNumbers = checkedBoxes.map(cb => cb.value);
                const res = await fetch('/api/delete_users', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({student_numbers: studentNumbers})
                });
                const data = await res.json();

                if (data.status === 'success') {
                    alert('削除しました');
                    location.reload();
                } else {
                    alert('削除失敗: ' + (data.message || '不明なエラー'));
                }
            } catch (e) {
                console.error(e);
                alert('通信エラーが発生しました');
            }
        });
    }

    // =========================================
    // ユーザー追加モーダル制御
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
        modalAddBtn.addEventListener('click', async function() {
            clearModalError();

            // 値の取得
            const idVal = inputStudentId.value.trim();
            const nameVal = inputName.value.trim();
            const emailVal = inputEmail.value.trim();
            const passVal = inputPassword.value.trim();

            const classSelect = document.getElementById('new-class');
            const numberSelect = document.getElementById('new-number');
            const classVal = classSelect ? classSelect.value : '';
            const numberVal = numberSelect ? numberSelect.value : '';

            let hasEmptyError = false;
            let regexErrorMessage = '';

            // 1. 未入力チェック
            if (!idVal) { inputStudentId.classList.add('input-error'); hasEmptyError = true; }
            if (!nameVal) { inputName.classList.add('input-error'); hasEmptyError = true; }
            if (!emailVal) { inputEmail.classList.add('input-error'); hasEmptyError = true; }
            if (!passVal) { inputPassword.classList.add('input-error'); hasEmptyError = true; }
            if (!classVal) { if(classSelect) classSelect.classList.add('input-error'); hasEmptyError = true; }
            if (!numberVal) { if(numberSelect) numberSelect.classList.add('input-error'); hasEmptyError = true; }

            if (hasEmptyError) {
                modalErrorArea.textContent = '※ 必須項目を入力してください';
                return;
            }

            // 2. 正規表現チェック
            // 学籍番号: s + 4桁(西暦) + 4桁(連番) = 9文字 (例: s20250001)
            const idRegex = /^s\d{8}$/;
            if (!idRegex.test(idVal)) {
                inputStudentId.classList.add('input-error');
                regexErrorMessage = '※ 学籍番号は"s"で始まる半角数字8桁(計9文字)で入力してください (例: s20250001)';
            }
            
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(emailVal) && !regexErrorMessage) {
                inputEmail.classList.add('input-error');
                regexErrorMessage = '※ 正しいメールアドレスの形式で入力してください';
            }

            if (regexErrorMessage) {
                modalErrorArea.textContent = regexErrorMessage;
                return;
            }

            // API送信
            try {
                const res = await fetch('/api/add_user', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        student_number: idVal,
                        name: nameVal,
                        email: emailVal,
                        password: passVal,
                        class_name: classVal,
                        attendance_no: parseInt(numberVal)
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    alert(`${nameVal} を追加しました`);
                    location.reload();
                } else {
                    modalErrorArea.textContent = data.message || '登録に失敗しました';
                }
            } catch (e) {
                console.error(e);
                modalErrorArea.textContent = '通信エラーが発生しました';
            }
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
        const classSelect = document.getElementById('new-class');
        if (classSelect) classSelect.classList.remove('input-error');
        const numberSelect = document.getElementById('new-number');
        if (numberSelect) numberSelect.classList.remove('input-error');
    }
    function clearInputs() {
        modalInputs.forEach(input => { if(input) input.value = ''; });
    }
});