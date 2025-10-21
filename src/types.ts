/**
 * Type definitions for SCP Local MCP Server
 */

export interface SCPConfig {
  dns_resolver: string;
  dns_cache_ttl: number;
  poll_interval: number;
  max_poll_attempts: number;
  token_refresh_threshold: number;
  request_timeout: number;
  demo_mode?: boolean;
  demo_endpoint?: string;
}

export interface MerchantAuthorization {
  id?: number;
  merchant_domain: string;
  scp_endpoint: string;
  customer_id: string;
  customer_email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: number;
  scopes: string[];
  created_at: number;
  updated_at: number;
}

export interface EndpointCache {
  id?: number;
  domain: string;
  endpoint: string;
  capabilities: SCPCapabilities | null;
  discovered_at: number;
  ttl: number;
}

export interface SCPCapabilities {
  version: string;
  protocol_version: string;
  scopes_supported: string[];
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  magic_link_supported: boolean;
  webhook_support: boolean;
  rate_limit?: {
    requests_per_minute: number;
    requests_per_hour: number;
  };
}

export interface AuthorizationRequest {
  email: string;
  client_id: string;
  client_name: string;
  domain: string;
  scopes: string[];
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  state: string;
}

export interface AuthorizationResponse {
  auth_request_id: string;
  email_sent: boolean;
  expires_in: number;
  poll_interval: number;
}

export interface PollResponse {
  status: 'pending' | 'authorized' | 'denied' | 'expired';
  code?: string;
  expires_in?: number;
  reason?: string;
  error?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  customer_id: string;
  email: string;
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

export interface JSONRPCResponse<T = any> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

export interface SCPOrder {
  order_id: string;
  date: string;
  total: number;
  currency: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  tracking_number?: string;
  tracking_url?: string;
  estimated_delivery?: string;
  items: SCPOrderItem[];
}

export interface SCPOrderItem {
  product_id: string;
  name: string;
  sku?: string;
  size?: string;
  color?: string;
  quantity: number;
  price: number;
  image_url?: string;
  product_url?: string;
}

export interface SCPLoyalty {
  program_name: string;
  member_id: string;
  member_since: string;
  tier: string;
  points: {
    current: number;
    lifetime?: number;
    currency_value?: number;
    expiring_soon?: Array<{
      points: number;
      expires_at: string;
    }>;
  };
  benefits: string[];
  next_tier?: {
    name: string;
    points_needed: number;
    benefits: string[];
  };
}

export interface SCPOffer {
  offer_id: string;
  type: 'percentage_discount' | 'fixed_discount' | 'free_shipping' | 'bogo';
  title: string;
  description: string;
  discount_value?: number;
  discount_type?: 'percentage' | 'fixed';
  code?: string;
  valid_from: string;
  valid_until: string;
  min_purchase?: number;
  max_discount?: number;
  applies_to?: {
    categories?: string[];
    brands?: string[];
    product_ids?: string[];
  };
  usage?: {
    times_used: number;
    max_uses?: number;
    remaining_uses?: number;
  };
}

export interface SCPPreferences {
  sizes?: {
    shirt?: string;
    pants?: { waist: number; inseam: number };
    shoe?: string;
    dress?: string;
    hat?: string;
  };
  favorite_brands?: string[];
  style_preferences?: string[];
  saved_addresses?: Array<{
    id: string;
    label: string;
    street: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    is_default: boolean;
  }>;
  communication?: {
    email_marketing: boolean;
    sms_marketing: boolean;
    push_notifications: boolean;
  };
}

export interface SCPIntent {
  intent_id: string;
  customer_id: string;
  base_intent: string;
  mechanism: 'conversational_ai' | 'background_agent' | 'voice_assistant' | 'web_browser' | 'mobile_app' | 'in_store' | 'customer_service';
  ai_assistant?: string;
  ai_session_id?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  status: 'created' | 'active' | 'in_progress' | 'fulfilled' | 'abandoned' | 'expired' | 'archived';
  context: Record<string, any>;
  visibility: 'private' | 'merchant_only' | 'cross_merchant';
  shared_with?: string[];
  milestones?: Array<{
    timestamp: string;
    event: string;
    details: Record<string, any>;
    source: string;
  }>;
}
