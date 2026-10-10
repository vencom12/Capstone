// TypeScript interfaces derived from Prisma schema
// These types mirror the database models and API response shapes

export interface SavedAddress {
  id: string;
  recipientName: string;
  phoneNumber: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  postalCode?: string;
  streetAddress: string;
  fullAddress?: string;
  label?: 'Home' | 'Work' | 'Other';
  isDefault?: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'employee' | 'customer';
  walletBalance?: number;
  phoneNumber?: string;
  isPhoneVerified?: boolean;
  isEmailVerified?: boolean;
  address?: string;
  preferredDeliveryTime?: string;
  savedAddresses?: SavedAddress[];
  createdAt: string;
}

export interface ProductVariant {
  name: string;
  color?: string;
  size?: string;
  imageUrl?: string;
  priceOverride?: number;
  stock?: number; // Optional legacy field (stock is unified at product level for assorted supplies)
  materialId?: string; // Linked blank/raw material in Inventory
  materialName?: string; // Name of linked raw material
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
  variants?: ProductVariant[];
  views?: number;
  count?: number;
  reservedCount?: number;
  minThreshold?: number;
  availableStock?: number;
  isOutOfStock?: boolean;
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
  selectedVariant?: string;
  selectedColor?: string;
  selectedSize?: string;
  backupVariant?: string; // 2nd choice color for assorted supply batches
  backupColor?: string;
  personalization?: {
    text: string;
    font?: string;
    threadColor?: string;
    threadHex?: string;
  };
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
  personalization?: {
    fulfillmentType?: 'pickup' | 'delivery' | string;
    courier?: string;
    trackingNumber?: string;
    referenceNumber?: string;
    claimantName?: string;
    claimantPhone?: string;
    pickupNote?: string;
    text?: string;
    font?: string;
    color?: string;
    threadHex?: string;
    statusHistory?: Array<{
      status: string;
      timestamp: string;
      actor?: string;
      hub?: string;
      note?: string;
    }>;
    [key: string]: any;
  };
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
  selectedVariant?: string;
  selectedColor?: string;
  selectedSize?: string;
  backupVariant?: string; // 2nd choice color for assorted supply batches
  backupColor?: string;
  personalization?: {
    text: string;
    font?: string;
    threadColor?: string;
    threadHex?: string;
  };
}

export interface DashboardState {
  products: Product[];
  orders: Order[];
  favorites: Product[];
  transactions: Transaction[];
  receipts: Receipt[];
  walletBalance: number;
  address?: string;
  phoneNumber?: string;
  isEmailVerified?: boolean;
  savedAddresses?: SavedAddress[];
  preferredDeliveryTime?: string;
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
