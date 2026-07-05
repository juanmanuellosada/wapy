export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_purchase: number | null
          store_id: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_purchase?: number | null
          store_id: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_purchase?: number | null
          store_id?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          plan: string
          status: string
          whatsapp: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          notes?: string | null
          plan: string
          status?: string
          whatsapp: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          plan?: string
          status?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          price_at_purchase: number
          product_id: string | null
          product_name: string
          quantity: number
          section_id: string | null
          section_name: string | null
          unit_price_cents: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          id?: string
          order_id: string
          price_at_purchase?: number
          product_id?: string | null
          product_name: string
          quantity: number
          section_id?: string | null
          section_name?: string | null
          unit_price_cents: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          id?: string
          order_id?: string
          price_at_purchase?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          section_id?: string | null
          section_name?: string | null
          unit_price_cents?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          channel: string
          confirmed_at: string | null
          coupon_code: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: string | null
          discount_cents: number | null
          id: string
          idempotency_key: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          notes: string | null
          payment_status: string
          status: string
          store_id: string
          total_cents: number
        }
        Insert: {
          cancelled_at?: string | null
          channel?: string
          confirmed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          discount_cents?: number | null
          id?: string
          idempotency_key?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          payment_status?: string
          status?: string
          store_id: string
          total_cents: number
        }
        Update: {
          cancelled_at?: string | null
          channel?: string
          confirmed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          discount_cents?: number | null
          id?: string
          idempotency_key?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          payment_status?: string
          status?: string
          store_id?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_types: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          created_at: string
          id: string
          option_type_id: string
          position: number
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_type_id: string
          position?: number
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          option_type_id?: string
          position?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_type_id_fkey"
            columns: ["option_type_id"]
            isOneToOne: false
            referencedRelation: "product_option_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_option_values: {
        Row: {
          option_value_id: string
          variant_id: string
        }
        Insert: {
          option_value_id: string
          variant_id: string
        }
        Update: {
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_option_values_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_option_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          position: number
          price_override: number | null
          product_id: string
          promo_price_override: number | null
          stock: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          position?: number
          price_override?: number | null
          product_id: string
          promo_price_override?: number | null
          stock?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          position?: number
          price_override?: number | null
          product_id?: string
          promo_price_override?: number | null
          stock?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          min_quantity: number
          name: string
          position: number
          price_cents: number
          promo_price_cents: number | null
          qty_step: number
          section_id: string | null
          stock: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_quantity?: number
          name: string
          position?: number
          price_cents: number
          promo_price_cents?: number | null
          qty_step?: number
          section_id?: string | null
          stock?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_quantity?: number
          name?: string
          position?: number
          price_cents?: number
          promo_price_cents?: number | null
          qty_step?: number
          section_id?: string | null
          stock?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_slugs: {
        Row: {
          slug: string
        }
        Insert: {
          slug: string
        }
        Update: {
          slug?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          position: number
          slug: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          position?: number
          slug: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      slug_history: {
        Row: {
          changed_at: string
          id: string
          old_slug: string
          store_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          old_slug: string
          store_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          old_slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slug_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_mp_connections: {
        Row: {
          access_token_enc: string | null
          connected_at: string | null
          created_at: string
          mp_user_id: string | null
          public_key: string | null
          refresh_token_enc: string | null
          revoked_at: string | null
          store_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_enc?: string | null
          connected_at?: string | null
          created_at?: string
          mp_user_id?: string | null
          public_key?: string | null
          refresh_token_enc?: string | null
          revoked_at?: string | null
          store_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_enc?: string | null
          connected_at?: string | null
          created_at?: string
          mp_user_id?: string | null
          public_key?: string | null
          refresh_token_enc?: string | null
          revoked_at?: string | null
          store_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_mp_connections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          blocked_at: string | null
          checkout_mode: string
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          mp_preapproval_id: string | null
          mp_subscription_status: string | null
          name: string
          onboarding_step: number
          owner_id: string
          payment_exempt: boolean
          payment_exempt_reason: string | null
          plan: string
          published_at: string | null
          slug: string
          social_links: Json
          status: string
          subscription_status_changed_at: string | null
          theme: Json
          trial_ends_at: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          blocked_at?: string | null
          checkout_mode?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          mp_preapproval_id?: string | null
          mp_subscription_status?: string | null
          name: string
          onboarding_step?: number
          owner_id: string
          payment_exempt?: boolean
          payment_exempt_reason?: string | null
          plan?: string
          published_at?: string | null
          slug: string
          social_links?: Json
          status?: string
          subscription_status_changed_at?: string | null
          theme?: Json
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          blocked_at?: string | null
          checkout_mode?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          mp_preapproval_id?: string | null
          mp_subscription_status?: string | null
          name?: string
          onboarding_step?: number
          owner_id?: string
          payment_exempt?: boolean
          payment_exempt_reason?: string | null
          plan?: string
          published_at?: string | null
          slug?: string
          social_links?: Json
          status?: string
          subscription_status_changed_at?: string | null
          theme?: Json
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      whitelist: {
        Row: {
          checkout_mode: string | null
          email: string
          grant_role: string
          id: string
          invite_token: string | null
          invited_at: string
          plan: string | null
          registered_at: string | null
          trial_ends_at: string | null
        }
        Insert: {
          checkout_mode?: string | null
          email: string
          grant_role?: string
          id?: string
          invite_token?: string | null
          invited_at?: string
          plan?: string | null
          registered_at?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          checkout_mode?: string | null
          email?: string
          grant_role?: string
          id?: string
          invite_token?: string | null
          invited_at?: string
          plan?: string | null
          registered_at?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: { Args: { uid: string }; Returns: string }
      is_superadmin: { Args: { uid: string }; Returns: boolean }
      storefront_co_purchased: {
        Args: { p_limit?: number; p_product_id: string; p_store_id: string }
        Returns: {
          co_orders: number
          product_id: string
        }[]
      }
      storefront_top_sellers: {
        Args: { p_days?: number; p_limit?: number; p_store_id: string }
        Returns: {
          product_id: string
          units_sold: number
        }[]
      }
      whitelist_check_email: {
        Args: { p_email: string }
        Returns: {
          allowed: boolean
          invite_token: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
