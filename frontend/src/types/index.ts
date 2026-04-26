// ─── Core Domain Types ───────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  role: 'customer' | 'admin' | 'employee';
  email?: string;
}

export interface Product {
  _id: string;
  name: string;
  price: number;
  tag: string;
  description: string;
  imageUrl: string;
  views?: number;
  createdAt?: string;
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  _id: string;
  client: string;
  design: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Order Canceled';
  progress: number;
  items: OrderItem[];
  price?: string;
  date: string;
  userId: string;
}

export interface InventoryItem {
  _id: string;
  item: string;
  count: number;
  lastUpdated: string;
}

export interface Analytics {
  userCount: number;
  revenue: number;
  activeOrders: number;
  lowStock: number;
}

export interface DashboardState {
  orders: Order[];
  inventory: InventoryItem[];
  products: Product[];
  favorites: Product[];
  analytics: Analytics | null;
  users: User[];
}

// ─── Basket ──────────────────────────────────────────────────────────────────

export interface BasketItem {
  product: Product;
  quantity: number;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface OrderTrend {
  _id: { year: number; month: number };
  count: number;
  revenue: number;
}

export interface StatusDistribution {
  _id: string;
  count: number;
}

export interface TopItem {
  _id: string;
  count?: number;
  likeCount?: number;
  name?: string;
}

export interface TrafficStat {
  _id: string;
  visits: number;
}

export interface AnalyticsReport {
  orderTrends: OrderTrend[];
  statusDistribution: StatusDistribution[];
  topOrdered: TopItem[];
  topLiked: TopItem[];
  trafficStats: TrafficStat[];
}
