document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('sessionId', data.sessionId);
                localStorage.setItem('isAdmin', data.isAdmin);
                window.location.href = '/filter.html';
            } else {
                showError(data.error || 'Invalid username or password');
            }
        } catch (error) {
            console.error('Error during login:', error);
            showError('An error occurred during login. Please try again.');
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.opacity = '1';
        setTimeout(() => {
            errorMessage.style.opacity = '0';
        }, 3000);
    }
});