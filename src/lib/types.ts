// ============================================================================
// Domain types — mirrors supabase/schema.sql 1:1 (strict mode friendly)
// ============================================================================

export type StaffRole = "admin" | "manager" | "receptionist" | "cashier" | "kitchen_staff";
export type RoomStatus = "vacant" | "occupied" | "dirty" | "maintenance";
export type BookingStatus = "pending" | "checked_in" | "checked_out" | "cancelled";
export type StayType = "overnight" | "short_stay";
export type RatePlanKind = "per_night" | "block";
export type TableStatus = "vacant" | "occupied" | "reserved" | "billed";
export type ChannelType = "dine_in" | "room_service" | "takeaway" | "delivery";
export type OrderStatus = "active" | "completed" | "cancelled";
export type DeliveryStatus = "pending" | "cooking" | "dispatched" | "delivered";
export type InventoryUnit = "grams" | "ml" | "units";
export type ExpenseCategory = "utilities" | "purchasing" | "salary" | "maintenance" | "marketing";
export type LogSeverity = "info" | "warning" | "critical";

export interface StaffProfile {
  id: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomType {
  id: string;
  name: string;
  base_price: number;
  max_occupancy: number;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  room_number: string;
  type_id: string;
  status: RoomStatus;
  floor_zone: string | null;
  created_at: string;
  updated_at: string;
  room_types?: RoomType; // joined
}

export interface Booking {
  id: string;
  room_id: string | null;
  guest_name: string;
  contact_number: string | null;
  check_in_date: string;
  check_out_date: string;
  total_folio_amount: number;
  stay_type: StayType;
  duration_hours: number | null;
  rate_plan_id: string | null;
  rate_plan_name: string | null;
  rate_plan_price: number | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
  status: BookingStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  rooms?: Room; // joined
  booking_charges?: BookingCharge[]; // joined
}

export interface RoomRatePlan {
  id: string;
  room_type_id: string;
  name: string;
  kind: RatePlanKind;
  price: number;
  duration_hours: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  room_types?: RoomType; // joined
}

export interface BookingCharge {
  id: string;
  booking_id: string;
  description: string;
  amount: number;
  created_by: string | null;
  created_at: string;
}

export interface RestaurantTable {
  id: string;
  table_number: string;
  capacity: number;
  current_status: TableStatus;
  floor_zone: string | null;
  created_at: string;
  updated_at: string;
}

export interface MenuCategoryRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category_id: string;
  selling_price: number;
  other_cost: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
  menu_categories?: MenuCategoryRow; // joined
  menu_recipe_ingredients?: Pick<MenuRecipeIngredient, "id">[]; // joined (recipe presence check)
}

export interface RestaurantOrder {
  id: string;
  order_number: number;
  channel_type: ChannelType;
  table_id: string | null;
  booking_id: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  subtotal: number;
  service_charge: number;
  total_amount: number;
  order_status: OrderStatus;
  delivery_status: DeliveryStatus | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  restaurant_tables?: RestaurantTable; // joined
  bookings?: Booking; // joined
  order_items?: OrderItem[]; // joined
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  kot_printed_at: string | null;
  created_at: string;
  menu_items?: MenuItem; // joined
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity_in_stock: number;
  unit: InventoryUnit;
  unit_cost: number;
  reorder_level: number;
  created_at: string;
  updated_at: string;
}

export interface MenuRecipeIngredient {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity_needed: number;
  created_at: string;
  inventory_items?: InventoryItem; // joined
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  description: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface SystemLog {
  id: string;
  event_type: string;
  severity: LogSeverity;
  message: string;
  ref_table: string | null;
  ref_id: string | null;
  created_at: string;
}

// ============================================================================
// RBAC — single source of truth for route access
// ============================================================================

export interface NavSection {
  href: string;
  label: string;
  icon: string;
  roles: StaffRole[];
}

export const ALL_ROLES: StaffRole[] = ["admin", "manager", "receptionist", "cashier", "kitchen_staff"];

export interface HotelSettings {
  id: number;
  hotel_name: string;
  address: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  logo_url: string | null;
  service_charge_rate: number;
  created_at: string;
  updated_at: string;
}

export const ROUTE_ACCESS: Record<string, StaffRole[]> = {
  "/": ["admin", "manager"],
  "/pms/rooms": ["admin", "manager", "receptionist"],
  "/pms/reserve": ["admin", "manager", "receptionist"],
  "/pms/settings": ["admin", "manager"],
  "/settings": ["admin", "manager"],
  "/pos/active": ["admin", "manager", "cashier", "kitchen_staff"],
  "/pos/billing": ["admin", "manager", "cashier"],
  "/pos/menu": ["admin", "manager"],
  "/inventory": ["admin", "manager", "kitchen_staff"],
  "/inventory/recipes": ["admin", "manager"],
  "/finance/expenses": ["admin", "manager"],
  "/finance/reports": ["admin", "manager"],
  "/finance/daily-summary": ["admin", "manager"],
};

export function canAccess(role: StaffRole | null, pathname: string): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  const match = Object.keys(ROUTE_ACCESS)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (!match) return false;
  const allowed = ROUTE_ACCESS[match];
  return allowed ? allowed.includes(role) : false;
}

/** Where each role lands after login */
export const ROLE_HOME: Record<StaffRole, string> = {
  admin: "/",
  manager: "/",
  receptionist: "/pms/rooms",
  cashier: "/pos/active",
  kitchen_staff: "/pos/active",
};
