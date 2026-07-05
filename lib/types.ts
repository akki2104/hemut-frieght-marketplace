// TypeScript mirror of the backend enums and response schemas.
// Keep in sync with server/app/models/enums.py and server/app/schemas/* (CLAUDE.md §2.1).

export type LoadDirection = "outbound" | "inbound";
export type LoadStatus =
  | "available"
  | "bid_placed"
  | "booked"
  | "in_transit"
  | "delivered";
export type StopType = "pickup" | "delivery";
export type BidMethod = "email" | "call";
export type BidStatus =
  | "draft"
  | "sent"
  | "recorded"
  | "accepted"
  | "rejected"
  | "failed"
  | "cancelled";
export type BidDecision = "accepted" | "rejected" | "cancelled";
export type RateType = "all_in" | "per_mile";
export type CallMode = "auto_agent" | "manual";

export interface Stop {
  id: string;
  sequence: number;
  stop_type: StopType;
  city: string;
  state: string;
  lat: number;
  lng: number;
  scheduled_time: string | null;
  actual_arrival_time: string | null;
  instructions: string | null;
}

export interface LoadSummary {
  id: string;
  direction: LoadDirection;
  order_id: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  shipper_name: string;
  distance_miles: number;
  weight_lbs: number;
  equipment_type: string;
  posted_rate: string;
  pickup_deadhead_miles: number;
  source: string;
  broker_email: string;
  broker_phone: string;
  status: LoadStatus;
  num_stops: number;
}

export interface LoadDetail extends LoadSummary {
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  customer_company_name: string;
  customer_contact_name: string | null;
  customer_contact_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  instructions: string | null;
  stops: Stop[];
}

export interface BidLoadRef {
  id: string;
  order_id: string;
  direction: LoadDirection;
  status: LoadStatus;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  shipper_name: string;
}

export interface Bid {
  id: string;
  load_id: string;
  method: BidMethod;
  target_amount: string;
  status: BidStatus;
  rate_type: RateType | null;
  broker_email: string | null;
  subject: string | null;
  body: string | null;
  call_mode: CallMode | null;
  created_at: string;
  load: BidLoadRef | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Request payloads
export interface StopInput {
  sequence: number;
  stop_type: StopType;
  city: string;
  state: string;
  lat: number;
  lng: number;
  scheduled_time?: string | null;
  instructions?: string | null;
}

export interface LoadCreateInput {
  direction?: LoadDirection;
  order_id: string;
  origin_city: string;
  origin_state: string;
  origin_lat: number;
  origin_lng: number;
  destination_city: string;
  destination_state: string;
  destination_lat: number;
  destination_lng: number;
  shipper_name: string;
  distance_miles: number;
  weight_lbs: number;
  equipment_type: string;
  posted_rate: number;
  pickup_deadhead_miles: number;
  source: string;
  broker_email: string;
  broker_phone: string;
  customer_company_name: string;
  customer_contact_name?: string | null;
  customer_contact_phone?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  instructions?: string | null;
  stops: StopInput[];
}

export interface PlaceBidInput {
  method: BidMethod;
  target_amount: number;
  rate_type?: RateType | null;
  broker_email?: string | null;
  subject?: string | null;
  body?: string | null;
  call_mode?: CallMode | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
  correlation_id: string | null;
}
