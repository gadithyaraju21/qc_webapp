(function(global) {
    global.checkAuth = async function() {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            window.location.href = '/login.html';
            return null;
        }
        
        try {
            const response = await global.fetchWithAuth('/user-info');
            const userInfo = await response.json();
            global.setUserStatus(userInfo.username, userInfo.isAdmin);
            return userInfo;
        } catch (error) {
            console.error('Error checking auth:', error);
            localStorage.removeItem('sessionId');
            localStorage.removeItem('isAdmin');
            window.location.href = '/login.html';
            return null;
        }
    };

    global.setUserStatus = function(username, isAdmin) {
        const userStatusElement = document.getElementById('userStatus');
        if (userStatusElement) {
            userStatusElement.textContent = `Logged in as: ${username}`;
            if (isAdmin) {
                const adminBadge = document.createElement('span');
                adminBadge.textContent = ' (Admin)';
                adminBadge.className = 'status-admin';
                userStatusElement.appendChild(adminBadge);
            }
        }
        
        // Show/hide admin-specific elements
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => {
            el.style.display = isAdmin ? 'block' : 'none';
        });
    };

    global.logout = async function() {
        try {
            const response = await global.fetchWithAuth('/logout', { method: 'GET' });
            const data = await response.json();
            if (data.success) {
                localStorage.removeItem('sessionId');
                localStorage.removeItem('isAdmin');
                window.location.href = '/login.html';
            } else {
                throw new Error('Logout failed');
            }
        } catch (error) {
            console.error('Error during logout:', error);
            alert('An error occurred during logout. Please try again.');
        }
    };

    global.fetchWithAuth = async function(url, options = {}) {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            window.location.href = '/login.html';
            return;
        }
        const headers = {
            ...options.headers,
            'X-Session-Id': sessionId,
        };
        try {
            const response = await fetch(url, { ...options, headers });
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            return response;
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    };

    global.checkAdminAuth = async function() {
        try {
            console.log('Checking admin auth...');
            const response = await global.fetchWithAuth('/admin/check-auth');
            console.log('Admin auth check response:', response);
            if (!response.ok) {
                throw new Error('Admin authentication failed');
            }
            console.log('Admin auth check successful');
        } catch (error) {
            console.error('Error checking admin auth:', error);
            throw error;
        }
    };

    global.isAdmin = function() {
        return localStorage.getItem('isAdmin') === 'true';
    };

})(typeof window !== 'undefined' ? window : global);