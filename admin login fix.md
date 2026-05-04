# Restore Admin Staff Management and In-Page Admin Login

The user is unable to create new staff accounts and wants the admin login to appear as a "window" (modal) on the storefront instead of a direct page navigation. We will also address the account creation failure by improving error reporting and validation.

## User Review Required

> [!IMPORTANT]
> The admin login will now happen within the storefront modal. Upon successful login, the user will be redirected to `admin.html`. This keeps the initial interaction on the storefront as requested.

## Proposed Changes

### [Storefront]

#### [MODIFY] [index.html](file:///c:/Users/revin/Downloads/Capstone/public/legacy/index.html)
- Add an admin login form container inside the `auth-overlay`.
- Update the "Admin Login" and "Employee Login" links to toggle the view within the modal instead of navigating.
- Add a new function `showAuthMode(mode)` to switch between Customer, Admin, and Employee login views.
- Add a submission handler for the admin and employee login forms.

### [Core Logic]

#### [MODIFY] [app.js](file:///c:/Users/revin/Downloads/Capstone/public/legacy/app.js)
- Improve `AdminActions.createUser` and `EmployeeActions.createProduct` to display specific server error messages (e.g., password too short) instead of a generic "Action failed".
- Ensure `AuthManager.login` correctly handles the `portal` parameter which is already implemented but needs to be called correctly from the new storefront forms.

### [Backend]

#### [MODIFY] [server.js](file:///c:/Users/revin/Downloads/Capstone/server.js)
- Update error handling in `POST /api/admin/users` and `POST /api/auth/register` to return 400 status for Mongoose validation errors with the specific message, instead of a generic 500.
- Add logging to `POST /api/admin/users` to match the registration logging.

#### [MODIFY] [models/User.js](file:///c:/Users/revin/Downloads/Capstone/models/User.js)
- (Optional) Consider if password length should be relaxed, but better to keep security and just report the error to the user.

## Verification Plan

### Automated Tests
- Use the browser tool to:
    1. Click "Login" on the storefront.
    2. Click "Admin Login" in the modal.
    3. Verify the admin login form appears in the modal.
    4. Attempt to login as admin (if credentials known) or verify it attempts to call the API.
    5. Go to `admin.html` (if logged in) and attempt to create a staff account with a short password.
    6. Verify the error message "Path `password` is shorter than the minimum allowed length (8)" is displayed.

### Manual Verification
- Verify that clicking "Employee Login" also shows a modal instead of redirecting.
- Verify that the "Return to Customer Login" link works in the modal.
