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
  email?: string | null;
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
  stock?: number; // Physical variant stock (or linked material stock)
  materialId?: string; // Linked blank/raw material in Materials tab (Inventory)
  materialName?: string; // Name of linked raw material
  availableStock?: number; // Calculated dynamic available stock
  isOutOfStock?: boolean;
}

export interface Product {
  id: string;
  _id?: string; // MongoDB compatibility
  name: string;
  price: number;
  category?: string;
  tag: string;
  tags?: string[];
  garmentSize?: 'small' | 'big';
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
  rating?: number | null;
  reviewCount?: number;
  createdAt: string;
}

export interface ProductReview {
  id: string;
  rating: number;
  message: string;
  customerName: string;
  orderId?: string | null;
  isVerifiedPurchase: boolean;
  createdAt: string;
  merchantReply?: string | null;
  merchantReplyAt?: string | null;
  isFeatured?: boolean;
}

export interface ProductReviewsResponse {
  success: boolean;
  productId: string;
  averageRating: number | null;
  totalReviews: number;
  distribution: {
    [key: number]: number;
  };
  reviews: ProductReview[];
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
  isPreOrder?: boolean;
  preOrderShortage?: number;
  personalization?: {
    text: string;
    namesList?: string[];
    isBulkList?: boolean;
    font?: string;
    threadColor?: string;
    threadHex?: string;
    extraLetteringCost?: number;
    totalExtraLetteringCost?: number;
    extraLettersCount?: number;
    garmentSize?: 'small' | 'big';
    isPreOrder?: boolean;
    preOrderShortage?: number;
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
  myReview?: { rating: number; message: string } | null;
  date: string;
  createdAt: string;
  updatedAt: string;
  processedBy?: string;
  garmentsReceivedBy?: string;
  personalization?: {
    fulfillmentType?: 'pickup' | string;
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

export interface BasketItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  baseUnitPrice?: number;
  garmentSize?: 'small' | 'big';
  imageUrl?: string;
  quantity: number;
  selectedVariant?: string;
  selectedColor?: string;
  selectedSize?: string;
  backupVariant?: string; // 2nd choice color for assorted supply batches
  backupColor?: string;
  isPreOrder?: boolean;
  preOrderShortage?: number;
  personalization?: {
    text: string;
    namesList?: string[];
    isBulkList?: boolean;
    font?: string;
    threadColor?: string;
    threadHex?: string;
    extraLetteringCost?: number;
    totalExtraLetteringCost?: number;
    extraLettersCount?: number;
    garmentSize?: 'small' | 'big';
    isPreOrder?: boolean;
    preOrderShortage?: number;
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
