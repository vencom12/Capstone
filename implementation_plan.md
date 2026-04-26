# Next.js + Tailwind Migration + Remember Me Auth

## What This Accomplishes

This plan migrates the Stitch-Opt frontend from vanilla HTML/CSS/JS to **Next.js 14 (App Router) + Tailwind CSS**, while simultaneously implementing the **"Remember Me" authentication** requested earlier. The backend (`server.js`, Express, MongoDB) stays **100% unchanged** — Next.js will call it via `fetch()` just like the current `app.js` does.

---

## Architecture Overview

```
Capstone/
├── server.js            ← UNCHANGED (Express API)
├── models/              ← UNCHANGED
├── middleware/          ← UNCHANGED (+ small auth.js tweak)
├── public/              ← UNCHANGED (kept as fallback)
└── frontend/            ← NEW Next.js app
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    └── src/
        ├── app/
        │   ├── layout.tsx          ← Root layout, font, globals
        │   ├── page.tsx            ← Storefront (public landing)
        │   ├── login/page.tsx      ← Login page (with Remember Me)
        │   ├── register/page.tsx   ← Register page
        │   ├── dashboard/page.tsx  ← Customer dashboard
        │   ├── admin/page.tsx      ← Admin dashboard
        │   └── employee/page.tsx   ← Employee dashboard
        ├── components/
        │   ├── ui/                 ← Reusable primitives (Button, Card, Modal, etc.)
        │   ├── layout/             ← Sidebar, Header, Drawer
        │   ├── auth/               ← LoginForm, RegisterForm, AuthGuard
        │   ├── storefront/         ← ProductGrid, ProductCard, BasketDrawer
        │   ├── dashboard/          ← OrderQueue, OrderTracking, Favorites
        │   └── admin/              ← OrdersTable, StaffTable, AnalyticsCharts
        ├── lib/
        │   ├── api.ts              ← Typed fetch wrappers for every API endpoint
        │   ├── auth.ts             ← AuthManager (Remember Me, cookies, session)
        │   └── socket.ts           ← Socket.IO client singleton
        └── types/
            └── index.ts            ← TypeScript types for User, Order, Product, etc.
```

---

## Changes Needed

### 1. Backend — `server.js` (Remember Me Auth)

#### MODIFY [server.js](file:///c:/Users/revin/Downloads/Capstone/server.js)

**Login route** — accept `rememberMe` from request body and set cookie lifetime accordingly:

```diff
- const { email, password } = req.body;
+ const { email, password, rememberMe } = req.body;

  const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
-     { expiresIn: '1d' }
+     { expiresIn: rememberMe ? '30d' : '1d' }
  );

  res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
-     sameSite: 'Lax',
-     maxAge: 24 * 60 * 60 * 1000   // always 1 day
+     sameSite: 'Strict',
+     // Persistent: 30 days; Session: no maxAge = browser-session cookie
+     ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {})
  });
```

**Logout route** — clear the cookie properly:

```diff
  app.post('/api/auth/logout', (req, res) => {
-     res.clearCookie('token');
+     res.clearCookie('token', {
+         httpOnly: true,
+         secure: process.env.NODE_ENV === 'production',
+         sameSite: 'Strict'
+     });
      res.json({ message: 'Logged out successfully' });
  });
```

---

### 2. Frontend — New Next.js App

#### [NEW] `frontend/` directory (entire Next.js project)

Bootstrap with:
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-git
```

Then build out all pages and components listed above.

---

### 3. Key Pages & Components

| Page / Component | Description |
|---|---|
| `app/page.tsx` | Public storefront — product grid, search, hero, basket drawer |
| `app/login/page.tsx` | Login with **Remember Me checkbox**, error handling, role redirect |
| `app/register/page.tsx` | Register form |
| `app/dashboard/page.tsx` | Customer dashboard — shop, order tracking, favorites, settings |
| `app/admin/page.tsx` | Admin console — orders, inventory, staffing, analytics |
| `app/employee/page.tsx` | Employee view |
| `components/auth/AuthGuard.tsx` | HOC that checks session; redirects if unauthenticated |
| `lib/auth.ts` | `login(email, pass, rememberMe)`, `logout()`, `getSession()`, `checkAccess()` |
| `lib/api.ts` | All API calls typed, with `credentials: 'include'` for cookie auth |

---

## Design System (Tailwind)

The existing dark glassmorphism aesthetic is preserved via Tailwind config:

```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      primary: '#6366f1',
      secondary: '#a855f7',
      accent: '#ec4899',
      'bg-dark': '#0f172a',
      'bg-card': 'rgba(30, 41, 59, 0.7)',
    },
    fontFamily: {
      outfit: ['Outfit', 'Inter', 'sans-serif'],
    },
    backdropBlur: {
      glass: '12px',
    }
  }
}
```

---

## Open Questions

> [!IMPORTANT]
> **Which version of Tailwind?** Next.js `create-next-app` currently installs Tailwind v3. Confirm this is acceptable or if you need v4.

> [!IMPORTANT]
> **Run both servers?** During development, you'd run Express on port 5000 and Next.js on port 3000. Next.js will proxy API calls to Express. Is this OK, or do you want a single-port setup (Next.js API routes forwarding to Express)?

---

## Implementation Order

1. **Backend auth fix** (5 min) — Remember Me cookie changes in `server.js`
2. **Scaffold Next.js** — `create-next-app` inside `frontend/`
3. **Tailwind + design tokens** — `tailwind.config.js`, `globals.css`
4. **`lib/` layer** — `api.ts`, `auth.ts`, `socket.ts`, `types/index.ts`
5. **Shared components** — `Sidebar`, `Button`, `Card`, `Modal`, `Toast`
6. **Auth pages** — `login/page.tsx` (with Remember Me), `register/page.tsx`
7. **Storefront** — `page.tsx`, `ProductGrid`, `ProductCard`, `BasketDrawer`
8. **Customer Dashboard** — `dashboard/page.tsx`
9. **Admin Dashboard** — `admin/page.tsx` with analytics charts (Chart.js via react-chartjs-2)
10. **Employee Dashboard** — `employee/page.tsx`
11. **Verify** — test all pages, auth flows, real-time socket updates

---

## Verification Plan

### Automated
- `npm run build` inside `frontend/` — confirms no TypeScript/build errors
- Verify API calls return correct data with both sessions active

### Manual
- Login **with** Remember Me → close tab → reopen → still logged in ✓
- Login **without** Remember Me → close tab → reopen → redirected to login ✓
- Access `/dashboard` unauthenticated → redirect to `/login` ✓
- Admin trying `/dashboard` → redirect to `/admin` ✓
- Real-time order updates via Socket.IO ✓
