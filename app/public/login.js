document.getElementById('login-form').addEventListener('submit', login);

async function login(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');
    
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
            window.location.href = '/filter.html';  // Redirect to the main application page after successful login
        } else {
            errorMessage.textContent = data.error || 'Invalid username or password';
        }
    } catch (error) {
        console.error('Error during login:', error);
        errorMessage.textContent = 'An error occurred during login. Please try again.';
    }
}