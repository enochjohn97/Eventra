/**
 * Eventra Auth Guard
 * Protects routes based on user role and authentication status.
 */

(function() {
    const currentPath = window.location.pathname;
    
    // 1. Skip protection for login and signup pages to prevent redirect loops
    const loginPages = ['adminLogin.html', 'clientLogin.html', 'signup.html'];
    if (loginPages.some(page => currentPath.endsWith(page))) {
        return;
    }

    let requiredRole = null;
    if (currentPath.includes('/admin/')) {
        requiredRole = 'admin';
    } else if (currentPath.includes('/client/')) {
        requiredRole = 'client';
    }

    if (!requiredRole) return; // Not a protected area

    // Use centralized storage utility for role-aware user retrieval
    // Safety check: if storage utility isn't loaded yet, we can't verify auth
    if (!window.storage) {
        console.warn('[Auth Guard] Storage utility not found. Postponing check.');
        return;
    }
    const user = window.storage.getUser();
    
    if (!user || user.role !== requiredRole) {
        const basePath = currentPath.includes('/pages/') ? '../../' : '../';
        
            if (requiredRole === 'admin') {
            window.location.href = basePath + 'admin/pages/adminLogin.html';
        } else {
            window.location.href = basePath + 'client/pages/clientLogin.html';
        }
        return;
    }

  //  console.log(`Auth Guard: Successfully authenticated as ${requiredRole}`);
})();
