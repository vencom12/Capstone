# Login Portal Segregation and Session Management Fix

Analyze and implement strict role enforcement for login portals (Admin, Employee, Customer) and fix session persistence behavior to prevent sessions from being unintentionally saved on the device.

## User Review Required

> [!IMPORTANT]
> **Strict Role Enforcement**: With this change, an Admin account will NOT be able to log in through the Customer portal (`index.html`), and vice versa. They must use their respective portals (`admin.html` for Admins, `employee.html` for Employees).
> 
> **Session Persistence**: Sessions will now use `sessionStorage` by default, meaning they will be cleared when the browser tab is closed. Only if "Stay logged in" (Remember Me) is checked on the customer portal will the session persist in `localStorage`.

## Proposed Changes

### [Backend] [server.js](file:///c:/Users/revin/Downloads/Capstone/server.js)

- Update the `/api/auth/login` endpoint to accept an optional `portal` parameter.
- Verify that the authenticated user's role matches the requested portal.

#### [MODIFY] server.js

```javascript
// ... in app.post('/api/auth/login', ...)
const { email, password, rememberMe, portal } = req.body;
// ... after finding user and comparing password
if (portal && user.role !== portal) {
    return res.status(403).json({ message: `Unauthorized: This account is not authorized for the ${portal} portal.` });
}
```

---

### [Frontend] [app.js](file:///c:/Users/revin/Downloads/Capstone/public/legacy/app.js)

- Update `AuthManager.login` to accept and send the `portal` parameter.
- Use `sessionStorage` by default for non-persistent sessions.
- Update `AuthManager.getSession` to check both `localStorage` and `sessionStorage`.
- Ensure `AuthManager.logout` clears both storage types.

#### [MODIFY] app.js

```javascript
// Update login to handle portal and storage
async login(email, password, rememberMe = false, portal = null) {
    // ... pass portal in body
    // ... if success, use appropriate storage:
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(this.SESSION_KEY, JSON.stringify({ user: data.user }));
}

// Update getSession to check both
getSession() {
    let session = localStorage.getItem(this.SESSION_KEY) || sessionStorage.getItem(this.SESSION_KEY);
    // ... parse and return
}
```

---

### [Portal Integration]

Update the login forms in the HTML files to pass the correct portal identifier.

#### [MODIFY] [admin.html](file:///c:/Users/revin/Downloads/Capstone/public/legacy/admin.html)
- Pass `'admin'` as the portal argument to `AuthManager.login`.

#### [MODIFY] [employee.html](file:///c:/Users/revin/Downloads/Capstone/public/legacy/employee.html)
- Pass `'employee'` as the portal argument to `AuthManager.login`.

#### [MODIFY] [index.html](file:///c:/Users/revin/Downloads/Capstone/public/legacy/index.html)
- Pass `'customer'` as the portal argument to `AuthManager.login`.

## Verification Plan

### Manual Verification
1. **Portal Enforcement**:
   - Try logging in as an Admin on `index.html` (Customer portal) → Should fail with "Unauthorized".
   - Try logging in as a Customer on `admin.html` (Admin portal) → Should fail with "Unauthorized".
   - Log in with correct roles on respective portals → Should succeed.
2. **Session Persistence**:
   - Log in WITHOUT "Stay logged in" → Close browser tab → Reopen → Should be logged out.
   - Log in WITH "Stay logged in" (on Customer portal) → Close browser → Reopen → Should still be logged in.
3. **Logout**:
   - Log in → Click Logout → Verify both `localStorage` and `sessionStorage` are cleared.
