// TypeScript interfaces derived from Prisma schema
// These types mirror the database models and API response shapes

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'employee' | 'customer';
  walletBalance: number;
  phoneNumber?: string;
  address?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  _id?: string; // MongoDB compatibility
  name: string;
  price: number;
  tag: string;
  tags?: string[];
  description?: string;
  imageUrl: string;
  recipe?: RecipeItem[];
  views?: number;
  createdAt: string;
}

export interface RecipeItem {
  inventoryId: string;
  name: string;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

export interface Order {
  id: string;
  orderId: string;
  client: string;
  design: string;
  items: OrderItem[];
  status: string;
  progress: number;
  paymentStatus: string;
  paymentMethod: string;
  address?: string;
  deliveryTime?: string;
  notes?: string;
  totalAmount: number;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  transactionID: string;
  orderID: string;
  amount: number;
  status: string;
  receiptLink?: string;
  timestamp: string;
}

export interface Receipt {
  id: string;
  receiptID: string;
  orderID: string;
  paymentMethod: string;
  amount: number;
  status: string;
  timestamp: string;
  imageUrl?: string;
  confidenceScore?: number;
  aiVerificationStatus?: string;
}

export interface Inventory {
  id: string;
  item: string;
  count: number;
  unit: string;
  minThreshold: number;
  lastUpdated: string;
}

export interface BasketItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
}

export interface DashboardState {
  products: Product[];
  orders: Order[];
  favorites: Product[];
  transactions: Transaction[];
  receipts: Receipt[];
  walletBalance: number;
  user?: User;
  productPagination?: {
    currentPage: number;
    totalPages: number;
  };
}

// API Response shapes
export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
}

export interface ApiError {
  message: string;
  error?: string;
}
