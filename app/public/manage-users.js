document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth().then(() => {
        fetchUsers();
        setupEventListeners();
    }).catch((error) => {
        console.error('Admin auth check failed:', error);
        window.location.href = '/login.html';
    });
});

function setupEventListeners() {
    document.getElementById('addUserForm').addEventListener('submit', addUser);
    document.getElementById('userModal').addEventListener('click', function(event) {
        if (event.target === this) {
            closeModal();
        }
    });
}

async function fetchUsers() {
    try {
        const response = await fetchWithAuth('/admin/users');
        const users = await response.json();
        displayUsers(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        showFeedback('userListFeedback', 'Failed to fetch users. Please try again.', 'error');
    }
}

function displayUsers(users) {
    const userTableBody = document.querySelector('#userTable tbody');
    userTableBody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.isAdmin ? 'Admin' : 'User'}</td>
            <td>
                <button onclick="openUserModal('${user.username}')" class="btn btn-primary">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </td>
        `;
        userTableBody.appendChild(row);
    });
}

async function addUser(event) {
    event.preventDefault();
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const isAdmin = document.getElementById('newUserIsAdmin').checked;

    try {
        const response = await fetchWithAuth('/admin/addUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, isAdmin })
        });

        if (response.ok) {
            showFeedback('addUserFeedback', 'User added successfully', 'success');
            document.getElementById('addUserForm').reset();
            fetchUsers();
        } else {
            const data = await response.json();
            showFeedback('addUserFeedback', data.error || 'Failed to add user', 'error');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        showFeedback('addUserFeedback', 'An error occurred while adding the user', 'error');
    }
}

function openUserModal(username) {
    const modal = document.getElementById('userModal');
    const modalContent = document.getElementById('userModalContent');
    modalContent.innerHTML = `
        <h2>Manage User: ${username}</h2>
        <form id="editUserForm">
            <label for="editUsername">Username:</label>
            <input type="text" id="editUsername" value="${username}" required>
            <label for="editIsAdmin">Admin:</label>
            <input type="checkbox" id="editIsAdmin">
            <button type="submit" class="btn btn-primary">Update User</button>
        </form>
        <button onclick="resetPassword('${username}')" class="btn btn-warning">
            <i class="fas fa-key"></i> Reset Password
        </button>
        <button onclick="deleteUser('${username}')" class="btn btn-danger">
            <i class="fas fa-trash-alt"></i> Delete User
        </button>
        <button onclick="closeModal()" class="btn btn-secondary">Close</button>
    `;
    modal.style.display = 'block';

    // Fetch user details and populate the form
    fetchUserDetails(username);

    document.getElementById('editUserForm').addEventListener('submit', (event) => {
        event.preventDefault();
        updateUser(username);
    });
}

function closeModal() {
    const modal = document.getElementById('userModal');
    modal.style.display = 'none';
}

async function fetchUserDetails(username) {
    try {
        const response = await fetchWithAuth(`/admin/users/${username}`);
        const user = await response.json();
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editIsAdmin').checked = user.isAdmin;
    } catch (error) {
        console.error('Error fetching user details:', error);
        showFeedback('modalFeedback', 'Failed to fetch user details', 'error');
    }
}

async function updateUser(originalUsername) {
    const newUsername = document.getElementById('editUsername').value;
    const isAdmin = document.getElementById('editIsAdmin').checked;

    try {
        const response = await fetchWithAuth(`/admin/editUser/${originalUsername}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername, isAdmin })
        });

        if (response.ok) {
            showFeedback('modalFeedback', 'User updated successfully', 'success');
            closeModal();
            fetchUsers();
        } else {
            const data = await response.json();
            showFeedback('modalFeedback', data.error || 'Failed to update user', 'error');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        showFeedback('modalFeedback', 'An error occurred while updating the user', 'error');
    }
}

async function resetPassword(username) {
    if (confirm(`Are you sure you want to reset the password for user "${username}"?`)) {
        try {
            const response = await fetchWithAuth(`/admin/resetPassword/${username}`, { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                alert(`Password reset successfully. New temporary password: ${data.tempPassword}`);
            } else {
                const data = await response.json();
                showFeedback('modalFeedback', data.error || 'Failed to reset password', 'error');
            }
        } catch (error) {
            console.error('Error resetting password:', error);
            showFeedback('modalFeedback', 'An error occurred while resetting the password', 'error');
        }
    }
}

async function deleteUser(username) {
    if (confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
        try {
            const response = await fetchWithAuth(`/admin/deleteUser/${username}`, { method: 'DELETE' });
            if (response.ok) {
                showFeedback('modalFeedback', `User "${username}" deleted successfully`, 'success');
                closeModal();
                fetchUsers();
            } else {
                const data = await response.json();
                showFeedback('modalFeedback', data.error || 'Failed to delete user', 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showFeedback('modalFeedback', 'An error occurred while deleting the user', 'error');
        }
    }
}

function showFeedback(elementId, message, type) {
    const feedbackElement = document.getElementById(elementId);
    feedbackElement.textContent = message;
    feedbackElement.className = `feedback ${type}`;
    feedbackElement.style.display = 'block';
    setTimeout(() => {
        feedbackElement.style.display = 'none';
    }, 5000);
}

// Add these functions to window object to make them accessible from HTML
window.openUserModal = openUserModal;
window.closeModal = closeModal;
window.resetPassword = resetPassword;
window.deleteUser = deleteUser;