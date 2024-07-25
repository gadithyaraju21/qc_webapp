document.addEventListener('DOMContentLoaded', function() {
    checkAuth().then((userInfo) => {
        fetchUsers();
        setupEventListeners();
    }).catch((error) => {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    });
});

function setupEventListeners() {
    document.getElementById('addUserBtn').addEventListener('click', openAddUserModal);
    document.querySelectorAll('.modal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => closeModal(closeBtn.closest('.modal').id));
    });
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target.id);
        }
    };
    document.getElementById('addUserForm').addEventListener('submit', addUser);
    document.getElementById('editUserForm').addEventListener('submit', updateUser);
}

async function fetchUsers() {
    try {
        const response = await fetchWithAuth('/admin/users');
        const users = await response.json();
        displayUsers(users.filter(user => user.username !== 'admin'));
    } catch (error) {
        console.error('Error fetching users:', error);
        showFeedback('Failed to fetch users. Please try again.', 'error');
    }
}

function displayUsers(users) {
    const userTableBody = document.querySelector('#userTable tbody');
    userTableBody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>
                <button onclick="openEditUserModal('${user.username}')" class="btn btn-primary">
                    <span class="material-icons">edit</span> Edit
                </button>
            </td>
        `;
        userTableBody.appendChild(row);
    });
}

function openAddUserModal() {
    document.getElementById('addUserModal').style.display = 'block';
}

function openEditUserModal(username) {
    if (username === 'admin') {
        showFeedback('Cannot edit admin user', 'error');
        return;
    }
    const modal = document.getElementById('editUserModal');
    document.getElementById('editModalTitle').textContent = `Edit User: ${username}`;
    document.getElementById('editUsername').value = username;
    document.getElementById('resetPasswordBtn').onclick = () => promptNewPassword(username);
    document.getElementById('deleteUserBtn').onclick = () => deleteUser(username);
    modal.style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function addUser(event) {
    event.preventDefault();
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;

    if (username.toLowerCase() === 'admin') {
        showFeedback('Cannot create user with username "admin"', 'error');
        return;
    }

    try {
        const response = await fetchWithAuth('/admin/addUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            showFeedback('User added successfully', 'success');
            document.getElementById('addUserForm').reset();
            closeModal('addUserModal');
            fetchUsers();
        } else {
            const data = await response.json();
            showFeedback(data.error || 'Failed to add user', 'error');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        showFeedback('An error occurred while adding the user', 'error');
    }
}

async function updateUser(event) {
    event.preventDefault();
    const newUsername = document.getElementById('editUsername').value;
    const originalUsername = document.getElementById('editModalTitle').textContent.split(': ')[1];

    if (newUsername.toLowerCase() === 'admin' || originalUsername.toLowerCase() === 'admin') {
        showFeedback('Cannot modify admin user', 'error');
        return;
    }

    try {
        const response = await fetchWithAuth(`/admin/editUser/${originalUsername}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername })
        });

        if (response.ok) {
            showFeedback('Username updated successfully', 'success');
            closeModal('editUserModal');
            fetchUsers();
        } else {
            const data = await response.json();
            showFeedback(data.error || 'Failed to update username', 'error');
        }
    } catch (error) {
        console.error('Error updating username:', error);
        showFeedback('An error occurred while updating the username', 'error');
    }
}

async function promptNewPassword(username) {
    if (username.toLowerCase() === 'admin') {
        showFeedback('Cannot reset admin password', 'error');
        return;
    }

    const newPassword = prompt("Enter new password for " + username);
    if (!newPassword) return;

    try {
        const response = await fetchWithAuth(`/admin/resetPassword/${username}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword })
        });

        if (response.ok) {
            showFeedback('Password reset successfully', 'success');
        } else {
            const data = await response.json();
            showFeedback(data.error || 'Failed to reset password', 'error');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        showFeedback('An error occurred while resetting the password', 'error');
    }
}

async function deleteUser(username) {
    if (username.toLowerCase() === 'admin') {
        showFeedback('Cannot delete admin user', 'error');
        return;
    }

    if (confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
        try {
            const response = await fetchWithAuth(`/admin/deleteUser/${username}`, { method: 'DELETE' });
            if (response.ok) {
                showFeedback(`User "${username}" deleted successfully`, 'success');
                closeModal('editUserModal');
                fetchUsers();
            } else {
                const data = await response.json();
                showFeedback(data.error || 'Failed to delete user', 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showFeedback('An error occurred while deleting the user', 'error');
        }
    }
}

function showFeedback(message, type) {
    const feedbackElement = document.getElementById('feedbackMessage');
    feedbackElement.textContent = message;
    feedbackElement.className = `feedback-message ${type}`;
    feedbackElement.style.display = 'block';
    setTimeout(() => {
        feedbackElement.style.display = 'none';
    }, 5000);
}

// Make necessary functions accessible globally
window.openEditUserModal = openEditUserModal;
window.closeModal = closeModal;