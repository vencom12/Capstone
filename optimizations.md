# System Optimization & Performance Roadmap

To ensure the Stitch Master AI system remains fast and responsive as data volume grows, the following optimizations are recommended across the stack.

## 1. Database & Backend Performance

### 🚀 Advanced Indexing
- **Compound Indexes**: Create a compound index on `Order` for `{ status: 1, date: -1 }`. This will significantly speed up the "History" tab which filters by multiple statuses and sorts by date.
- **Text Search**: Implement a MongoDB Text Index on `Order.orderId` and `Order.client` to replace the current `$regex` or client-side filtering, allowing for faster server-side search.
- **Partial Indexes**: Create indexes only for "Active" orders (status != 'Delivered') to keep index sizes small and lookups fast for the main dashboard.

### 📉 Query Optimization (Projections)
- **Lean Queries**: Use `.lean()` in Mongoose to return plain JavaScript objects instead of heavy Mongoose documents when only reading data.
- **Field Projections**: In the `dashboard-state` API, only return the fields needed for the table (e.g., exclude `items` and `notes` if they aren't shown in the main grid).

### 🧠 Server-Side Caching
- **Redis for Analytics**: Cache the results of complex aggregations (like revenue trends and top-liked products) for 5-15 minutes. These metrics don't need to be calculated on every dashboard load.
- **In-Memory Cache**: Use a simple TTL cache (like `node-cache`) for the public `api/products` endpoint.

---

## 2. Real-Time & Network Efficiency

### ⚡ Smart Socket.IO Payloads
- **Delta Updates**: Instead of a generic `ordersUpdated` signal, send the specific change:
    ```javascript
    // Instead of: io.emit('ordersUpdated')
    io.emit('orderChanged', { action: 'update', id: '...', status: 'In Transit' });
    ```
- **Socket Rooms**: Ensure staff only receive updates for orders relevant to them, and customers only receive their own updates, reducing network overhead.

### 📦 Payload Compression
- **Brotli Support**: While Gzip is active, Brotli offers better compression ratios for text-based JSON data and static assets.

---

## 3. Frontend Responsiveness

### 🖼️ UI Rendering & Virtualization
- **Grid Virtualization**: Use a virtual scrolling technique for the Admin Order Table. This ensures that only 10-20 rows are in the DOM at any time, even if there are 10,000 orders.
- **Fragment Updates**: Replace `innerHTML` with a more granular update method (like `document.createElement` or a lightweight view library) to avoid flickering and expensive DOM re-paints.

### ⏱️ Optimistic UI Updates
- **Instant Feedback**: When an admin clicks "Edit" or "Batch Update", update the local state and UI immediately while the API request runs in the background. Roll back only if the request fails.
- **Skeleton Screens**: Use skeleton loaders during the initial dashboard fetch to give the illusion of speed and reduce perceived latency.

### 🔍 Server-Side Filtering & Pagination
- **On-Demand Fetching**: Move the "Search" and "Filter" logic from the client to the backend. Use pagination (`limit` and `skip` or cursor-based) to fetch only what the user is looking at.

---

## 4. Operational Efficiency

### 🛠️ Background Workers
- **Async PDF Generation**: Move the `pdfkit` generation to a background process if many users download receipts simultaneously, preventing the main event loop from blocking.
- **Database Cleanup**: Implement a TTL index or a cron job to archive extremely old orders/traffic logs to a separate "Archive" collection to keep the "Active" collection lean.

---

## Implementation Priority

1.  **High Impact / Low Effort**: MongoDB Projections and `.lean()` usage.
2.  **High Impact / Medium Effort**: Smart Socket.IO payloads and Server-side pagination.
3.  **Scalability**: Redis caching for analytics and Grid Virtualization.
