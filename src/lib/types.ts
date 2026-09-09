// ============================================================================
// Domain types — mirrors supabase/schema.sql 1:1 (strict mode friendly)
// ============================================================================

export type StaffRole = "admin" | "manager" | "receptionist" | "cashier" | "kitchen_staff";
export type RoomStatus = "vacant" | "occupied" | "dirty" | "maintenance";
export type BookingStatus = "pending" | "checked_in" | "checked_out" | "cancelled";
export type StayType = "overnight" | "short_stay";
export type RatePlanKind = "per_night" | "block";
export type TableStatus = "vacant" | "occupied" | "reserved" | "billed";
export type ChannelType = "dine_in" | "room_service" | "takeaway" | "delivery" | "banquet";
export type KitchenStation = "kitchen" | "bar";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "complimentary" | "credit";
export type ExpenseDivision = "restaurant" | "room";

export interface CreditAccount {
  id: string;
  name: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditRepayment {
  id: string;
  credit_account_id: string;
  amount: number;
  payment_method: PaymentMethod;
  date: string;
  description: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface CreditAdjustment {
  id: string;
  credit_account_id: string;
  amount: number;
  date: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}
export type CashDirection = "in" | "out";
export type OrderStatus = "active" | "completed" | "cancelled";
export type DeliveryStatus = "pending" | "cooking" | "dispatched" | "delivered";
export type InventoryUnit = "grams" | "ml" | "units";
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
  guest_id_number: string | null;
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
  payment_method: PaymentMethod | null;
  credit_account_id: string | null;
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
  station: KitchenStation;
  created_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category_id: string;
  selling_price: number;
  other_cost: number;
  service_chargeable: boolean;
  is_available: boolean;
  image_url: string | null;
  station: KitchenStation | null; // null = inherit the category's station
  created_at: string;
  updated_at: string;
  menu_categories?: MenuCategoryRow; // joined
  menu_recipe_ingredients?: Pick<MenuRecipeIngredient, "id">[]; // joined (recipe presence check)
}

/** The station a menu item's KOT/BOT actually prints to — its own override
 * if set, otherwise its category's station, otherwise kitchen. */
export function itemStation(item: {
  station?: KitchenStation | null;
  menu_categories?: Pick<MenuCategoryRow, "station"> | null;
}): KitchenStation {
  return item.station ?? item.menu_categories?.station ?? "kitchen";
}

export interface RestaurantOrder {
  id: string;
  order_number: number;
  channel_type: ChannelType;
  table_id: string | null;
  booking_id: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  event_name: string | null;
  business_date: string;
  is_historical: boolean;
  subtotal: number;
  service_charge: number;
  total_amount: number;
  order_status: OrderStatus;
  payment_method: PaymentMethod | null;
  credit_account_id: string | null;
  service_charge_waived: boolean;
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
  menu_item_id: string | null; // null for custom (free-text) lines
  quantity: number;
  unit_price: number;
  line_total: number;
  kot_printed_at: string | null;
  is_custom: boolean;
  custom_description: string | null;
  service_chargeable: boolean;
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

export interface Purchase {
  id: string;
  supplier_name: string | null;
  purchase_date: string;
  notes: string | null;
  total_amount: number;
  expense_id: string | null;
  created_by: string | null;
  created_at: string;
  purchase_items?: PurchaseItem[]; // joined
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  inventory_item_id: string;
  quantity: number;
  unit_price: number;
  pack_size: number; // how many of the item's storage unit one purchased unit equals
  line_total: number;
  created_at: string;
  inventory_items?: Pick<InventoryItem, "name" | "unit">; // joined
}

export interface MenuRecipeIngredient {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity_needed: number;
  created_at: string;
  inventory_items?: InventoryItem; // joined
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Expense {
  id: string;
  category_id: string;
  amount: number;
  date: string;
  description: string | null;
  payment_method: PaymentMethod;
  division: ExpenseDivision;
  logged_by: string | null;
  created_at: string;
  expense_categories?: ExpenseCategoryRow; // joined
}

export interface CashMovement {
  id: string;
  direction: CashDirection;
  category: string;
  description: string | null;
  amount: number;
  date: string;
  logged_by: string | null;
  created_at: string;
}

export type EventStatus = "tentative" | "confirmed" | "cancelled";

export interface EventBooking {
  id: string;
  event_name: string;
  description: string | null;
  pax: number | null;
  event_date: string;
  event_time: string | null;
  contact_name: string | null;
  contact_number: string | null;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  "/pms/calendar": ["admin", "manager", "receptionist"],
  "/pms/settings": ["admin", "manager"],
  "/settings": ["admin", "manager"],
  "/settings/users": ["admin"],
  "/settings/settled-records": ["admin"],
  "/backfill": ["admin", "manager"],
  "/pos/active": ["admin", "manager", "cashier", "kitchen_staff"],
  "/pos/billing": ["admin", "manager", "cashier"],
  "/pos/menu": ["admin", "manager"],
  "/pos/tables": ["admin", "manager"],
  "/inventory": ["admin", "manager", "kitchen_staff"],
  "/inventory/recipes": ["admin", "manager"],
  "/inventory/purchases": ["admin", "manager"],
  "/finance/expenses": ["admin", "manager"],
  "/finance/reports": ["admin", "manager"],
  "/finance/daily-summary": ["admin", "manager"],
  "/finance/cash-book": ["admin", "manager"],
  "/finance/credit-accounts": ["admin", "manager", "receptionist", "cashier"],
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
